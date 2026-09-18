import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { Toast } from '../toast/toast';

export const GOOGLE_CLIENT_ID = window.__env?.GOOGLE_CLIENT_ID ?? '';
const API_URL = window.__env?.API_URL ?? 'http://localhost:3000';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const REFRESH_ISSUED_AT_KEY = 'refresh_token_issued_at';
const USER_KEY = 'user';
const EXPIRY_SKEW_MS = 10_000;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AuthUser {
  id: number;
  nombre: string;
  foto: string | null;
  email: string | null;
}

interface SessionResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(Toast);

  private readonly userSignal = signal<AuthUser | null>(null);
  private readonly sessionExpiredSignal = signal(false);
  private readonly readySignal = signal(false);
  private refreshPromise: Promise<string> | null = null;

  readonly user = this.userSignal.asReadonly();
  readonly sessionExpired = this.sessionExpiredSignal.asReadonly();
  readonly ready = this.readySignal.asReadonly();

  async loginGoogle(): Promise<AuthUser> {
    await this.loadGoogleSdk();

    const credential = await this.getGoogleCredential();

    const session = await lastValueFrom(
      this.http.post<SessionResult>(`${API_URL}/auth/login/google`, {
        token: credential,
        tipo: 'cliente',
      }),
    );

    this.storeSession(session);
    this.sessionExpiredSignal.set(false);
    return session.user;
  }

  async logout(): Promise<void> {
    const refreshToken = this.getRefreshToken();

    if (refreshToken) {
      try {
        await lastValueFrom(
          this.http.post(`${API_URL}/auth/logout`, { refreshToken }),
        );
      } catch {
        // El logout local no debe depender de la red.
      }
    }

    this.clearSession(false);
  }

  /**
   * Se llama al iniciar la app. Si hay algo en storage pero el access token ya
   * no es válido, valida contra el backend (el interceptor intentará refrescar
   * con el refresh token). Si no se puede recuperar, limpia y marca la sesión
   * como expirada para que se muestre el botón de login.
   */
  async restoreSession(): Promise<void> {
    const accessToken = this.getAccessToken();
    const refreshToken = this.getRefreshToken();

    if (!accessToken && !refreshToken) {
      this.clearSession(false);
      this.readySignal.set(true);
      return;
    }

    if (accessToken && !this.isExpired(accessToken)) {
      const cached = this.getStoredUser();
      if (cached) {
        this.userSignal.set(cached);
        this.readySignal.set(true);
        return;
      }
    }

    try {
      const user = await lastValueFrom(
        this.http.get<AuthUser>(`${API_URL}/auth/me`),
      );
      this.userSignal.set(user);
      this.sessionExpiredSignal.set(false);
    } catch {
      this.clearSession(true);
    } finally {
      this.readySignal.set(true);
    }
  }

  /**
   * Refresca la sesión con el refresh token. Deduplica llamadas concurrentes:
   * varios 401 simultáneos comparten la misma promesa.
   */
  async refreshSession(): Promise<string> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.runRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  getAccessToken(): string | null {
    return this.readStored(ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return this.readStored(REFRESH_TOKEN_KEY);
  }

  canRefresh(): boolean {
    return !!this.getRefreshToken();
  }

  /** Ms que restan del access token vigente, o null si no hay token o no expira. */
  getAccessTokenTtlMs(): number | null {
    const token = this.getAccessToken();
    if (!token) {
      return null;
    }
    const payload = this.decodeToken(token);
    if (!payload?.exp) {
      return null;
    }
    return payload.exp * 1000 - Date.now();
  }

  /**
   * Ms que restan del refresh token. El token es opaco (string aleatorio), su
   * expiración real vive en la DB; acá se aproxima desde el momento en que se
   * emitió la sesión y el TTL por defecto del backend (7 días).
   */
  getRefreshTokenTtlMs(): number | null {
    const issuedAt = Number(
      this.readStored(REFRESH_ISSUED_AT_KEY),
    );
    if (!issuedAt || !this.getRefreshToken()) {
      return null;
    }
    return issuedAt + REFRESH_TOKEN_TTL_MS - Date.now();
  }

  clearSession(expired = false): void {
    const hadSession =
      !!this.getAccessToken() ||
      !!this.getRefreshToken() ||
      this.userSignal() !== null;
    const wasExpired = this.sessionExpiredSignal();

    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(REFRESH_ISSUED_AT_KEY);
    localStorage.removeItem(USER_KEY);
    this.userSignal.set(null);
    this.sessionExpiredSignal.set(expired);

    if (expired && hadSession && !wasExpired) {
      this.toast.error('Tu sesión expiró. Volvé a iniciar sesión.');
    }
  }

  private async runRefresh(): Promise<string> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No hay refresh token');
    }

    try {
      const session = await lastValueFrom(
        this.http.post<SessionResult>(`${API_URL}/auth/refresh`, {
          refreshToken,
        }),
      );
      this.storeSession(session);
      this.sessionExpiredSignal.set(false);
      return session.accessToken;
    } catch (error) {
      this.clearSession(true);
      throw error;
    }
  }

  private storeSession(session: SessionResult): void {
    if (!session?.accessToken || !session?.refreshToken) {
      throw new Error('El servidor no devolvió los tokens de sesión');
    }

    localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
    localStorage.setItem(REFRESH_ISSUED_AT_KEY, String(Date.now()));
    localStorage.setItem(USER_KEY, JSON.stringify(session.user));
    this.userSignal.set(session.user);
  }

  private getStoredUser(): AuthUser | null {
    try {
      const raw = this.readStored(USER_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  }

  /** Trata como ausente cualquier valor vacío o el string "undefined"/"null". */
  private readStored(key: string): string | null {
    const value = localStorage.getItem(key);
    if (!value || value === 'undefined' || value === 'null') {
      return null;
    }
    return value;
  }

  private isExpired(token: string): boolean {
    const payload = this.decodeToken(token);
    if (!payload?.exp) {
      return true;
    }
    return payload.exp * 1000 <= Date.now() + EXPIRY_SKEW_MS;
  }

  private decodeToken(token: string): { exp?: number } | null {
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(
        base64.length + ((4 - (base64.length % 4)) % 4),
        '=',
      );
      return JSON.parse(atob(padded)) as { exp?: number };
    } catch {
      return null;
    }
  }

  private getGoogleCredential(): Promise<string> {
    return new Promise((resolve, reject) => {
      const gsi = window.google;
      if (!gsi) {
        reject(new Error('Google Identity Services no disponible'));
        return;
      }

      gsi.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => resolve(response.credential),
      });

      gsi.accounts.id.prompt();
    });
  }

  private loadGoogleSdk(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.google?.accounts) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error('No se pudo cargar Google Identity Services'));
      document.head.appendChild(script);
    });
  }
}
