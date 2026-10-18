# Diseño de Lealtad

Interfaz de fidelización general, sin ambientación de un comercio concreto. La tarjeta digital y sus sellos siguen siendo el objeto central. La solicitud del 2026-10-18 conserva las pantallas y operaciones, y sustituye las referencias de cafetería por una identidad de azul tinta, lima y tipografía sans. Los programas reales conservan sus colores y logos personalizados.

## Tokens

- Fondo general #F5F7FB; superficie #FFFFFF; tinta #182444; secundario #58637A; borde #DCE2ED.
- Acento #304C9B; acento suave #EAF0FC; destacado #D7EF7B; éxito #246145; peligro #A42929.
- Tipografía: DM Sans autoalojada para interfaz y presentación. Títulos con peso firme y sin cursiva; cifras tabulares en operaciones.
- Ritmo: 4, 8, 12, 16, 24, 32, 48, 64 px. Ancho de lectura 65ch. Radio de panel 14 px, controles 8 px.
- Botones mínimos 44 px; foco 3 px; transición 160 ms con prefers-reduced-motion.

## Composición

Landing: título directo, entradas «Mis tarjetas» y «Administrar», y tarjeta ilustrativa «Club Vuelta» claramente rotulada como ejemplo. Iconos Lucide de retorno, tarjeta, sellos y premio; sin tazas ni referencias gastronómicas.

Gestión: navegación lateral en escritorio y barra compacta adaptable en móvil, contexto de restaurante siempre visible. Selección activa en tinta y su icono en lima. Formularios de una columna en móvil y vista previa contigua en escritorio. Operaciones por referencia de compra y QR, sin controles para otorgar varios sellos arbitrarios.

Acceso: formulario sobre blanco y explicación sobre azul tinta, con una secuencia ilustrativa de sellos. Un mismo usuario puede consultar tarjetas y gestionar programas; los enlaces mantienen ambas rutas accesibles.

## Estados y accesibilidad

Cada consulta tiene carga, error recuperable y vacío. Cada mutación bloquea envíos concurrentes, conserva clave de idempotencia al reintentar y anuncia resultado. QR reales SVG, alto contraste y enlace/código equivalente; tokens de autenticación solo en cookies HttpOnly. El QR privado pendiente usa sessionStorage por pestaña con TTL de diez minutos para retomar el acceso; se borra al resolver o cerrar sesión. El color nunca es el único indicador de estado. El destacado lima se usa con tinta oscura, nunca como texto sobre blanco.
