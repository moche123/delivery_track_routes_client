import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import * as L from 'leaflet';
import { districts, provinces, regions } from '@perucode/ubigeo-peru';
import {
  Pedidos as PedidosService,
  type Pedido,
  type PedidoEstado,
} from '../../services/pedidos/pedidos';
import { RealtimeSocket } from '../../services/socket/socket';
import { Toast } from '../../services/toast/toast';

const UBIGEO_POR_DEFECTO = '000000';
const CENTRO_LIMA: L.LatLngTuple = [-12.046374, -77.042793];
const ZOOM_INICIAL = 12;
const ZOOM_DISTRITO = 14;
const ZOOM_BUSQUEDA = 17;
const BUSQUEDA_MIN_LARGO = 3;
const BUSQUEDA_DEBOUNCE_MS = 400;
const DESTINO_LUGAR_MAX_LARGO = 200;
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';

interface UbigeoItem {
  id: number;
  name: string;
  ineiCode: string;
}

interface ResultadoBusqueda {
  display_name: string;
  lat: string;
  lon: string;
}

interface LatLngSeleccion {
  lat: number;
  lng: number;
}

const FILTROS: Array<'todos' | PedidoEstado> = [
  'todos',
  'no_asignado',
  'asignado',
  'entregado',
  'eliminado',
];

const ESTADO_BADGE: Record<PedidoEstado, string> = {
  no_asignado: 'bg-gray-100 text-gray-700',
  asignado: 'bg-blue-100 text-blue-700',
  entregado: 'bg-green-100 text-green-700',
  eliminado: 'bg-red-100 text-red-700 line-through',
};

