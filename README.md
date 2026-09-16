# Client (Frontend)

Frontend de la aplicación de delivery, generado con [Angular CLI](https://github.com/angular/angular-cli) 22.1.2.

Estado actual: **login con Google** (Google Identity Services) integrado contra el backend.

## Stack

- **Angular 22** (standalone components, signals)
- **TypeScript 6**
- **Tailwind CSS 4** (vía `@tailwindcss/postcss`)
- **ngx-sonner** para notificaciones (toasts)
- **@auth0/angular-jwt** para manejo de JWT
- **Vitest** como test runner

## Requisitos

- Node.js (con soporte de `--env-file-if-exists`)
- npm 11

## Configuración de entorno

Las variables se inyectan en tiempo de ejecución mediante `public/env.js`, que se
genera desde `.env` antes de `start`/`build`/`watch`.

1. Copiar el archivo de ejemplo:

```bash
cp .env.example .env
```

2. Completar las variables:

| Variable           | Descripción                                              |
| ------------------ | -------------------------------------------------------- |
| `GOOGLE_CLIENT_ID` | Client ID de Google OAuth (`.apps.googleusercontent.com`) |
| `API_URL`          | URL base del backend (por defecto `http://localhost:3000`) |

`scripts/generate-env.mjs` escribe `public/env.js` con esas variables y
`index.html` lo carga con `<script src="env.js"></script>`, exponiéndolas en
`window.__env`. Los tipos están declarados en `src/global.d.ts`.

## Servidor de desarrollo

```bash
npm start
```

La app queda disponible en `http://localhost:4200/` y recarga automáticamente al
modificar archivos. También existe `npm run watch` para recompilar en modo watch.

## Build

```bash
npm run build
```

Los artefactos se generan en `dist/`. El build de producción optimiza la app para
rendimiento y velocidad.

## Tests unitarios

```bash
npm test
```

Ejecuta las pruebas con el runner de [Vitest](https://vitest.dev/).

## Avanzado hasta ahora

Commit `feat: implement Google login functionality with Auth service`
(rama `feature-logingoogle`):

- **`Auth` service** (`src/app/services/auth/auth.ts`): carga el SDK de Google
  Identity Services de forma diferida, obtiene el `credential` y lo envía a
  `POST {API_URL}/auth/login/google`. Guarda `access_token` y `user` en
  `localStorage` y expone `getAccessToken()`.
- **`Toast` service** (`src/app/services/toast/toast.ts`): wrapper de `ngx-sonner`
  con `success`, `error` e `info`, para no depender de la librería directamente.
- **Componente `App`** (`src/app/app.ts` / `app.html`): botón "Iniciar sesión con
  Google"; al autenticarse muestra nombre, email y foto del usuario, y notifica
  el resultado con toasts. El estado del usuario se maneja con `signal`.
- **HTTP** (`app.config.ts`): `provideHttpClient()` para las llamadas al backend.
- **Tipos globales** (`src/global.d.ts`): `window.__env` y `window.google`.
- **Estilos** (`styles.css`): Tailwind 4 importado y color `secondary` definido en
  el tema.
- **Tests**: `auth.spec.ts` cubre el `Auth` service.

## Próximos pasos

- Definir rutas y `auth guards` (`app.routes.ts` está vacío).
- Interceptor HTTP para adjuntar el JWT en las peticiones.
- Persistir/restaurar sesión al recargar y agregar logout.
- Layout y vistas propias del flujo de delivery.

## Recursos

Ver `login_documentation.md` y la
[Angular CLI Overview and Command Reference](https://angular.dev/tools/cli).
