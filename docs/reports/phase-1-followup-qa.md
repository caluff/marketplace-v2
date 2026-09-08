# Fase 1: continuación de integración

Fecha: 2026-09-06 UTC. Continuación integrada, exclusivamente en modo test.
Complementa el [informe inicial](phase-1-integration-qa.md); sus resultados de
compilación anteriores no certifican los cambios de esta continuación.

## Decisión confirmada

En compras multivendedor, superar las 72 horas sin preparar la parte de una
tienda cancela solo esa parte, conserva las demás y ajusta la captura única.
Los jobs financieros siguen deshabilitados hasta verificar sus condiciones.

## Storage: prueba real

- Las cinco variables S3 ya están configuradas por el usuario; `HeadBucket`
  del bucket `product-images` respondió 200.
- La primera subida autenticada devolvió 403: el middleware local repetía
  `authenticate` después del guard global, sustituyendo los roles actuales de
  la membresía por los del JWT. Se eliminó esa duplicación, siguiendo el patrón
  de ajustes de inventario. Se conservan el guard global, la política
  `file:create` y la comprobación de identidad/permisos dentro del workflow.
- Tras corregirlo, `POST /vendor/catalog-images` devolvió el archivo nativo
  guardado en Supabase. GET público: 200, `image/png`, 68 bytes idénticos al
  fixture PNG de QA. No se hizo una subida directa que eludiera la propiedad.
- Objeto de QA conservado:
  `products/79c8c75b-15a0-40ed-a32e-4f6dbc908323-01M1T99491TNASJGT7ERY6733H.png`.
- Se propuso esa imagen para `prod_01M1T4JFZTGHBXWGE3SFAB9P4M`; Mercur creó
  `prodch_01M1T9D0PZ2F50Z3PEC4X36PVV`, con una única acción de imágenes.
  El producto ya estaba publicado al empezar esta continuación; no se cambió
  su publicación. El administrador confirmó esa única acción mediante la ruta
  nativa; una lectura posterior autenticada del vendedor devolvió la imagen
  persistida `img_01M1TAG4CK3RNY3BRCJ4SZQ1GC` con la misma URL pública.
- Las 18 pruebas focalizadas de validación/propiedad, incluida la regresión de
  roles conservados, pasan. El gate completo del API aún debe repetirse al cierre.

## Stripe: estado observado antes de la reconciliación

El titular completó el alta test. Stripe devuelve la cuenta
`acct_1UCUW4LLMtKTWHV6` con país US, datos enviados, cobros/payouts habilitados,
capacidad `transfers` activa y sin requisitos actuales, vencidos ni en revisión.
Mercur todavía conservaba `restricted` en `pacc_01M1T3YJWEGE5KDFTBYZ2AAFEY`:
los listeners locales temporales ya no estaban activos al completar el alta.
Visitar `return_url` no prueba verificación; se está integrando una reconciliación
autenticada y el mismo procesamiento de estado actual para notificaciones.

QA posterior: `POST /vendor/stripe-account-refresh`, con la sesión real del
vendedor, devolvió `active`. Un GET independiente de `/vendor/payout-accounts`
confirmó la persistencia del mismo estado. No se modificaron capacidades ni
datos personales en Stripe: se consultó el estado remoto de prueba. El portal
dispone de actualización manual y una única verificación al volver del alta,
sin polling. La carrera entre respuestas se protege con un bloqueo de propietario
único sin expiración; ante caída del proceso, su recuperación exige comprobar
que el propietario terminó, no borrar el bloqueo automáticamente.

## Comisión

Editor nativo implementado en `/dashboard/commissions`. La inspección DOM del
navegador confirmó la pantalla autenticada, tasa activa, explicación de la base
antes de descuentos sin envío/impuestos y aviso de recálculo nativo.
No se cambió el porcentaje durante esta inspección. El trabajador ejecutó lint,
typecheck y las 63 pruebas del admin correctamente; falta el gate integrado.

## Protecciones y migración