const PIN_ICON = L.divIcon({
  className: '',
  html: `<div style="
    width: 34px; height: 34px;
    border-radius: 9999px;
    background: #3b82f6;
    border: 3px solid #fff;
    box-shadow: 0 2px 6px rgba(0,0,0,.35);
  "></div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

@Component({
  selector: 'app-pedidos',
  templateUrl: './pedidos.html',
})
export class Pedidos implements OnInit, OnDestroy {
  private readonly pedidosService = inject(PedidosService);
  private readonly socket = inject(RealtimeSocket);
  private readonly toast = inject(Toast);
  private readonly desuscribirSocket: Array<() => void> = [];

  @ViewChild('mapaDiv', { static: false })
  private readonly mapaDiv!: ElementRef<HTMLDivElement>;

  protected readonly pestana = signal<'crear' | 'listar' | 'editar'>('crear');
  protected readonly pestanaSet = this.pestana.set;
  protected readonly pedidoEditando = signal<Pedido | null>(null);
  protected readonly regionSel = signal<UbigeoItem | null>(null);
  protected readonly provinciaSel = signal<UbigeoItem | null>(null);
  protected readonly distritoSel = signal<UbigeoItem | null>(null);

  protected readonly regiones = signal<UbigeoItem[]>([]);
  protected readonly provincias = computed(() => {
    const region = this.regionSel();
    return region
      ? provinces.byRegionId(region.id) as unknown as UbigeoItem[]
      : [];
  });
  protected readonly distritos = computed(() => {
    const provincia = this.provinciaSel();
    return provincia
      ? districts.byProvinceId(provincia.id) as unknown as UbigeoItem[]
      : [];
  });
  protected readonly estadoBadge = ESTADO_BADGE;
  protected readonly nombre = signal('');
  protected readonly latlng = signal<LatLngSeleccion | null>(null);
  protected readonly geocodificando = signal(false);
  protected readonly centrandoMapa = signal(false);
  protected readonly busqueda = signal('');
  protected readonly resultadosBusqueda = signal<ResultadoBusqueda[]>([]);
  protected readonly buscandoLugar = signal(false);
  protected readonly direccionDetectada = signal('');
  protected readonly ubigeo = signal(UBIGEO_POR_DEFECTO);
  protected readonly cargando = signal(false);
  protected readonly enviando = signal(false);
  protected readonly pedidos = signal<Pedido[]>([]);
  protected readonly filtroEstado = signal<'todos' | PedidoEstado>('todos');

  protected readonly destino = computed(() => {
    const dir = this.direccionDetectada().trim();
    const coords = this.latlng();
    if (!dir || !coords) {
      return '';
    }
    const code = this.ubigeo().trim() || UBIGEO_POR_DEFECTO;
    const lugar = dir.slice(0, DESTINO_LUGAR_MAX_LARGO);
    return `${code}|${coords.lat.toFixed(6)},${coords.lng.toFixed(6)}|${lugar}`;
  });

  protected readonly puedeEnviar = computed(
    () => !!this.nombre().trim() && !!this.latlng() && !!this.destino(),
  );

  protected readonly pedidosFiltrados = computed(() => {
    if (this.filtroEstado() === 'todos') {
      return this.pedidos();
    }
    return this.pedidos().filter((p) => p.estado === this.filtroEstado());
  });

  private map: L.Map | null = null;
  private marker: L.Marker | null = null;
  private distritosCache: UbigeoItem[] = [];
  private readonly coordsDistritoCache = new Map<number, L.LatLngTuple>();
  private busquedaTimeout: ReturnType<typeof setTimeout> | null = null;
  private busquedaId = 0;

  constructor() {
    afterNextRender(() => this.initMap());
  }

  async ngOnInit(): Promise<void> {
    this.regiones.set(regions.all() as unknown as UbigeoItem[]);
    await this.cargar();

    // Actualiza el pedido puntual en memoria cuando el rider lo toma/cancela/
    // entrega — sin refetch completo. Si el pedido_id no está en mi lista
    // (no es mío), el map() no encuentra nada y no hace nada.
    this.desuscribirSocket.push(
      this.socket.on('asignacion_pedido', (payload) =>
        this.actualizarEstadoLocal(payload.pedido_id, 'asignado', payload.actualizado_en),
      ),
      this.socket.on('cancelacion_pedido', (payload) =>
        this.actualizarEstadoLocal(payload.pedido_id, 'no_asignado', payload.actualizado_en),
      ),
      this.socket.on('pedido_entregado', (payload) =>
        this.actualizarEstadoLocal(payload.pedido_id, 'entregado', payload.actualizado_en),
      ),
    );
  }

  ngOnDestroy(): void {
    this.desuscribirSocket.forEach((desuscribir) => desuscribir());
  }

  private actualizarEstadoLocal(pedidoId: number, estado: PedidoEstado, actualizadoEn: string): void {
    this.pedidos.update((actuales) =>
      actuales.map((p) => (p.id === pedidoId ? { ...p, estado, actualizadoEn } : p)),
    );
  }

  seleccionarRegion(id: string): void {
    const regionId = Number(id);
    const region = this.regiones().find((r) => r.id === regionId) ?? null;
    this.regionSel.set(region);
    this.provinciaSel.set(null);
    this.distritoSel.set(null);
    this.busqueda.set('');
    this.resultadosBusqueda.set([]);
  }

  seleccionarProvincia(id: string): void {
    const provinciaId = Number(id);
    const provincia =
      this.provincias().find((p) => p.id === provinciaId) ?? null;
    this.provinciaSel.set(provincia);
    this.distritoSel.set(null);
    this.busqueda.set('');
    this.resultadosBusqueda.set([]);
  }

  async seleccionarDistrito(id: string): Promise<void> {
    const distritoId = Number(id);
    const distrito = this.distritos().find((d) => d.id === distritoId) ?? null;
    this.distritoSel.set(distrito);

    const region = this.regionSel();
    const provincia = this.provinciaSel();
    if (!distrito || !region || !provincia) {
      return;
    }

    this.ubigeo.set(distrito.ineiCode);
    this.direccionDetectada.set(
      `${distrito.name}, ${provincia.name}, ${region.name}`,
    );

    this.centrandoMapa.set(true);
    try {
      const coords = await this.geocodificarDistrito(
        region,
        provincia,
        distrito,
      );
      if (coords && this.map) {
        this.map.setView(coords, ZOOM_DISTRITO);
      }
    } finally {
      this.centrandoMapa.set(false);
    }
  }

  onBusquedaInput(valor: string): void {
    this.busqueda.set(valor);
    if (this.busquedaTimeout) {
      clearTimeout(this.busquedaTimeout);
    }

    const texto = valor.trim();
    if (texto.length < BUSQUEDA_MIN_LARGO) {
      this.resultadosBusqueda.set([]);
      this.buscandoLugar.set(false);
      return;
    }

    this.busquedaTimeout = setTimeout(
      () => void this.buscarLugares(texto),
      BUSQUEDA_DEBOUNCE_MS,
    );
  }

  private async buscarLugares(texto: string): Promise<void> {
    const id = ++this.busquedaId;
    this.buscandoLugar.set(true);

    const url = new URL(NOMINATIM_SEARCH_URL);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('q', texto);
    url.searchParams.set('countrycodes', 'pe');
    url.searchParams.set('limit', '5');
    url.searchParams.set('accept-language', 'es');

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Nominatim respondió ${response.status}`);
      }
      const data = (await response.json()) as ResultadoBusqueda[];
      if (id === this.busquedaId) {
        this.resultadosBusqueda.set(data);
      }
    } catch {
      if (id === this.busquedaId) {
        this.resultadosBusqueda.set([]);
        this.toast.error('No se pudo buscar el lugar');
      }
    } finally {
      if (id === this.busquedaId) {
        this.buscandoLugar.set(false);
      }
    }
  }

  async elegirResultadoBusqueda(resultado: ResultadoBusqueda): Promise<void> {
    const latlng = L.latLng(Number(resultado.lat), Number(resultado.lon));
    this.busqueda.set(resultado.display_name);
    this.resultadosBusqueda.set([]);

    if (this.map) {
      this.map.setView(latlng, ZOOM_BUSQUEDA);
    }
    await this.colocarMarcador(latlng);
  }

  private async geocodificarDistrito(
    region: UbigeoItem,
    provincia: UbigeoItem,
    distrito: UbigeoItem,
  ): Promise<L.LatLngTuple | null> {
    const cacheado = this.coordsDistritoCache.get(distrito.id);
    if (cacheado) {
      return cacheado;
    }

    const url = new URL(NOMINATIM_SEARCH_URL);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'pe');
    url.searchParams.set(
      'q',
      `${distrito.name}, ${provincia.name}, ${region.name}, Perú`,
    );

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      const data = (await response.json()) as Array<{
        lat: string;
        lon: string;
      }>;
      if (!data.length) {
        return null;
      }
      const coords: L.LatLngTuple = [Number(data[0].lat), Number(data[0].lon)];
      this.coordsDistritoCache.set(distrito.id, coords);
      return coords;
    } catch {
      this.toast.error('No se pudo centrar el mapa en el distrito');
      return null;
    }
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      this.pedidos.set(await this.pedidosService.list());
    } catch (error) {
      this.toast.error(
        `No se pudieron cargar los pedidos: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.cargando.set(false);
    }
  }

  cambiarPestana(p: 'crear' | 'listar'): void {
    this.pedidoEditando.set(null);
    this.pestana.set(p);
    if (p === 'crear') {
      this.remontarMapa();
    }
  }

  iniciarEdicion(pedido: Pedido): void {
    const [ubigeoCode, coordsStr, lugar] = pedido.destino.split('|');
    const [latStr, lngStr] = (coordsStr ?? '').split(',');
    const lat = Number(latStr);
    const lng = Number(lngStr);

    this.pedidoEditando.set(pedido);
    this.nombre.set(pedido.nombre);
    this.ubigeo.set(ubigeoCode || UBIGEO_POR_DEFECTO);
    this.direccionDetectada.set(lugar ?? '');
    this.busqueda.set('');
    this.resultadosBusqueda.set([]);
    this.latlng.set(
      Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
    );

    const jerarquia = this.buscarJerarquia(ubigeoCode);
    this.regionSel.set(jerarquia?.region ?? null);
    this.provinciaSel.set(jerarquia?.provincia ?? null);
    this.distritoSel.set(jerarquia?.distrito ?? null);

    this.pestana.set('editar');
    this.remontarMapa();
  }

  cancelarEdicion(): void {
    this.resetFormulario();
    this.pestana.set('listar');
  }

  private remontarMapa(): void {
    this.map?.remove();
    this.map = null;
    this.marker = null;
    requestAnimationFrame(() => this.initMap());
  }

  private buscarJerarquia(
    ineiCode: string,
  ): { region: UbigeoItem; provincia: UbigeoItem; distrito: UbigeoItem } | null {
    for (const region of regions.all() as unknown as UbigeoItem[]) {
      for (const provincia of provinces.byRegionId(
        region.id,
      ) as unknown as UbigeoItem[]) {
        const distrito = (
          districts.byProvinceId(provincia.id) as unknown as UbigeoItem[]
        ).find((d) => d.ineiCode === ineiCode);
        if (distrito) {
          return { region, provincia, distrito };
        }
      }
    }
    return null;
  }

  urlMapa(coordenadas: string): string {
    const [lat, lng] = coordenadas.split(',').map((v) => v.trim());
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;
  }

  destinoLugar(destino: string): string {
    const [, , lugar] = destino.split('|');
    return lugar ?? destino;
  }

  horaActualizacion(actualizadoEn: string): string {
    return new Date(actualizadoEn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async crear(event: Event): Promise<void> {
    event.preventDefault();
    const nombre = this.nombre().trim();
    const coords = this.latlng();
    const destino = this.destino();

    if (!nombre || !coords) {
      this.toast.error('Completá el nombre y marcá el punto en el mapa');
      return;
    }
    if (!destino) {
      this.toast.error('Esperá a que se detecte la dirección');
      return;
    }

    this.enviando.set(true);
    try {
      const editando = this.pedidoEditando();
      if (editando) {
        await this.pedidosService.update(editando.id, { nombre, destino });
        this.toast.success(`Pedido «${nombre}» actualizado correctamente`);
      } else {
        await this.pedidosService.create({ nombre, destino });
        this.toast.success(
          `Pedido «${nombre}» creado con coordenadas exactas`,
        );
      }
      this.resetFormulario();
      await this.cargar();
      this.pestana.set('listar');
    } catch (error) {
      this.toast.error(
        `No se pudo guardar el pedido: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.enviando.set(false);
    }
  }

  async eliminar(pedido: Pedido): Promise<void> {
    try {
      await this.pedidosService.remove(pedido.id);
      this.toast.info(`Pedido #${pedido.id} marcado como eliminado`);
      await this.cargar();
    } catch (error) {
      this.toast.error(
        `No se pudo eliminar: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private initMap(): void {
    if (this.map) {
      return;
    }
    const el = this.mapaDiv?.nativeElement;
    if (!el) {
      return;
    }

    this.map = L.map(el, { zoomControl: true }).setView(
      CENTRO_LIMA,
      ZOOM_INICIAL,
    );

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(this.map);

    this.map.on('click', (evento: L.LeafletMouseEvent) => {
      void this.colocarMarcador(evento.latlng);
    });

    const coords = this.latlng();
    if (coords) {
      this.marker = L.marker([coords.lat, coords.lng], {
        icon: PIN_ICON,
      }).addTo(this.map);
      this.map.setView([coords.lat, coords.lng], ZOOM_BUSQUEDA);
    }
  }

  private async colocarMarcador(latlng: L.LatLng): Promise<void> {
    if (!this.map) {
      return;
    }

    if (this.marker) {
      this.marker.setLatLng(latlng);
    } else {
      this.marker = L.marker(latlng, { icon: PIN_ICON }).addTo(this.map);
    }

    this.latlng.set({ lat: latlng.lat, lng: latlng.lng });
    this.geocodificando.set(true);
    this.direccionDetectada.set('');

    try {
      const { ubigeo, direccion } = await this.reverseGeocode(
        latlng.lat,
        latlng.lng,
      );
      this.ubigeo.set(ubigeo);
      this.direccionDetectada.set(direccion);
    } catch {
      this.direccionDetectada.set(
        `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`,
      );
      this.ubigeo.set(UBIGEO_POR_DEFECTO);
      this.toast.error(
        'No se pudo detectar la dirección; se usa la coordenada exacta',
      );
    } finally {
      this.geocodificando.set(false);
    }
  }

  private async reverseGeocode(
    lat: number,
    lng: number,
  ): Promise<{ ubigeo: string; direccion: string }> {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lng));
    url.searchParams.set('zoom', '18');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'es');

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Nominatim respondió ${response.status}`);
    }

    const data = (await response.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    const address = data.address ?? {};

    const direccion = [
      address['road'] ?? address['pedestrian'] ?? address['footway'],
      address['house_number'],
      address['suburb'] ??
        address['city_district'] ??
        address['town'] ??
        address['municipality'],
      address['city'] ?? address['county'] ?? address['state'],
      address['postcode'],
    ]
      .filter(Boolean)
      .join(', ');

    const ubigeo = this.buscarUbigeo(address);
    return {
      ubigeo,
      direccion: direccion || data.display_name || '',
    };
  }

  private buscarUbigeo(address: Record<string, string>): string {
    const candidatos = [
      address['district'],
      address['city_district'],
      address['suburb'],
      address['municipality'],
      address['town'],
      address['city'],
      address['county'],
      address['state'],
    ]
      .filter(Boolean)
      .map((nombre) => this.normalizar(nombre));

    if (candidatos.length === 0) {
      return UBIGEO_POR_DEFECTO;
    }

    const distritos = this.todosLosDistritos();
    for (const candidato of candidatos) {
      const exacto = distritos.find(
        (d) => this.normalizar(d.name) === candidato,
      );
      if (exacto) {
        return exacto.ineiCode;
      }
    }
    for (const candidato of candidatos) {
      const parcial = distritos.find((d) =>
        this.normalizar(d.name).includes(candidato),
      );
      if (parcial) {
        return parcial.ineiCode;
      }
    }
    return UBIGEO_POR_DEFECTO;
  }

  private todosLosDistritos(): UbigeoItem[] {
    if (this.distritosCache.length > 0) {
      return this.distritosCache;
    }

    const todos: UbigeoItem[] = [];
    for (const region of regions.all() as unknown as UbigeoItem[]) {
      for (const provincia of provinces.byRegionId(
        region.id,
      ) as unknown as UbigeoItem[]) {
        todos.push(
          ...(districts.byProvinceId(
            provincia.id,
          ) as unknown as UbigeoItem[]),
        );
      }
    }
    this.distritosCache = todos;
    return todos;
  }

  private normalizar(texto: string): string {
    return texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private resetFormulario(): void {
    this.pedidoEditando.set(null);
    this.nombre.set('');
    this.latlng.set(null);
    this.ubigeo.set(UBIGEO_POR_DEFECTO);
    this.direccionDetectada.set('');
    this.regionSel.set(null);
    this.provinciaSel.set(null);
    this.distritoSel.set(null);
    this.busqueda.set('');
    this.resultadosBusqueda.set([]);
    if (this.marker && this.map) {
      this.map.removeLayer(this.marker);
      this.marker = null;
    }
  }
}
