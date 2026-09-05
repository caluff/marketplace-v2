# Sidebar administrativo y tema de las tres aplicaciones

Fecha: 2026-09-05.

- Se retiraron los controles duplicados del header administrativo. El avatar del
  pie del sidebar abre un dropdown shadcn con identidad, Claro/Oscuro/Sistema y
  cierre de sesión destructive separado. También está disponible en móvil.
- Solicitudes muestra un punto warning pulsante cuando la consulta autenticada
  devuelve solicitudes submitted. La animación respeta reducción de movimiento.
  Un error se representa como estado desconocido, no como una cola vacía.
- Desktop y móvil comparten una sola consulta: al montar, navegar o recuperar el
  foco, con mínimo 60 segundos entre intentos. Una decisión administrativa fuerza
  actualización. No hay polling ni temporizadores periódicos. Estar inmóvil en
  la misma pantalla no recibe notificaciones push; se actualiza al volver/navegar.
- Admin y vendor usan los mismos tokens de fondo/card/popover oscuros y textura
  estática que el store. El ruido no intercepta entrada y se desactiva al imprimir
  o usar colores forzados.
- El paquete acotado theme-sync comparte solo la preferencia visual entre las
  tres aplicaciones mediante cookie, sin compartir autenticación ni usar Redis.
  Ver [alcance y configuración del dominio](../../packages/theme-sync/README.md).

## Verificación

- Web: 53 pruebas; admin: 48; vendor: 38; tema compartido: 8. Total: 147.
- Lint, tipos y builds de las tres aplicaciones correctos; peers sin problemas.
- QA real en los tres previews: login del admin, header sin usuario duplicado,
  indicador de cola real, menú/logout visible sin ejecutarlo, sincronización
  store → admin/vendor en oscuro y admin → store/vendor en claro.
- Fondos y texturas calculados por el navegador coinciden. Menú móvil sin
  desbordamiento horizontal a 390 px. No se observaron errores de runtime.
- No se revisaron/aprobaron solicitudes ni se enviaron correos en la QA.
