import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

export const GOOGLE_CLIENT_ID = window.__env?.GOOGLE_CLIENT_ID ?? '';
const API_URL = window.__env?.API_URL ?? 'http://localhost:3000';

export interface LoginResult {
  token: string;
  user: { id: number; nombre: string; foto: string | null; email: string | null };
}

@Injectable({ providedIn: 'root' })
export class Auth {
  constructor(private readonly http: HttpClient) {}

  async loginGoogle(): Promise<LoginResult> {
    await this.loadGoogleSdk();

    const credential = await this.getGoogleCredential();

    const response = await lastValueFrom(
      this.http.post<LoginResult>(`${API_URL}/auth/login/google`, { token: credential }),
    );

    if (!response?.token) {
      throw new Error('El servidor no devolvió un token de sesión');
    }

    localStorage.setItem('access_token', response.token);
    localStorage.setItem('user', JSON.stringify(response.user));
    return response;
  }

  getAccessToken(): string | null {
    return localStorage.getItem('access_token');
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