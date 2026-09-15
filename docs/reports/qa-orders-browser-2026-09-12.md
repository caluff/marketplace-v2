# QA de pedidos en Orca — 2026-09-12

> **Informe histórico.** Sus resultados corresponden únicamente a la revisión, fecha y entorno descritos en el cuerpo original. No certifica el estado actual ni el cierre financiero. Consultar la [auditoría de cierre](../develpment/development-completion-audit.md), el [progreso](../develpment/development-progress.md) y las [guías vigentes](../README.md).

Estado: **parcial; el flujo completo todavía no está certificado**.

La sesión principal coordinó el run `run_94847f2aa92d` de Orca. Dos trabajadores
revisaron seguridad y corrigieron la preparación del vendedor; ambos terminaron
con resultado satisfactorio y sus terminales se liberaron. La sesión principal
interactuó con las páginas autenticadas. No se modificaron pedidos existentes,
no se completaron pagos y no se enviaron correos durante esta QA.

## Fallo reproducido y corregido

El pedido existente `order_01M2B215BQ9E1DS38TQ9KWFAZS` mostraba al comprador
2 unidades, US$400 de productos y US$420 de total. En el detalle del vendedor,
la cantidad estaba vacía, el artículo sumaba US$0 y el pedido US$20. La ausencia
de cantidades impedía ofrecer una preparación válida.

La proyección explícita usaba `items.detail.*`. El mapeador y formateador
instalados de Medusa 2.18 requieren seleccionar los contadores de la relación
order-item explícitamente. Se seleccionaron `items.detail.quantity`,
`fulfilled_quantity`, `shipped_quantity` y `delivered_quantity` tanto para el
detalle como para la lectura previa de las acciones.

La preparación ahora utiliza el almacén aprobado mediante la proyección existente
`sellerWarehouse`; el servidor lo vuelve a comprobar. No se solicita seleccionar
almacén. Las cantidades pendientes vienen completas por defecto y la edición
parcial queda dentro de «Preparar solo una parte (opcional)». Los datos ausentes
o inválidos muestran un error local en lugar de ocultar silenciosamente la acción.

Tras recargar el navegador autenticado, se verificaron cantidad 2, total US$420,
almacén de la tienda y botón «Preparar para envío». No se pulsó ese botón en el
pedido existente. Se conservan los endpoints y workflows nativos; no se añadieron
estados persistidos, rutas de API ni dependencias.

Archivos de la corrección:

- `apps/vendor/src/features/workspace/data.ts`
- `apps/vendor/src/features/orders/operations.ts`
- `apps/vendor/src/features/orders/order-management.tsx`
- `apps/vendor/src/features/orders/orders.test.ts`

## Registros creados mediante el formulario del vendedor

Se conservan para continuar la QA; no fueron eliminados ni publicados. Cada envío
respondió «Producto enviado a aprobación. Todavía no está publicado» y devolvió
un enlace de producto. No se eludió la aprobación del operador.

| Producto | ID | Estado observado |
| --- | --- | --- |
| QA 20260912 Libreta de prueba | `prod_01M2B9PWTE4EV689WZ856M35ME` | Enviado a aprobación |
| QA 20260912 Estuche de prueba | `prod_01M2B9X29C5YPAYH0BTGJ60CW5` | Enviado a aprobación |
| QA 20260912 Bolsa sin existencias | `prod_01M2B9ZP97SYGHBDZNSG0BJ5CJ` | Enviado a aprobación |

Los nombres describen casos previstos, no condiciones de inventario ya probadas.
Todavía faltan aprobación, ofertas, precios e inventario para estos productos.

## Comprobaciones efectivamente realizadas

| Caso | Resultado observado |
| --- | --- |
| Creación de tres productos | Tres respuestas satisfactorias y enlaces con IDs diferentes |
| Detalle de pedido del vendedor | Cantidades e importes corregidos; preparación completa predeterminada y parcial opcional |
| Lista de pedidos, Todos | 5 pedidos existentes |
| Lista de pedidos, Pendientes | 1 pedido; total US$420 |
| Lista de pedidos, Cancelados | 4 pedidos, sin incluir el pendiente |
| Lista de pedidos, Preparados | Estado vacío local, 0 resultados |
| Navegación entre filtros | Encabezado, pestañas y buscador permanecen mientras carga la región de datos |
| Detalle del comprador | Cantidad 2, productos US$400, envío US$20, total US$420; estado pendiente de preparación |
| Ver comprobante | Abre la ruta del pedido, con cantidades/importes consistentes y control Imprimir / Guardar PDF |
| Modal de envío del producto existente | Abre y cierra; muestra el envío Express y la descripción configurada por la tienda |
| Carrito existente | 1 unidad, subtotal US$200, envío US$20 y total US$220; permite navegar al checkout |
| Checkout existente | Dirección y envío cargados; formulario Stripe incrustado y botón de pago |
| Modo del formulario Stripe | Los iframes activos contienen una clave publicable test, no live; solo se emitieron indicadores booleanos |
| Search inicial | 1 producto; dos controles slider con dimensiones no nulas y selector de tienda de tipo checkbox |

La revisión de páginas fue por DOM e interacción con controles existentes en
Orca. No constituye una verificación visual por capturas. La impresión/descarga
real de PDF, el cambio efectivo del rango de precio y la selección de varias
tiendas no quedaron verificados en esta ejecución.

## Validación de código

El trabajador de preparación ejecutó satisfactoriamente lint, typecheck y las
124 pruebas del vendedor, incluidas 17 pruebas de pedidos. La regresión de
cantidades usa el mapeador/formateador de la versión instalada de Medusa. La
sesión principal comprobó el resultado en el DOM autenticado y ejecutó
`git diff --check` sobre los archivos de pedidos y su lectura de datos sin errores.
No se ejecutaron suites de integración destructivas sobre los servicios compartidos.

## Límites y siguiente paso

- El operador no tiene sesión abierta en `http://localhost:7000/dashboard`:
  redirige al acceso. Se solicitó al usuario iniciar sesión en esa pestaña sin
  compartir su contraseña. La aprobación y configuración de los nuevos productos
  quedan pendientes de ese acceso.
- Orca abre pestañas y permite varias lecturas `eval`, formularios y navegaciones,
  pero `snapshot`, algunas acciones y el acceso al frame de Stripe fallaron con
  `runtime_unavailable` o `Frame not found`, aun después del reinicio. Las lecturas
  DOM del documento principal sí confirmaron la presencia del iframe. No se
  debilitó el aislamiento del navegador ni se modificó Stripe para sortearlo.
- El navegador Playwright alternativo no pudo arrancar: la distribución Chrome
  configurada no está instalada. No se instaló ni cambió la configuración global.
- La configuración local usa Stripe test, pero Resend está habilitado para enviar
  correos reales. La revisión de seguridad detalla los límites en
  [qa-payment-safety-2026-09-12.md](qa-payment-safety-2026-09-12.md).
- Quedan sin ejecutar compras nuevas, rechazo de tarjeta, varias compras y varios
  artículos, agotamiento de stock, preparar/enviar/entregar/completar/cancelar en
  nuevos pedidos QA, recepción del email y comprobante del nuevo pedido. No se
  afirma que esas transiciones funcionen porque las pruebas unitarias pasen.

Continuar con los productos identificados arriba, mediante aprobación y oferta
nativas, y pagos exclusivamente test. Limitar los destinatarios de notificaciones
a una cuenta controlada y autorizada; no usar pedidos de compradores ajenos.
