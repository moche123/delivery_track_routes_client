import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import * as L from 'leaflet';
import { RealtimeSocket } from '../../../services/socket/socket';
import type { Pedido } from '../../../services/pedidos/pedidos';

const CENTRO_LIMA: L.LatLngTuple = [-12.046374, -77.042793];

/** Casco — mismo emoji que usa el mapa del rider en React Native, para que sea el mismo lenguaje visual en las dos apps. */
const ICONO_RIDER = L.divIcon({
  className: '',
  html: `<div style="
    width: 36px; height: 36px;
    border-radius: 9999px;
    background: #fff;
    border: 2px solid #208AEF;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px;
    box-shadow: 0 2px 6px rgba(0,0,0,.35);
  ">🪖</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

/** El destino del pedido — el "objetivo" al que va el rider. */
const ICONO_OBJETIVO = L.divIcon({
  className: '',
  html: `<div style="
    width: 34px; height: 34px;
    border-radius: 9999px;
    background: #E0433D;
    border: 3px solid #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px;
    box-shadow: 0 2px 6px rgba(0,0,0,.35);
  ">🏁</div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

/**
 * Mapa en vivo de UN pedido puntual: solo dos marcadores (rider y destino),
 * sin trazar ninguna ruta/línea — a propósito, es lo que pidió el negocio
 * para esta vista (distinto del mapa completo del rider en `rider/`, que sí
 * dibuja la línea). Se abre en un modal, uno por pedido.
 */
@Component({
  selector: 'app-mapa-pedido-modal',
  templateUrl: './mapa-pedido-modal.html',
})
export class MapaPedidoModal implements OnDestroy {
  @Input({ required: true }) pedido!: Pedido;
  @Output() cerrar = new EventEmitter<void>();

  @ViewChild('mapaDiv', { static: false })
  private readonly mapaDiv!: ElementRef<HTMLDivElement>;

  private readonly socket = inject(RealtimeSocket);

  protected readonly esperandoRider = signal(true);

  private map: L.Map | null = null;
  private riderMarker: L.Marker | null = null;
  private desuscribirSocket: (() => void) | null = null;

  constructor() {
    afterNextRender(() => this.initMap());
  }

  private initMap(): void {
    const el = this.mapaDiv?.nativeElement;
    if (!el) {
      return;
    }

    const destino = this.coordenadasDestino();

    this.map = L.map(el, { zoomControl: true }).setView(destino, 15);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(this.map);

    L.marker(destino, { icon: ICONO_OBJETIVO }).addTo(this.map);

    // El div del mapa recién queda con su tamaño final una vez que el
    // browser termina de pintar el modal — sin esto, Leaflet a veces mide
    // 0x0 (setTimeout(...,0) puede correr antes del layout) y queda en blanco.
    requestAnimationFrame(() => this.map?.invalidateSize());

    this.desuscribirSocket = this.socket.on('actualizacion_ubicacion_pedido', (payload) => {
      if (payload.pedido_id !== this.pedido.id || !this.map) {
        return;
      }

      this.esperandoRider.set(false);
      const posicion: L.LatLngTuple = [payload.lat, payload.lng];

      if (this.riderMarker) {
        this.riderMarker.setLatLng(posicion);
      } else {
        this.riderMarker = L.marker(posicion, { icon: ICONO_RIDER }).addTo(this.map);
      }

      // Reencuadra para que siempre entren los dos puntos — si no, uno de
      // los dos (normalmente el rider, que puede estar lejos del destino)
      // queda fuera de cámara y parece que "no está".
      this.map.fitBounds(L.latLngBounds([destino, posicion]), {
        padding: [40, 40],
        maxZoom: 16,
      });
    });
  }

  private coordenadasDestino(): L.LatLngTuple {
    const [, coordsStr] = this.pedido.destino.split('|');
    const [lat, lng] = (coordsStr ?? '').split(',').map(Number);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : CENTRO_LIMA;
  }

  cerrarModal(): void {
    this.cerrar.emit();
  }

  ngOnDestroy(): void {
    this.desuscribirSocket?.();
    this.map?.remove();
  }
}
