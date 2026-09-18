import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { Pedidos } from './pedidos';

describe('Pedidos', () => {
  let service: Pedidos;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(Pedidos);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should list pedidos with a GET to /pedidos', async () => {
    const promise = service.list();
    const req = httpMock.expectOne('http://localhost:3000/pedidos');
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 1, nombre: 'Prueba', destino: '150101-Av 1', estado: 'no_asignado' }]);

    const pedidos = await promise;
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].destino).toBe('150101-Av 1');
  });

  it('should create a pedido wrapping payload in { pedido }', async () => {
    const promise = service.create({ nombre: 'Pizza', destino: '150101-Centro' });
    const req = httpMock.expectOne('http://localhost:3000/pedidos');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      pedido: { nombre: 'Pizza', destino: '150101-Centro' },
    });
    req.flush({ id: 2, nombre: 'Pizza', destino: '150101-Centro', estado: 'no_asignado' });

    const pedido = await promise;
    expect(pedido.id).toBe(2);
  });

  it('should delete a pedido with DELETE /pedidos/:id', async () => {
    const promise = service.remove(7);
    const req = httpMock.expectOne('http://localhost:3000/pedidos/7');
    expect(req.request.method).toBe('DELETE');
    req.flush({ deleted: true });

    expect(await promise).toEqual({ deleted: true });
  });
});