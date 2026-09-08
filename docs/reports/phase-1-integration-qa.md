# Fase 1: integración y QA

Revisión: 2026-09-06 UTC (2026-09-05 en America/Montevideo).
Estado: **integración parcial verificada; fase todavía abierta, solo pruebas**.
Este informe consolida las verificaciones del coordinador posteriores a los
informes individuales. No sustituye sus riesgos ni certifica ventas reales.

## Mercur: decisión sobre la actualización

Se consultaron las etiquetas npm de core, types, docs y payout-stripe-connect:
la última versión estable sigue siendo **2.3.3**, que ya está instalada.
La preliminar **2.3.4-canary.3** tiene nueve commits adicionales sobre productos
y ofertas, no sobre programadores de captura, cancelación o liquidaciones.
Por tanto, no se cumple la condición del usuario para actualizar.

Evidencia pública: [versiones de Mercur](https://github.com/mercurjs/mercur/releases)
y [comparación de los commits publicados](https://github.com/mercurjs/mercur/compare/4e91ae102d2ad5ffa1666e339e355186c4fadea5...98471d057e34c9133b6e0c42708a48106dd1c04f).

Se contrastó Context7 con la documentación instalada 2.3.3, en particular
`content/platform/payout/concepts/payout-pipeline.mdx`, y el código del paquete.
Mercur aporta los workflows y valores de plazo, pero el programador y sus
condiciones de elegibilidad requieren integración del proyecto. No basta con
actualizar ni con configurar esas opciones. Ver el
[análisis del flujo nativo](phase-1-native-commerce-readiness.md).

## Entregado e integrado

- Almacén único derivado de la solicitud aprobada, con reclamación persistente,
  protección de propiedad, restricciones de mutación y reconciliación. Se retira
  la creación libre de almacenes desde el portal y se rechaza también en API.
- Propuestas de catálogo con categorías, opciones, variantes y SKU maestros;
  cambios sujetos al flujo de revisión de Mercur. Ofertas por variante con USD,
  perfil de envío e inventario nativos, sin inventar tarifas ni convertir EUR.
- Subida de imágenes mediante File/S3 de Medusa, proveedor Supabase seleccionado,
  validación de contenido/tamaño y registro persistente de propiedad. El endpoint
  no pretende guardar imágenes cuando falta configurar Storage.
- Stripe Connect Express mediante el proveedor oficial y onboarding alojado;
  US/test, destinos de retorno controlados por el servidor, firma y vinculación
  de webhooks, recarga del estado actual de Stripe y bloqueo de nuevas ventas
  con vendedores/cuentas no habilitados. Sin proveedor Accounts v2 paralelo.
- Inventario sin consultas por cada fila: tres solicitudes de datos para una
  página con almacén válido. Parche acotado del inicializador RBAC, sin eliminar
  comprobaciones de permisos ni cachear autorizaciones globalmente.
- date-fns para las fechas afectadas y guía de uso en AGENTS.md. Effect no se
  instaló: no se justificó un segundo runtime sobre los workflows de Medusa.
- Comisión global nativa actualizada por SDK/API administrativo de 0% a **8%**.
  Se releyó `comrate_default`: porcentaje, habilitada, sin impuestos ni envío.
  No se modificaron pedidos, pagos ni transferencias con esta configuración.

Detalles: [almacén](phase-1-warehouse.md), [catálogo/ofertas](phase-1-catalog.md),
[medios](phase-1-catalog-media.md), [inventario](phase-1-inventory-performance.md),
[RBAC](phase-1-rbac-performance.md), [proveedor Stripe](phase-1-stripe-provider.md).

## Cambios persistentes realizados durante QA

Se generaron migraciones con Medusa y se aplicaron únicamente las pendientes,
sin sincronizar enlaces ni ejecutar scripts de actualización:

```text
pnpm exec medusa db:migrate --skip-links --skip-scripts --concurrency 1 --all-or-nothing
```

- `vendorOnboarding`: `Migration20260906001500`.
- `catalogMedia`: `Migration20260906005052`.
- Verificación posterior de solo lectura: ambas registradas y RLS habilitado
  en las dos tablas nuevas. No se ejecutó la reversión de ninguna migración.
- El generador produjo además un archivo duplicado del DDL de almacén; se
  eliminó solo ese archivo nuevo antes de aplicar las migraciones, conservando
  el snapshot generado y la migración completa con restricciones.

Se inspeccionó primero la tienda existente y se ejecutó el backfill individual
en `dry-run` y después en `apply`. Resultado: `ready`, con una sola ubicación:

```text
seller:    sel_01M1SJQH2N0X7K3TG29TEY48EC
warehouse: sloc_vwh_76a0eb8868902bed8995a067f6e00360
```

La tarjeta de inventario mostró la dirección de la solicitud aprobada. No se
inventó otra dirección ni se eliminaron existencias anteriores.

Recursos de QA que se conservan para inspección:

- Producto `prod_01M1T4JFZTGHBXWGE3SFAB9P4M`, titulado
  «QA fase 1 - preparación de catálogo», variante «Variante única», SKU maestro
  `QA-PHASE1-20260906-01`, en la categoría de QA existente. Continúa **propuesto**,
  no publicado, sin oferta ni imagen. La propuesta llegó al panel administrativo.
- Cuenta Connect **de pruebas** `acct_1UCUW4LLMtKTWHV6`, vinculada a
  `pacc_01M1T3YJWEGE5KDFTBYZ2AAFEY`. No se rellenaron documentos, datos legales,
  banco ni se aceptaron términos por el usuario.
- Comisión global nativa `comrate_default` al 8%. La edición desde la aplicación
  administrativa propia sigue pendiente, aunque la API nativa permite cambiarla.

## Verificaciones ejecutadas

| Área | Resultado |
| --- | --- |
| Store | Lint, typecheck, 54 pruebas y build correctos |
| Admin | Lint, typecheck, 54 pruebas y build correctos |
| Vendor | Lint, typecheck, 74 pruebas y build correctos |
| API | Lint sin errores, typecheck, 358 pruebas en 26 suites y build correctos |
| Tema compartido | 8 pruebas correctas |
| Dependencias | `pnpm peers check` correcto |
| Cambios | `git -c core.safecrlf=false diff --check` correcto |

Total: **548 pruebas aprobadas**. API lint conserva seis advertencias: cinco de
imports internos ya existentes en inventario y una del punto de entrada tipado
del servicio S3 utilizado por el adaptador. No se presentan como cero warnings.

QA con API y las tres aplicaciones del `pnpm dev` existente:

1. `/health` respondió 200 después de completar el arranque del API.
2. Sesión de vendedor válida, tarjeta de almacén y tabla vacía de inventario
   sin valores fabricados; catálogo existente recuperado desde Mercur.
3. Formulario de producto enviado una vez: `POST /vendor/products` 201,
   toast «Producto enviado a aprobación. Todavía no está publicado.» y variante
   persistida. El administrador inició sesión y visualizó la propuesta.
4. Alta de Stripe desde el botón del portal: cuenta 201 y enlace 201; navegación
   al formulario oficial de Stripe en modo test. No se completó su aceptación.
5. Evento real firmado `account.updated` recibido con 200 en `/hooks/payout`;
   el API registró el procesamiento por el subscriber nativo. Una solicitud sin
   firma recibió 400 antes de encolarse.
6. Al regresar al portal, la cuenta mostró **«Requiere atención»**, coherente con
   requisitos pendientes. No se marcó habilitada por visitar la URL de retorno.
7. Página inicial del store y sus consultas de categorías, región y productos:
   HTTP 200. Tras una desconexión transitoria de Orca, el snapshot mostró el
   catálogo existente y su estado sin precio; el producto de QA propuesto no
   apareció publicado. Esto no sustituye una prueba completa de checkout.

No se ejecutaron suites que reconstruyen bases de datos contra Supabase
compartido ni pruebas de carga contra Redis. Las carreras de almacén/inventario
y el aislamiento de dos vendedores tienen pruebas offline, no certificación
de concurrencia real sobre PostgreSQL en esta pasada.

## Rendimiento: mejora estructural, latencia pendiente

Muestra pequeña en desarrollo, sin benchmark de producción ni comparación
cronometrada equivalente antes/después:

| Operación | Tiempo observado |
| --- | --- |
| Catálogo del vendedor | 6,2 s |
| Inventario del vendedor | 10,4 s |
| Detalle del producto de QA | 12,9 s |
| Enviar producto a revisión | 26,9 s; POST nativo 21,9 s |
| Primera creación/alta de Stripe | 21,1 s |
| Revisión de cuenta de Stripe ya creada | 4,7 s |
| Inicio del store | 3,1 s |

El N+1 de inventario quedó eliminado: el caso offline de 20 artículos pasó de
22 llamadas deducidas del código anterior a 3 registradas por el espía del SDK.
La muestra real vacía también realizó las tres solicitudes previstas. Esto no
prueba una reducción determinada de SQL ni de comandos Redis.

Los logs sitúan gran parte del tiempo en las solicitudes al backend, no en la
compilación de Next.js. Aún falta perfilar SQL/middleware y la latencia hacia la
infraestructura antes de atribuir una causa única o prometer tiempos menores.
Se observó una advertencia de pg sobre consultas simultáneas en un mismo cliente;
no se atribuye sin trazas a un módulo concreto. No se deshabilitaron controles de
propiedad/RBAC para ocultar esa demora. Los esqueletos locales ayudan a mostrar
contenido independiente, pero no equivalen a resolver el tiempo total.

## Diferencias frente a las reglas iniciales

| Tema | Comportamiento adoptado/verificado |
| --- | --- |
| Comisión del 8% | Base nativa anterior a descuentos, sin envío ni impuestos. Difiere de productos después de descuentos más envío. |
| Cambiar la comisión | Mercur puede recalcular líneas usando tasas actuales ante eventos de edición/devolución; no hay snapshot contractual inmutable añadido por el proyecto. |
| Cobro | Proveedor configurado para autorización y captura manual; no cobro inmediato automático añadido. |
| Plazos | No se implementó retención personalizada de siete días tras entrega. Los valores nativos de ventanas temporales no constituyen jobs ejecutándose. |
| Transferencias | Workflow/proveedor nativos; estado `PAID` del payout no acredita llegada al banco. No se activó un programador de transferencias. |
| Reembolsos | No se añadió motor propio de reversión proporcional, recuperación de deuda, incidencias ni reglas de devolución. |
| Alta del vendedor | Express con onboarding alojado y Accounts v1 del proveedor oficial, frente al v2/embebido sugerido por el planificador. |
| Almacén | Se conserva la excepción explícita del usuario: uno por tienda, aunque Mercur admite varios. |

El límite US/USD, el modo test y la obligación de configurar Stripe antes de una
nueva venta se mantienen. Los registros existentes en EUR no se reinterpretaron.

## Pendientes para cerrar la fase y antes de ventas reales

1. **Supabase Storage: verificado en la continuación.** Credenciales configuradas;
   subida real, lectura pública, aprobación de la imagen y recarga autenticada
   correctas. Véase [evidencia actualizada](phase-1-followup-qa.md).
2. **Alta de Stripe: completada en test.** Reconciliación autenticada y lectura
   independiente confirman `active`. Quedan QA visual de retorno y restricciones
   posteriores; no se certifica el circuito financiero completo por este estado.
3. QA integral de aprobación del producto, ofertas, perfil de envío, stock y
   aislamiento de dos vendedores con infraestructura de prueba adecuada. No se
   creó una tarifa de envío ficticia para forzar su éxito.
4. Reducir las latencias medidas y verificar renderizado progresivo con respuestas
   lentas. La optimización estructural ya entregada no cierra ese pendiente.
5. **Editor de comisión implementado** en `/dashboard/commissions`, con permisos
   nativos, porcentaje editable y Sonner. Ver informe de continuación.
6. Integrar y probar los programadores alrededor de workflows nativos con sus
   condiciones de elegibilidad, idempotencia, observabilidad y consumo acotado.
7. La continuación bloquea la ruta de captura manual del vendedor. Siguen
   pendientes el importe explícito de captura parcial, su conciliación contable
   y el tratamiento idempotente de notificaciones. No habilitar dinero todavía.
8. El workflow nativo de payout no verifica por sí mismo captura/envío/plazos;
   no invocarlo desde jobs hasta comprobar esas precondiciones.
9. Probar checkout multivendedor, captura, cancelación, reembolsos y transferencias
   de punta a punta; fiscalidad, envíos y políticas requieren sus propios cierres.
10. Límites residuales documentados: posible cuenta remota huérfana ante respuesta
    incierta al crear Connect, objeto S3 huérfano ante resultado incierto de upload,
    carrera residual entre releer Stripe y persistir el estado, y ambigüedad del
    inicializador nativo al reponer permisos previamente revocados. No se añaden
    reintentos ciegos ni se declara resuelto lo que solo tiene pruebas parciales.

### Configuración de Storage ya completada

Solo en el `.env` raíz ignorado, nunca en `NEXT_PUBLIC_*`:

```dotenv
SUPABASE_S3_ENDPOINT=
SUPABASE_S3_REGION=
SUPABASE_S3_ACCESS_KEY_ID=
SUPABASE_S3_SECRET_ACCESS_KEY=
SUPABASE_STORAGE_BUCKET=product-images
```

Se utiliza un bucket público `product-images`. Limitarlo a PNG/JPEG/WebP y 5 MiB por
archivo. Obtener endpoint, región y claves desde la configuración S3 de Storage;
la URL/contraseña de PostgreSQL no reemplazan estas credenciales. Reiniciar el
API si cambian. El QA de subida ya está registrado en el informe de continuación.
No publicar las claves en el chat.

### Servicios y webhooks locales

Se dejó `pnpm dev` corriendo en la terminal del usuario: store 3000, admin 7000,
vendor 7001, API 9000. Las sesiones de los trabajadores están liberadas; no hay
servidores duplicados ni jobs nuevos de dinero. `STRIPE_AUTOMATIC_JOBS_ENABLED`
permanece en `false`; no se considera un interruptor capaz de bloquear llamadas
manuales a workflows nativos que no consultan esa opción.

Los dos listeners temporales de Stripe CLI entregaron la prueba, pero más tarde
registraron desconexiones de WebSocket. Se detienen al finalizar QA; no se afirma
que sigan recibiendo eventos. Para nuevas pruebas, iniciar dos listeners con
`STRIPE_API_KEY` cargada desde el entorno de pruebas del servidor:

```text
stripe listen --events payment_intent.succeeded,payment_intent.amount_capturable_updated,payment_intent.payment_failed,charge.refunded --forward-to http://localhost:9000/hooks/payment/stripe_stripe
stripe listen --events account.updated --forward-to http://localhost:9000/hooks/payout --forward-connect-to http://localhost:9000/hooks/payout
```

Guardar los secretos reales que muestre cada listener en `STRIPE_WEBHOOK_SECRET`
y `STRIPE_PAYOUT_WEBHOOK_SECRET` del `.env` raíz, respectivamente, y reiniciar el
API si cambian. El despliegue requiere endpoints públicos y sus propios secretos;
los secretos de Stripe CLI no sustituyen los de esos endpoints. No se guardaron
claves ni enlaces privados de onboarding en este informe.
