# loyalty-program

Sistema de fidelización para restaurantes basado en tarjetas digitales. Los programas permitirán acumular sellos por compras y obtener un premio al completar una meta.

## Estado

`frontend/` sigue reservado. `backend/` tiene API Hono, identidad Supabase, módulos de fidelización y pruebas con PostgreSQL aislado. Implementación verificada localmente: 210 de 210 pruebas pasan; checks y compilación satisfactorios. Configuración externa de Google y despliegue pendientes. Ver [preparación del backend](backend/README.md) y [contexto de negocio](backend/docs/index.md).

## Entorno de desarrollo

- Git (verificado con 2.43.0).
- Node.js 24.18.1.
- npm 12.1.0.
- Opcional: nvm para seleccionar la versión declarada en `.nvmrc`.

Desde la raíz del proyecto, con nvm instalado:

```bash
nvm install
nvm use
```

Si no usas nvm, instala la versión indicada de Node.js con tu gestor habitual. Comprueba `npm --version`; si difiere, puedes instalar la versión requerida con `npm install --global npm@12.1.0`.

Prepara y comprueba el entorno:

```bash
node --version
npm --version
npm ci --ignore-scripts --no-audit --no-fund
npm ls --depth=0
git diff --check
git status --short --branch
```

El manifiesto raíz sigue privado y sin dependencias. El backend tiene manifiesto y lockfile propios (sin workspaces); instalarlo por separado:

```bash
cd backend
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run generate
npm run db:check
```

Hay servidor y pruebas funcionales. `check` verifica formato, tipos, tooling y unit; `generate` produce SQL sin conectarse. `npm run migrate` aplica SQL a la base configurada en `backend/.env`; consultar antes el README del backend.

## Configuración del repositorio

- `.editorconfig`: UTF-8, finales de línea LF e indentación de dos espacios.
- `.gitattributes`: normalización de texto a LF.
- `.gitignore`: exclusión de secretos, dependencias y artefactos locales.
- `AGENTS.md`: contexto, reglas de trabajo y actualización obligatoria al cierre de cada sesión.
- Rama inicial: `main`.
- Remoto `origin`: `https://github.com/jMarlonDev/loyalty-program.git`.

Los commits siguen [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/), por ejemplo `chore: initialize development environment`.

## Próximos pasos

Publicar los commits desde una sesión GitHub autenticada y completar las integraciones externas descritas en [estado de desarrollo](backend/docs/development-status.md). Consultar `backend/AGENTS.md` para estado y verificaciones. Frontend y despliegue siguen pendientes.
