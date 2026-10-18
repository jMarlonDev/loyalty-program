# loyalty-program

Sistema de fidelización para restaurantes basado en tarjetas digitales. Los programas permitirán acumular sellos por compras y obtener un premio al completar una meta.

## Estado

Repositorio en preparación inicial, sin código de aplicación ni dependencias. `frontend/` y `backend/` reservan la estructura futura. Los frameworks, la base de datos, la autenticación y el despliegue están pendientes de definición.

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

El manifiesto está marcado como privado y no tiene dependencias ni scripts. No hay todavía comandos de desarrollo, compilación o pruebas funcionales. La instalación vacía verifica que npm puede procesar el manifiesto y el lockfile.

## Configuración del repositorio

- `.editorconfig`: UTF-8, finales de línea LF e indentación de dos espacios.
- `.gitattributes`: normalización de texto a LF.
- `.gitignore`: exclusión de secretos, dependencias y artefactos locales.
- `AGENTS.md`: contexto, reglas de trabajo y actualización obligatoria al cierre de cada sesión.
- Rama inicial: `main`.
- Remoto `origin`: `https://github.com/jMarlonDev/loyalty-program.git`.

Los commits siguen [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/), por ejemplo `chore: initialize development environment`.

## Próximos pasos

Definir el stack de frontend/backend y almacenamiento, el modelo de restaurantes/programas/tarjetas, las reglas de acumulación y canje y los permisos de clientes y personal del restaurante.
