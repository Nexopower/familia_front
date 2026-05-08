# familiafrontend

Frontend simple en **Vue 3 + Vite + TypeScript** con **Vue Router** y **TailwindCSS**, pensado para consumir un backend REST (NestJS) con JWT.

## Requisitos

- Node.js + npm
- Windows / macOS / Linux

## Variables de entorno

Crear un archivo `.env` en la raíz:

```env
VITE_API_BASE_URL=http://localhost:3000/
```

Para desarrollo (`npm run dev`) se usa `.env.development` con `VITE_API_BASE_URL=/api/` y un proxy en Vite para evitar CORS.

## Sesión (JWT)

- Token: `localStorage.access_token`
- Usuario: `localStorage.user` (JSON)

## Rutas

- `/` Login (layout vacío)
- `/inicio` Home
- `/productos`
- `/inventario`
- `/facturas`
- `/reservas`
- `/contabilidad`

## Recommended IDE Setup

[VSCode](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

> Nota (Windows / PowerShell): si `npm` falla por políticas de ejecución, ejecuta comandos en **CMD** o habilita scripts en PowerShell.

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```
