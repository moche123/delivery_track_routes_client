import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

const API_URL = window.__env?.API_URL ?? 'http://localhost:3000';

export type PedidoEstado =
  | 'no_asignado'
  | 'asignado'
  | 'eliminado'
  | 'entregado';

export interface Pedido {
  id: number;
  nombre: string;
  ubicacion: string | null;
  estado: PedidoEstado;
  destino: string;
  foto: string | null;
}

export interface CrearPedidoInput {
  nombre: string;
  destino: string;
}

@Injectable({ providedIn: 'root' })
export class Pedidos {
  private readonly http = inject(HttpClient);

  list(): Promise<Pedido[]> {
    return lastValueFrom(this.http.get<Pedido[]>(`${API_URL}/pedidos`));
  }

  create(input: CrearPedidoInput): Promise<Pedido> {
    return lastValueFrom(
      this.http.post<Pedido>(`${API_URL}/pedidos`, { pedido: input }),
    );
  }

  update(id: number, input: CrearPedidoInput): Promise<Pedido> {
    return lastValueFrom(
      this.http.patch<Pedido>(`${API_URL}/pedidos/${id}`, { pedido: input }),
    );
  }

  remove(id: number): Promise<{ deleted: boolean }> {
    return lastValueFrom(
      this.http.delete<{ deleted: boolean }>(`${API_URL}/pedidos/${id}`),
    );
  }
}