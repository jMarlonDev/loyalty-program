# Guía del proyecto

## Contexto y alcance

`loyalty-program` es un sistema de fidelización para restaurantes. Los restaurantes podrán definir programas por compras; los clientes acumularán sellos en una tarjeta digital y obtendrán un premio al completar la meta.

La etapa actual comprende únicamente preparación del entorno, documentación y Git. No generar código de aplicación, elegir frameworks, instalar dependencias de producto ni configurar servicios hasta que el usuario solicite esa siguiente etapa.

## Entorno y estructura

- Base local: Node.js 24.18.1 y npm 12.1.0; versiones declaradas en `.nvmrc` y `package.json`.
- `frontend/` y `backend/`: carpetas reservadas, sin implementación.
- `README.md`: preparación del entorno, verificaciones y decisiones pendientes.
- No hay servidor, base de datos, compilación ni suite de pruebas configurados.
- No versionar credenciales, archivos `.env`, dependencias ni artefactos generados.

## Flujo de trabajo

- Leer este archivo al iniciar cada sesión.
- Respetar los cambios existentes del usuario y limitarse al alcance solicitado.
- Usar Conventional Commits: `<tipo>[ámbito opcional]: <descripción>`.
- Referencia: https://www.conventionalcommits.org/en/v1.0.0/.
- Rama inicial: `main`. Remoto previsto: `https://github.com/jMarlonDev/loyalty-program.git`.
- Validar los cambios con comprobaciones proporcionales; no presentar verificaciones del entorno como pruebas funcionales.

## Cierre obligatorio de cada sesión

Antes de terminar cada sesión, actualizar este `AGENTS.md` con la fecha, cambios realizados, comprobaciones y resultados, limitaciones y próximos pasos. Actualizar también `README.md` si cambian los requisitos o comandos de preparación. No registrar secretos ni afirmar acciones que no se hayan completado.

## Estado de la última sesión — 2026-10-18

- Preparación inicial completada: documentación, configuración del editor, exclusiones de Git, versiones fijadas y manifiesto privado con lockfile sin dependencias. Carpetas `frontend/` y `backend/` preservadas mediante `.gitkeep`.
- Herramientas detectadas: Git 2.43.0, Node.js 24.18.1 y npm 12.1.0.
- Git inicializado en `main` y `origin` configurado con la URL indicada.
- Verificaciones satisfactorias: generación del lockfile e instalación limpia con npm en modo offline, `npm ls --depth=0`, coincidencia de Node.js con el manifiesto y `.nvmrc`, lockfile sin dependencias, `git diff --check` y exclusiones de archivos locales mediante `git check-ignore`.
- Entrega preparada para el commit inicial `chore: initialize development environment`; consultar `git log -1` para su identificador.
- Sin código de aplicación ni pruebas funcionales. No se realizó push ni se verificó acceso al repositorio remoto.
- Siguiente etapa: definir arquitectura, frameworks, almacenamiento y reglas de emisión/canje de sellos con el usuario.
