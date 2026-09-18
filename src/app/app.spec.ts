import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the login button when there is no session', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Iniciar sesión con Google');
  });

  it('should render session countdown when a valid session is present', async () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    const payload = JSON.stringify({ exp });
    const accessToken = 'x.' + btoa(payload).replace(/=+$/, '') + '.sig';

    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', 'opaco');
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 1,
        nombre: 'Test',
        email: 'test@test.com',
        foto: null,
      }),
    );

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Access:');
    expect(compiled.textContent).toContain('Refresh:');
    expect(compiled.textContent).toContain('Test');
    expect(compiled.textContent).toContain('Mis pedidos');

    fixture.destroy();
  });
});
