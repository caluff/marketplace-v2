# Flujo de pedidos

## Comprador

- `/account/orders`: tarjetas con productos reales, estado de pago, entrega y paginación.
- `/account/orders/:id`: productos, tienda, dirección, importes y seguimiento basado en el pedido y sus preparaciones nativas.
- `/account/orders/:id/invoice`: comprobante imprimible o guardable como PDF desde el navegador. No es una factura fiscal.

Las lecturas del detalle y comprobante usan el listado autenticado de pedidos con filtro por ID: el backend restringe el resultado al comprador. No se usa la recuperación pública de un pedido para autorizar estas páginas.

Las etapas sólo se completan cuando todos los artículos alcanzan el estado correspondiente. Cancelar una preparación no cancela el pedido. Las líneas de preparación pueden representar componentes de inventario de un kit; no se muestran sus cantidades como unidades compradas.

## Vendedor

El listado muestra únicamente Todos, Pendientes, Preparados, Enviados, Completados y Cancelados. Son grupos de presentación sobre los datos nativos; no se guardan estados nuevos:

| Grupo | Datos nativos |
| --- | --- |
| Pendientes | Pedido pendiente sin preparaciones activas marcadas como preparadas o enviadas |
| Preparados | Pedido pendiente con alguna preparación activa (`packed_at`) y ningún envío activo |
| Enviados | Pedido pendiente con algún envío o entrega activos (`shipped_at` o `delivered_at`) |
| Completados | `order.status = completed` |
| Cancelados | `order.status = canceled` |

Las preparaciones canceladas no determinan el grupo. Los parciales permanecen dentro del grupo correspondiente y sus cantidades se consultan en el detalle. Los enlaces antiguos a pestañas parciales se traducen al grupo actual.

`GET /vendor/orders` admite el filtro adicional `fulfillment_stage=pending|prepared|shipped`, combinado con `status=pending`. Mercur 2.3.3 declara un filtro `fulfillment_status`, pero Medusa 2.18 calcula ese valor después de consultar los pedidos: no es una columna filtrable. La extensión consulta únicamente identificadores y relaciones nativas de preparaciones de la tienda, aplica el grupo a los IDs autorizados y conserva la búsqueda, la paginación y el recuento del listado nativo. No filtra una página ya descargada ni crea una nueva máquina de estados.

Las acciones vuelven a consultar el pedido dentro de la sesión del vendedor antes de ejecutar el flujo nativo:

| Acción | Endpoint nativo POST bajo `/vendor/orders/:id` |
| --- | --- |
| Preparar cantidades pendientes | `/fulfillments` |
| Registrar envío y seguimiento | `/fulfillments/:fulfillmentId/shipments` |
| Marcar entregado | `/fulfillments/:fulfillmentId/mark-as-delivered` |
| Cancelar preparación no enviada | `/fulfillments/:fulfillmentId/cancel` |
| Cancelar pedido no enviado | `/cancel` |
| Finalizar pedido enviado | `/complete` |

Se permiten preparaciones parciales. Los artículos con y sin envío se preparan por separado. El backend valida que la ubicación de preparación pertenezca a la tienda. Las operaciones irreversibles exigen confirmación; el estado del servidor decide qué acciones siguen disponibles. El panel permite completar cuando todos los artículos con envío ya fueron enviados o entregados, y los artículos sin envío fueron preparados. Registrar la entrega no es un paso obligatorio para completar; completar no inventa una fecha de entrega.

La cancelación no se presenta como un reembolso: el cobro puede ser compartido por varios pedidos de un carrito. No se añadió un endpoint de reembolso para vendedores ni emisión fiscal; requieren definir sus correspondientes flujos operativos.

## Correo al enviar

El evento nativo `FulfillmentWorkflowEvents.SHIPMENT_CREATED` ejecuta `sendShipmentNotificationWorkflow`. Usa el correo del pedido, su enlace autenticado y los números de seguimiento existentes. No envía para preparaciones canceladas, no enviadas, sin envío físico o con notificaciones suprimidas.

Reutiliza la configuración existente: `AUTH_EMAIL_ENABLED=true`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (alternativamente `AUTH_EMAIL_FROM`) y `STOREFRONT_URL`. Los valores secretos permanecen fuera del repositorio. Cada preparación tiene una clave de idempotencia para evitar duplicados al reintentar. El worker y el proveedor de correo deben estar operativos.

## Verificación

Pruebas automatizadas cubren autorización, cantidades y estados inválidos, preparaciones parciales, seguimiento seguro, kits, cancelación, correo y filtros. Se verificaron componentes en móvil/escritorio e impresión mediante datos aislados; también las redirecciones sin sesión.

Antes de desplegar, completar una prueba con cuentas y pedidos de prueba autorizados: preparar parcialmente, enviar, comprobar recepción del correo, consultar el progreso como comprador, marcar entrega y finalizar. La entrega real de correo y el recorrido autenticado completo no se ejercitaron durante esta implementación; no se modificaron pedidos reales.
