import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { NgxSonnerToaster } from 'ngx-sonner';
import { Auth } from './services/auth/auth';
import { Toast } from './services/toast/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, NgxSonnerToaster],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  private readonly auth = inject(Auth);
  private readonly toast = inject(Toast);
  private readonly router = inject(Router);
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly user = this.auth.user;
  protected readonly sessionExpired = this.auth.sessionExpired;
  protected readonly ready = this.auth.ready;
  protected readonly accessCountdown = signal<string>('–');
  protected readonly refreshCountdown = signal<string>('–');

  async ngOnInit(): Promise<void> {
    await this.auth.restoreSession();
    this.restartCountdown();
  }

  async loginGoogle(): Promise<void> {
    try {
      const user = await this.auth.loginGoogle();
      this.toast.success(`Bienvenido ${user.nombre}`);
      this.restartCountdown();
      await this.router.navigateByUrl('/pedidos');
    } catch (error) {
      this.toast.error(
        `Error al iniciar sesión con Google: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.toast.info('Sesión cerrada');
    this.stopCountdown();
    await this.router.navigateByUrl('/');
  }

  ngOnDestroy(): void {
    this.stopCountdown();
  }

  private restartCountdown(): void {
    this.stopCountdown();
    this.updateCountdown();
    this.tickTimer = setInterval(() => this.updateCountdown(), 1000);
  }

  private stopCountdown(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  private updateCountdown(): void {
    if (!this.user()) {
      this.accessCountdown.set('–');
      this.refreshCountdown.set('–');
      return;
    }

    const accessTtl = this.auth.getAccessTokenTtlMs();
    const refreshTtl = this.auth.getRefreshTokenTtlMs();

    if (accessTtl === null && refreshTtl === null) {
      this.stopCountdown();
    }

    this.accessCountdown.set(this.formatCountdown(accessTtl));
    this.refreshCountdown.set(this.formatCountdown(refreshTtl));
  }

  private formatCountdown(ms: number | null): string {
    if (ms === null || ms <= 0) {
      return 'expirado';
    }

    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    const hms = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    return days > 0 ? `${days}d ${hms}` : hms;
  }
}
