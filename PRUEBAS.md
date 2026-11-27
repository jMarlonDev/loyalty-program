# Pruebas manuales

Guía para probar con dos dispositivos: un **celular como cliente** y una **PC u otro celular como admin/empleado**. Se irá ampliando por funcionalidad. Las credenciales completas de admin y empleados y el seed de datos llegarán con la Fase 1 (login local, D-07). Mientras tanto se usa la cuenta de dueño que ya tengas configurada.

## Preparación

1. `npm run dev` y abre la URL de la red local en ambos dispositivos (ver `CLAUDE.md` → HTTPS local para usar la cámara).
2. En la PC, entra como dueño → «Mi programa» → publica el programa y abre «QR del restaurante». Anota el enlace `/join/<código>`.
3. Teléfonos de prueba (Colombia, país CO). Son ficticios, no reciben mensajes:

| Alias | Escribir | Se guarda como |
| --- | --- | --- |
| Ana | `300 123 4567` | `+573001234567` |
| Ana (otro formato) | `+573001234567` | `+573001234567` |
| Beto | `310 555 0001` | `+573105550001` |
| Carla | `320 555 0002` | `+573205550002` |

Para simular «otro dispositivo» puedes usar otro navegador o una ventana privada: cada uno tiene su propia cookie.

## D-01 — Inscripción del cliente

| # | Dispositivo | Acción / dato | Resultado esperado |
| --- | --- | --- | --- |
| 1 | Celular A | Abrir `/join/<código>` | Se ven el nombre del programa, los sellos necesarios, la recompensa y dos botones: «Unirme» y «Ahora no». |
| 2 | Celular A | «Ahora no» | Pantalla neutra. No se crea nada y el admin no ve ninguna tarjeta nueva. |
| 3 | Celular A | «Unirme» → `300 123 4567` | Tarjeta de Ana con **0 sellos**, visible de inmediato. |
| 4 | Celular A | Cerrar el navegador y volver a abrir el enlace o la tarjeta | Se ve la misma tarjeta sin escribir nada y no hay botón «Cerrar sesión». |
| 5 | Celular A | Volver a escanear el QR del local | Se muestra su tarjeta y no aparece el formulario para crear otra. |
| 6 | Navegador B (ventana privada) | «Unirme» → `+573001234567` (Ana con otro formato) | ❌ «Este número ya tiene una tarjeta activa». No se ven sellos ni datos de Ana. |
| 7 | Navegador B | «Unirme» → `300 123 4567` | ❌ El mismo rechazo: los dos formatos son el mismo número. |
| 8 | Navegador C | Intentar el alta 6 veces en menos de una hora con números al azar | Del intento 6 en adelante: ❌ «Demasiados intentos. Intenta más tarde.» |
| 9 | PC (empleado) | Sumar 2 sellos a Ana | El celular A muestra 2 sellos. |
| 10 | Celular A | Perfil → «Salir del programa» | Primera confirmación con los sellos actuales y, si tiene premios, el aviso «Tienes N premio(s) sin reclamar y lo vas a perder». |
| 11 | Celular A | Segunda confirmación | «Saliste del programa». Al recargar ya no se ve la tarjeta y aparece de nuevo «Unirme». |
| 12 | PC (admin) | «Tarjetas» | La tarjeta de Ana aparece **Cerrada**, con fecha de inicio y de cierre y el teléfono `+57 300 *** 4567`. |
| 13 | Celular A | «Unirme» → `300 123 4567` | Aviso «Este número ya participó en el programa. Se creó una tarjeta nueva sin sellos.» La tarjeta empieza en 0. |
| 14 | PC (admin) | «Tarjetas» | La nueva tarjeta de Ana está **Activa** con la marca «Reinscrito (1)». En el detalle se ven el teléfono completo, el historial y el enlace a la tarjeta anterior. |
| 15 | Dos navegadores a la vez | Alta simultánea con `310 555 0001` (Beto) | Uno recibe la tarjeta y el otro ❌ «Este número ya tiene una tarjeta activa». En el admin hay una sola tarjeta activa de Beto. |

### Transferencia a un celular nuevo

| # | Dispositivo | Acción / dato | Resultado esperado |
| --- | --- | --- | --- |
| 16 | Celular A | Darle sellos a Beto (o usar Ana) y anotar el saldo | — |
| 17 | Celular B (nuevo) | «Unirme» con el mismo número | ❌ «Este número ya tiene una tarjeta activa» y una ayuda para pedir la transferencia en el local. |
| 18 | PC (admin) | «Tarjetas» → detalle → «Transferir a nuevo dispositivo» → confirmar «Verifiqué a la persona en el local» | Aparece un QR con una cuenta atrás de 10 min. |
| 19 | Celular B | Escanear ese QR | Se abre la tarjeta con **los mismos sellos**. |
| 20 | Celular A (viejo) | Recargar | ❌ Ya no tiene acceso: pide unirse de nuevo y no muestra la tarjeta. |
| 21 | Otro dispositivo | Escanear el mismo QR otra vez | ❌ «El código de transferencia no es válido o venció.» |
| 22 | PC (admin) | Generar un QR y esperar más de 10 min antes de escanearlo | ❌ El mismo mensaje de vencido. |
| 23 | PC (empleado sin permiso) | Intentar transferir | ❌ Sin permiso (403). El admin activa «Puede transferir tarjetas» en Empleados y después el empleado sí puede hacerlo. |

Todos los pasos dejan rastro en la auditoría: `CARD_CREATED`, `CARD_REENROLLED`, `ENROLL_REJECTED_ACTIVE`, `CARD_CLOSED`, `CARD_TRANSFER_ISSUED` y `CARD_TRANSFERRED`.
