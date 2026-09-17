import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Auth } from './auth';

describe('Auth', () => {
  let service: Auth;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(Auth);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should report no session when storage is empty', () => {
    localStorage.clear();
    service.clearSession(false);
    expect(service.user()).toBeNull();
    expect(service.canRefresh()).toBe(false);
  });

  it('should return access token ttl remaining from jwt exp', () => {
    localStorage.clear();
    const now = Math.floor(Date.now() / 1000);
    const token = btoa('{"alg":"HS256"}').replace(/=+$/, '') + '.' +
      btoa(JSON.stringify({ exp: now + 60 })).replace(/=+$/, '') + '.' +
      'firma';
    localStorage.setItem('access_token', token);

    const ttl = service.getAccessTokenTtlMs();
    expect(ttl).not.toBeNull();
    expect(ttl as number).toBeGreaterThan(50_000);
    expect(ttl as number).toBeLessThanOrEqual(60_000);
  });

  it('should return null ttl when access token is missing', () => {
    localStorage.clear();
    expect(service.getAccessTokenTtlMs()).toBeNull();
  });

  it('should approximate refresh token ttl from issue moment', () => {
    localStorage.clear();
    localStorage.setItem('refresh_token', 'opaco');
    localStorage.setItem('refresh_token_issued_at', String(Date.now() - 1000));

    const ttl = service.getRefreshTokenTtlMs();
    expect(ttl).not.toBeNull();
    expect(ttl as number).toBeGreaterThan(0);
    expect(ttl as number).toBeLessThan(7 * 24 * 60 * 60 * 1000);
  });

  it('should return null refresh ttl when there is no token', () => {
    localStorage.clear();
    expect(service.getRefreshTokenTtlMs()).toBeNull();
  });
});
