---
name: loyalty-schema
description: Revisar y modificar el esquema Drizzle o las migraciones PostgreSQL del backend loyalty-program manteniendo correspondencia con el modelo JSON y decisiones registradas.
---

Ubicar backend/ y leer AGENTS.md, docs/architecture.md, docs/decisions/DB-001.md, docs/decisions/DB-002.md y la spec del cambio. SistemaDeFidelizacion.json es el nombre real del modelo; no renombrarlo ni reemplazarlo silenciosamente.

Comparar campos, tipos, CHECK, nulabilidad, unicidad, claves y acciones referenciales. Actualizar primero el modelo/decisión autorizada y la prueba de tooling. No inventar defaults UUID/timestamp, cascadas ni permisos a partir del diagrama. DB-001 y DB-002 documentan las únicas excepciones iniciales autorizadas.

Modificar db/schema.ts; ejecutar npm run test:tooling, npm run typecheck y npm run generate. Revisar SQL y snapshots. Versionar migraciones; no regenerar historial ya aplicado. generate no necesita secretos ni conexión.

migrate carga backend/.env y modifica la base de datos destino: ejecutarlo solo cuando el alcance autorizado incluya aplicar migraciones y se haya identificado el entorno. Nunca imprimir URLs con credenciales, usar push como atajo ni convertir generación local en prueba de migración real. Registrar la validación PostgreSQL como pendiente si no se ejecutó.
