/** Copia de `socket_contracts.ts` (raíz del repo) — mismo motivo que backend/socket_contracts.ts: Angular no resuelve imports fuera de `client/`. */

export interface Punto {
  lat: number;
  lng: number;
}

export interface ActualizacionUbicacionPedidoPayload {
  pedido_id: number;
  driver_id: number;
  lat: number;
  lng: number;
  timestamp: string;
}

export interface AsignacionPedidoPayload {
  pedido_id: number;
  driver_id: number;
  actualizado_en: string;
}

export interface CancelacionPedidoPayload {
  pedido_id: number;
  cancelado_por: 'driver' | 'cliente';
  actualizado_en: string;
}

export interface PedidoEntregadoPayload {
  pedido_id: number;
  actualizado_en: string;
}

export interface ActualizacionRutaPedidoPayload {
  pedido_id: number;
  new_route: Punto[];
}

export type SocketEvent =
  | 'actualizacion_ubicacion_pedido'
  | 'asignacion_pedido'
  | 'cancelacion_pedido'
  | 'pedido_entregado'
  | 'actualizacion_ruta_pedido';

export type SocketPayloadMap = {
  actualizacion_ubicacion_pedido: ActualizacionUbicacionPedidoPayload;
  asignacion_pedido: AsignacionPedidoPayload;
  cancelacion_pedido: CancelacionPedidoPayload;
  pedido_entregado: PedidoEntregadoPayload;
  actualizacion_ruta_pedido: ActualizacionRutaPedidoPayload;
};
