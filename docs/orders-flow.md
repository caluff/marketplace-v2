# Flujo de pedidos

Guía revisada contra el código el 2026-09-15. Las prioridades vigentes están en la [auditoría de cierre](develpment/development-completion-audit.md); esta actualización no ejecutó nuevos pedidos ni repitió pruebas de navegador.

## Comprador

- `/account/orders`: tarjetas con productos reales, estado de pago, entrega y paginación.
- `/account/orders/:id`: productos, tienda, dirección, importes y seguimiento basado en el pedido y sus preparaciones nativas.
- `/account/orders/:id/invoice`: comprobante imprimible o guardable como PDF desde el navegador. No es una factura fiscal.

Las lecturas del detalle y comprobante usan el listado autenticado de pedidos con filtro por ID: el backend restringe el resultado al comprador. No se usa la recuperación pública de un pedido para autorizar estas páginas.

Las etapas sólo se completan cuando todos los artículos alcanzan el estado correspondiente. Cancelar una preparación no cancela el pedido. Las líneas de preparación pueden representar componentes de inventario de un kit; no se muestran sus cantidades como unidades compradas.

## Vendedor

El listado muestra únicamente Todos, Pendientes, Preparados, Enviados, Completados y Cancelados. Son grupos de presentación sobre los datos nativos; no se guardan estados nuevos:

| Grupo       | Datos nativos                                                                      |
| ----------- | ---------------------------------------------------------------------------------- |
| Pendientes  | Pedido pendiente sin preparaciones activas marcadas como preparadas o enviadas     |
| Preparados  | Pedido pendiente con alguna preparación activa (`packed_at`) y ningún envío activo |
| Enviados    | Pedido pendiente con algún envío o entrega activos (`shipped_at` o `delivered_at`) |
| Completados | `order.status = completed`                                                         |
| Cancelados  | `order.status = canceled`                                                          |

Las preparaciones canceladas no determinan el grupo. Los parciales permanecen dentro del grupo correspondiente y sus cantidades se consultan en el detalle. Los enlaces antiguos a pestañas parciales se traducen al grupo actual.

`GET /vendor/orders` admite el filtro adicional `fulfillment_stage=pending|prepared|shipped`, combinado con `status=pending`. Mercur 2.3.3 declara un filtro `fulfillment_status`, pero Medusa 2.18 calcula ese valor después de consultar los pedidos: no es una columna filtrable. La extensión consulta únicamente identificadores y relaciones nativas de preparaciones de la tienda, aplica el grupo a los IDs autorizados y conserva la búsqueda, la paginación y el recuento del listado nativo. No filtra una página ya descargada ni crea una nueva máquina de estados.

Las acciones vuelven a consultar el pedido dentro de la sesión del vendedor antes de ejecutar el flujo nativo:

| Acción                                | Endpoint POST bajo `/vendor/orders/:id`                      |
| ------------------------------------- | ------------------------------------------------------------ |
| Preparar cantidades pendientes        | `/fulfillments`                                              |
| Registrar envío y seguimiento         | `/fulfillments/:fulfillmentId/shipments`                     |
| Marcar entregado                      | `/fulfillments/:fulfillmentId/mark-as-delivered`             |
| Cancelar preparación no enviada       | `/fulfillments/:fulfillmentId/cancel`                        |
| Cancelar pedido elegible / reembolsar | `/finance` (flujo financiero local con validaciones backend) |
| Finalizar pedido enviado              | `/complete`                                                  |

Se permiten preparaciones parciales. Los artículos con y sin envío se preparan por separado. El backend valida que la ubicación de preparación pertenezca a la tienda. Las operaciones irreversibles exigen confirmación; el estado del servidor decide qué acciones siguen disponibles. El panel permite completar cuando todos los artículos con envío ya fueron enviados o entregados, y los artículos sin envío fueron preparados. Registrar la entrega no es un paso obligatorio para completar; completar no inventa una fecha de entrega.

El cobro puede ser compartido por varios pedidos de un carrito. La cancelación y los reembolsos ahora pasan por el [flujo financiero por tienda](order-finance.md): sin captura se cancela sin inventar un refund; con captura se devuelve el saldo elegible de ese pedido. La ruta nativa directa `/cancel` no es una alternativa para evitar esa asignación. El vendedor puede cancelar/reembolsar cuando el backend lo permite; solo el operador puede capturar la compra compartida. No se añade emisión fiscal.

## Operador y estados financieros

`/dashboard/orders/[id]` ofrece el detalle del pedido y su sección Finanzas, incluida la captura ajustada de la compra, cancelaciones e importes de reembolso. El listado y el detalle utilizan información real del backend. Completar la logística de un pedido no acredita que su pago esté capturado o su vendedor liquidado: consultar las asignaciones y movimientos financieros, no deducirlos de `order.status`.

Los dashboards de negocio y el desglose financiero completo por venta siguen pendientes (F09). La exclusión de escritores financieros tampoco cubre aún todos los `order-edits` (F04).

## Correo al enviar

El evento nativo `FulfillmentWorkflowEvents.SHIPMENT_CREATED` ejecuta `sendShipmentNotificationWorkflow`. Usa el correo del pedido, su enlace autenticado y los números de seguimiento existentes. No envía para preparaciones canceladas, no enviadas, sin envío físico o con notificaciones suprimidas.

Reutiliza la configuración existente: `AUTH_EMAIL_ENABLED=true`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (alternativamente `AUTH_EMAIL_FROM`) y `STOREFRONT_URL`. Los valores secretos permanecen fuera del repositorio. Cada preparación tiene una clave de idempotencia para evitar duplicados al reintentar. El worker y el proveedor de correo deben estar operativos.

## Verificación

La implementación incorpora pruebas de autorización, cantidades y estados inválidos, preparaciones parciales, seguimiento seguro, kits, cancelación, correo y filtros. La QA histórica incluyó componentes en móvil/escritorio e impresión mediante datos aislados y redirecciones sin sesión. Su alcance concreto está en los informes de [pedidos](reports/qa-orders-browser-2026-09-12.md), [operador](reports/qa-admin-browser-2026-09-12.md) y [finanzas](reports/qa-order-finance-2026-09-12.md).

Antes de cerrar desarrollo, completar la regresión F12 con cuentas y pedidos de prueba autorizados: preparar parcialmente, enviar, comprobar recepción del correo, consultar el progreso como comprador, marcar entrega, finalizar y verificar el resultado financiero. La QA parcial y los tests aislados no certifican ese recorrido completo en la revisión final; registrar los nuevos resultados en [Development Progress](develpment/development-progress.md).
