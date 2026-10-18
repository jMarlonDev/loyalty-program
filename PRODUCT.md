# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

TanStack Start fullstack, React, TanStack Query, componentes shadcn/ui sobre Radix; PostgreSQL y Supabase Auth conservan el modelo y la identidad existentes.

## Users

Dueños y administradores gestionan restaurantes, sucursales, personal y programas. Empleados registran compras y entregan premios. Clientes se inscriben desde un enlace o QR y consultan su tarjeta en el móvil.

## Product Purpose

Un sistema de fidelización para restaurantes: cada compra válida suma un sello y alcanzar la meta genera un premio. La migración conserva las reglas de backend/docs/business-rules.md.

## Operating Context

Uso móvil prioritario, incluso en mostrador. Un usuario puede ser cliente y personal de varios restaurantes. El contexto y los permisos pertenecen a cada restaurante.

## Capabilities and Constraints

Autenticación de Supabase; invitaciones aceptadas con correo verificado; tarjetas personalizables con colores, logo HTTPS y mensaje; QR para inscripción e identificación; compra idempotente, canje y reversión administrativa; cierre con consentimiento del titular. No hay integración Apple/Google Wallet, campañas, reservas, menús ni métricas de ingresos. La configuración externa depende del entorno del operador.

## Brand Commitments

Interfaz en español: tarjetas como protagonistas, navegación clara, vista previa y QR legible. La solicitud del 2026-10-18 pide una identidad general de fidelización, sin referencias a café ni ambientación de cafetería; se mantienen el modelo de restaurantes y sus reglas. Nombre de presentación «Lealtad», inferido de la función del proyecto y sin pretensión de marca registrada.

## Evidence on Hand

Especificaciones, OpenAPI y pruebas del backend; capturas aportadas por el usuario. No hay clientes, cifras comerciales, testimonios ni imágenes de marca proporcionadas.

## Product Principles

- Preservar negocio, permisos y aislamiento entre restaurantes.
- Mostrar resultados reales y estados vacíos explícitos.
- Hacer cada acción operable con una mano y teclado.
- Separar la vista de cliente de la gestión del restaurante.

## Accessibility & Inclusion

Diseño móvil primero, controles de al menos 44 px, etiquetas visibles, foco visible, mensajes comprensibles, reducción de movimiento y contraste legible. La personalización permite colores propios y advierte contraste insuficiente sin modificar condiciones del negocio.

## Acceso móvil y sesión — 2026-10-18

Enlaces públicos basados en APP_ORIGIN y aviso cuando el origen es local. Tarjeta con permalink; personal puede escanear QR con cámara o pegarlo para abrir formulario, con permisos del restaurante. Sesión renovable; errores temporales permiten reintentar. Publicación HTTPS aún pendiente: el usuario no dispone de URL pública.