- La ruta `POST /vendor/payments/:id/capture` rechaza la captura manual del
  vendedor: una tienda no decide el cobro conjunto de otros vendedores.
  Tras reiniciar el servidor, la solicitud autenticada recibió HTTP 403 antes
  de buscar/capturar un pago. La consulta de catálogo por el ID del producto de
  QA devolvió únicamente ese producto publicado; la cuenta de cobros siguió
  devolviendo `active` en una lectura final independiente.
- Se integró evaluación acotada de grupos, importes USD exactos y registro
  persistente de casos parcialmente preparados para revisión administrativa.
  El job está deshabilitado. Todas las condiciones de habilitación de mutaciones
  financieras permanecen bloqueadas en código: no hay captura ni transferencia
  automática operativa. Detalles: [auditoría financiera](phase-1-commerce-automation.md).
- Medusa generó y aplicó una migración nueva, `Migration20260906031004`;
  otras migraciones estaban al día y no se ejecutaron scripts ni enlaces.
  Se verificó RLS activo y ausencia de permiso SELECT de `anon`/`authenticated`
  en `commerce_group_state`, `commerce_operation` y `commerce_scan`.

## Rendimiento y servicio de desarrollo

Se solapó la carga de categorías con el detalle del producto; las categorías
se filtran en el endpoint nativo antes de paginar. Las consultas de visibilidad
por ID ahora leen solo los vínculos de esos productos, conservando los vínculos
con todas sus tiendas y los filtros de acceso. Los controles usan Checkbox/Label
de shadcn y los estados de Stripe usan Sonner. Las skills de Next.js, shadcn y
Medusa guiaron esa composición y el uso de workflows nativos.

La muestra pequeña del SDK aún registró 3–5 segundos en varias rutas. No es un
benchmark antes/después ni demuestra que el problema esté resuelto. Véase
[mediciones y límites](phase-1-performance-followup.md).

Durante la edición, el watcher de Medusa en Windows quedó atascado intentando
`taskkill` de un proceso ya terminado, dejando el puerto 9000 sin servidor.
Se reinició el `pnpm dev` existente en su misma terminal, comprobando antes que
los cuatro puertos estaban libres; no se duplicaron servidores. Este reinicio
recupera el servicio, pero no corrige el defecto del watcher. Los logs también
demostraron que crear `scripts/profile-vendor-readiness.cjs` provocó recarga:
estar fuera de `src` no basta para evitarla en esta configuración.

## Validación de cierre

- Store: lint, typecheck, 54 pruebas y build correctos.
- Admin: lint, typecheck, 63 pruebas y build correctos.
- Vendor: lint, typecheck y 88 pruebas correctos en el trabajador; build integrado
  correcto en la sesión principal.
- API: lint sin errores (6 advertencias de imports internos conocidas), typecheck,
  445 pruebas en 34 suites y build correctos.
- Tema compartido: 8 pruebas correctas. Total: 658 pruebas.
- `pnpm peers check`, contratos de onboarding y `git diff --check`: correctos.
- No se ejecutaron suites destructivas contra PostgreSQL/Redis compartidos ni
  pruebas financieras reales. No se certifican carreras PostgreSQL por tests
  que usan dobles de los servicios.

## Pendientes

- Verificar visualmente la actualización y los toasts del portal; la reconciliación
  autenticada y su persistencia ya se comprobaron por SDK. Las lecturas del
  navegador de Orca no respondieron de forma utilizable en esta comprobación.
- Implementar y verificar las protecciones nativas de cancelación concurrente,
  importe de captura parcial, cierre contable, eventos duplicados, asignación
  por tienda y recuperación de transferencias. El registro de revisión todavía
  necesita una vista y un workflow administrativo de resolución.
- Configurar perfiles de envío: el GET autenticado de la tienda de QA devolvió
  una lista vacía. No se creó un perfil ni una tarifa ficticia para forzar el
  éxito de la prueba. Queda QA real de ofertas, stock y aislamiento de dos tiendas.
- Reducir la latencia residual y medir renderizado inicial/navegación con respuestas
  lentas; reparar el watcher de desarrollo si se sigue reproduciendo.
- Checkout multivendedor completo, entrega estable de webhooks, reembolsos,
  fiscalidad y operación antes de ventas reales siguen pendientes.
