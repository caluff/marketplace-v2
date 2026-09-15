# Demora al reducir la cantidad del carrito

> **Informe histórico.** Sus resultados corresponden únicamente a la revisión, fecha y entorno descritos en el cuerpo original. No certifica el estado actual ni el cierre financiero. Consultar la [auditoría de cierre](../develpment/development-completion-audit.md), el [progreso](../develpment/development-progress.md) y las [guías vigentes](../README.md).

Fecha: 9 de septiembre de 2026.

## Resultado

Una reducción de dos unidades a una, ejecutada directamente con el SDK contra
la API local, tardó **18,325 s**. La lectura preventiva del storefront añadió
**1,258 s**. El coste principal de esta muestra está dentro de la petición de
mutación; quitar la lectura preventiva no basta para resolverlo.

No se reprodujo el timeout de 30 s de la captura. La prueba sí reprodujo una
demora considerable sin React, Next Server Actions ni renderizado. No se
capturaron spans internos de esa petición que permitan repartir su duración
entre SQL, transporte, pool, Redis y ejecución de workflows.

## Comparación con Mercur 2.3.3

El storefront oficial usa Next.js 15.5.21, no Vite. Vite corresponde a los
paneles. Se consultó el tag v2.3.3, la versión instalada, porque Context7
devolvió referencias de canary.

- [Manifest del storefront](https://github.com/mercurjs/mercur/blob/v2.3.3/apps/storefront/package.json).
- [Operaciones de carrito](https://github.com/mercurjs/mercur/blob/v2.3.3/apps/storefront/src/lib/data/cart.ts).
- [CartProvider](https://github.com/mercurjs/mercur/blob/v2.3.3/apps/storefront/src/components/providers/Cart/CartProvider.tsx).
- [Control de cantidad](https://github.com/mercurjs/mercur/blob/v2.3.3/apps/storefront/src/components/molecules/UpdateCartItemButton/UpdateCartItemButton.tsx).

Mercur toma el identificador de la cookie y llama directamente a
`POST /store/carts/:cartId/line-items/:lineId` con `{ quantity: 1 }`.
Después invalida la caché, el provider vuelve a consultar el carrito y ejecuta
`router.refresh()`. El control muestra una cantidad optimista y usa un debounce
de 500 ms. No es una sola petición de extremo a extremo.

Nuestra acción en `apps/web/features/cart/actions.ts` hace:

1. GET del carrito con identidad, moneda, finalización, país y IDs de líneas.
2. El mismo POST nativo mediante `sdk.store.cart.updateLineItem`, solicitando
   solamente `fields=id` en la respuesta.
3. `revalidatePath("/cart")`: lectura del carrito para renderizar cantidades y
   totales, más disponibilidad para los controles. La vista también tiene
   lecturas de navegación y cuenta; no se midieron en esta prueba directa.

El timeout de `cartSdk` es de 30 s **por petición**, no un umbral del tiempo de
renderizado. `failure()` convierte TimeoutError/AbortError en el aviso de la
captura. No identifica si falló el GET previo o el POST.

El workflow instalado de Medusa `update-line-item-in-cart` adquiere el lock,
lee y valida el carrito, ejecuta hooks y conserva comprobaciones de precios,
inventario y actualización del carrito. Reducir una cantidad no equivale a
una escritura SQL aislada. No se retiraron esas garantías.

## Medición actual

Entorno: web configurada con `http://localhost:9000`; API local disponible.
La configuración de PostgreSQL apunta al pooler Supabase de AWS us-west-2.

Se creó un carrito QA independiente, sin usar la sesión ni el carrito de la
captura. Las operaciones se ejecutaron mediante el SDK instalado, sin reintentos
manuales. El SDK de diagnóstico no incorporó el límite personalizado de 30 s
del storefront.

| Operación | Duración |
| --- | ---: |
| Crear carrito QA | 7,820 s |
| Añadir dos unidades | 17,912 s |
| GET preventivo, mismos campos que la acción | 1,258 s |
| POST reducir de dos a una, `fields=id` | 18,325 s |
| GET confirmar cantidad | 0,840 s |
| Eliminar línea QA | 6,942 s |

Se confirmó cantidad 1 después del POST y se eliminó la línea al finalizar.
El carrito de prueba vacío quedó identificado por metadata
`purpose=cart-quantity-latency-2026-09-09`. No se inició checkout ni pago.

Una conexión independiente a PostgreSQL tardó 1,305 s en establecerse.
Cinco `SELECT 1` consecutivos sobre esa conexión tardaron
207 / 206 / 205 / 205 / 204 ms desde el cliente. Son tiempos de ida y vuelta,
no tiempos de ejecución SQL. Esto demuestra un coste de transporte relevante
incluso para consultas triviales; no prueba cuántas consultas secuenciales hizo
el POST ni explica por sí solo sus 18,325 s.

El informe anterior `cart-performance-fix-2026-09-08.md` registró un POST de
actualización de 2,446 s con la API desplegada cerca de PostgreSQL. Es una
referencia histórica, no una comparación controlada con la muestra de hoy.

## Implicación

La lectura preventiva es un coste adicional concreto, pero el primer problema
a resolver es ejecutar el backend cerca de sus servicios de datos o disponer
de un entorno de desarrollo con servicios cercanos. Antes de atribuir el
resto a consultas innecesarias, hacen falta tiempos internos de la petición.
No se aumentó el timeout ni se cambió infraestructura o configuración para
ocultar la demora. No se modificó código de aplicación.

La inspección de la sesión del navegador quedó bloqueada porque el MCP de
Playwright exige aprobación y la sesión tiene política `never`. El ejecutable
`orca` tampoco está disponible en el PATH de esta sesión. Las mediciones de
SDK y PostgreSQL sí se ejecutaron correctamente.
