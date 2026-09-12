# QA del operador — 12 de septiembre de 2026

## Alcance

Admin independiente en `http://localhost:7000`, con la sesión de operador abierta por el usuario en Orca. Se conservaron los cambios existentes del workspace y se reutilizaron Mercur 2.3.3 / Medusa 2.18.0, sus tipos, SDK, rutas y workflows instalados. No se añadieron dependencias ni endpoints backend.

## Implementación

- Resumen sin fixtures: solicitudes en revisión, productos propuestos, tiendas y pedidos consultados al backend, con carga y errores por indicador.
- Directorio y detalle de tiendas con búsqueda, filtros y paginación nativos; datos de contacto, empresa y dirección. No se infiere disponibilidad logística a partir de información incompleta.
- Catálogo con miniaturas, tiendas vinculadas, estados y revisiones pendientes; detalle con imágenes y especificaciones existentes, carga localizada y tratamiento de producto inexistente.
- Pedidos: lista y detalle autenticados con artículos, tienda, comprador, estados, importes y seguimiento; entrega y cierre mediante SDK nativo con confirmación y lectura fresca del pedido.

## Evidencia en navegador

- Resumen autenticado: 0 solicitudes, 2 productos propuestos, 1 tienda y 5 pedidos después de publicar la libreta QA y antes del rechazo de la bolsa.
- Directorio: una tienda activa; navegación al detalle real con contacto y dirección registrados.
- Publicación de `prod_01M2B9PWTE4EV689WZ856M35ME` (Libreta QA): confirmada como `published` tras usar el formulario de operador.
- Correcciones para `prod_01M2B9X29C5YPAYH0BTGJ60CW5` (Estuche QA): comentario confirmado en el historial. Mercur conserva `proposed`; su workflow registra la solicitud y emite el evento sin inventar otro estado de producto.
- Rechazo intencional de `prod_01M2B9ZP97SYGHBDZNSG0BJ5CJ` (Bolsa QA): estado `rejected` y motivo confirmados al volver a leer el detalle.
- Búsqueda de catálogo `status=all&q=QA`: aparecen los estados distintos sin filtrado posterior a la paginación. Hay un cuarto producto QA preexistente que no se modificó.
- Filtro de tiendas `status=suspended`: muestra el estado vacío y contador 0, conservando navegación y filtros.
- Producto inexistente: muestra “Producto no encontrado” y acceso al catálogo, conservando la navegación autenticada.
- Producto 1: la imagen del detalle se descargó correctamente (`complete=true`, `naturalWidth>0`), sin modificar su contenido.
- Lista de pedidos: 5 registros reales. Filtro nativo `status=canceled`: exactamente 4 registros cancelados.
- Pedido #5: se observó `completed`, con 2 unidades preparadas, enviadas y entregadas y pago aún `authorized`. Esta sesión no realizó esa transición ni captura. No aparecen acciones para repetir entrega o cierre; cancelar permanece deshabilitado.
- El QA detectó una etiqueta de subtotal incorrecta (incluía envío). El detalle corregido muestra artículos finales USD 400 + envío USD 20 = total USD 420; descuentos e impuestos se muestran como información ya incluida, sin alterar los importes almacenados.
- La búsqueda `q=5` devolvió los cinco pedidos y se investigó antes de limitarla. El modelo nativo marca número, email y direcciones como buscables; las direcciones contienen el código postal `12345`. Se conservó `q` con la etiqueta “Búsqueda general”: el correo del comprador devuelve solo #5 y un término imposible devuelve cero registros. No se introdujo una búsqueda limitada a ID ni filtros locales posteriores a paginación.
- Miniatura de #5 verificada en lista y detalle (`complete=true`, `naturalWidth>0`). Se recupera por consultas de catálogo agrupadas cuando faltan la imagen histórica y la miniatura de variante, usando también la primera imagen de galería; no se cambia el snapshot del pedido ni se bloquean importes/acciones mientras carga.
- Pedido inexistente: muestra “Pedido no encontrado” y acceso a la lista.

## Límites y decisiones

- No se alteraron los pedidos existentes para simular entregas, ni se realizaron cobros, capturas o reembolsos durante esta verificación.
- La cancelación nativa de Medusa puede tener efectos financieros; los pagos compartidos de Mercur requieren revisar el alcance por vendedor. Se consultó al usuario antes de ampliar ese flujo.
- La publicación no crea automáticamente oferta, precio, stock ni configuración logística. Los productos QA no se presentan como listos para comprar por el mero hecho de estar publicados.
- Las lecturas y acciones documentadas se verificaron mediante el DOM del navegador de Orca. La captura de pantalla falló con `Page.captureScreenshot: Screenshot timed out`; no se afirma haber verificado capturas visuales ni navegación con red lenta.
- No se certifican nuevas compras completas ni entrega de emails con este informe.

## Validación automatizada

- `pnpm lint:admin`: aprobado, tras corregir JSX dentro de bloques `try` en las vistas de catálogo.
- `pnpm typecheck:admin`: aprobado.
- `pnpm test:admin`: 87 pruebas aprobadas, incluidas 12 de pedidos y casos de confirmación obligatoria, relectura, entrega inválida, cantidades, contratos SDK, bloqueo de operaciones financieras, imágenes, fechas y búsqueda.
- `pnpm build:admin`: aprobado; rutas de resumen, tiendas, catálogo y pedidos compiladas correctamente para producción.

La verificación automatizada de entrega/cierre usa dobles de SDK, no cambios sobre pedidos reales. Los dos trabajos coordinados (resumen/tiendas y pedidos) se integraron y sus terminales supervisadas fueron liberadas; catálogo, QA de navegador y validación final se coordinaron desde esta sesión.
