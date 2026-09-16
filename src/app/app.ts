import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Auth, LoginResult } from './services/auth/auth';
import { Toast } from './services/toast/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly user = signal<LoginResult['user'] | null>(null);

  // constructor(private readonly auth: Auth) {}
  private readonly auth = inject(Auth);
  private readonly toast = inject(Toast);

  async loginGoogle() {
    try {
      const { user } = await this.auth.loginGoogle();
      this.toast.success(`Bienvenido ${user.nombre}`);
      this.user.set(user);
    } catch (error) {
      this.toast.error(`Error al iniciar sesión con Google: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}