import { Injectable, inject } from '@angular/core';
import { Socket, io } from 'socket.io-client';
import { Auth } from '../auth/auth';
import type { SocketEvent, SocketPayloadMap } from './socket-contracts';

const API_URL = window.__env?.API_URL ?? 'http://localhost:3000';

/**
 * Una sola conexión de socket compartida por sesión, al namespace `/realtime`
 * del backend. El JWT se manda en `auth` como función (no objeto fijo) para
 * que en cada reconexión se reenvíe el access token vigente, no el de cuando
 * se abrió la pestaña.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeSocket {
  private readonly auth = inject(Auth);
  private socket: Socket | null = null;

  /** Se suscribe a un evento. Devuelve la función para desuscribirse. */
  on<E extends SocketEvent>(evento: E, callback: (payload: SocketPayloadMap[E]) => void): () => void {
    // socket.io-client tipa sus eventos contra un ListenerMap genérico que no
    // unifica con un `evento: E` genérico — la firma pública de arriba ya
    // garantiza el tipo correcto en cada callsite, así que acá se maneja sin
    // tipar (equivalente a lo que hace la librería internamente).
    const socket = this.conectar() as unknown as {
      on(evento: string, callback: (...args: unknown[]) => void): void;
      off(evento: string, callback: (...args: unknown[]) => void): void;
    };
    const callbackSinTipar = callback as (...args: unknown[]) => void;
    socket.on(evento, callbackSinTipar);
    return () => socket.off(evento, callbackSinTipar);
  }

  private conectar(): Socket {
    if (!this.socket) {
      this.socket = io(`${API_URL}/realtime`, {
        auth: (cb) => cb({ token: this.auth.getAccessToken() }),
      });
    }
    return this.socket;
  }
}
