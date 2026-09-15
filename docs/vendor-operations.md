# Alta y operación de vendedores

Guía vigente de las superficies conectadas, revisada el 2026-09-15. El diseño
inicial para Mercur 2.3.3 y Medusa 2.18.0 está en
[el plan histórico](plans/vendor-onboarding.md); los resultados de QA al final
conservan su fecha y no representan una nueva verificación.

La [auditoría de cierre](develpment/development-completion-audit.md) es la base de
los pendientes de desarrollo. **Financial Readiness: FAIL**: existen checkout,
Connect, pedidos y operaciones financieras TEST, pero no está terminado el ciclo
de comisión, liquidación, recuperación y reporting. Seguir las
[fases de implementación](develpment/development-implementation-plan.md) y el
[handoff de progreso](develpment/development-progress.md).

## Recorrido

1. El comprador entra en `/account/sell`, desde su cuenta o el menú del avatar.
   Conserva su cuenta, pedidos, direcciones y favoritos.
2. Completa responsable, tienda, actividad y revisión. El borrador se guarda en
   el backend y puede retomarse. La primera versión admite personas y empresas
   de Estados Unidos, teléfono estadounidense y categorías/monedas habilitadas
   por el marketplace.
3. Verifica su correo y envía la solicitud con consentimiento de revisión. Los
   datos enviados quedan como una revisión independiente del borrador.
4. Un administrador autorizado revisa `/dashboard/vendor-applications`: aprueba,
   solicita correcciones con motivo o rechaza con motivo. Las correcciones
   permiten reenviar; el rechazo cierra esta solicitud, sin reapertura automática.
5. La aprobación crea la tienda y su membresía con los workflows nativos de
   Mercur. No habilita el registro público genérico de vendedores. El comprador
   accede al portal con el mismo correo y contraseña, pero obtiene una sesión
   `member` independiente; no se transfieren tokens por URL.
6. El vendedor consulta su preparación en `/seller`. Una solicitud aprobada, una
   tienda activa, un producto publicado y una oferta disponible para comprar son
   estados distintos.

## Superficies conectadas

| Ruta                                   | Capacidad y límite                                                                                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web `/account/sell`                    | Borrador, envío, estado, correcciones e historial/notificaciones dentro de la cuenta.                                                                           |
| Admin `/dashboard/vendor-applications` | Cola, detalle y decisión de solicitudes, con permisos y control de versión.                                                                                     |
| Admin `/dashboard/product-review`      | Moderación nativa de productos propuestos y de cambios pendientes. No configura precios ni ofertas.                                                             |
| Vendor `/seller`                       | Conteos reales, pedidos recientes y preparación de la tienda. Sin métricas financieras simuladas.                                                               |
| Vendor `/seller/catalog`               | Catálogo compartido, variantes, imágenes y revisión de productos/cambios; ofertas y precios propios. Producto aprobado y oferta vendible son estados distintos. |
| Vendor `/seller/inventory`             | Consulta y ajuste atómico del total físico en el almacén aprobado, con controles de cantidad esperada y reservas.                                               |
| Vendor `/seller/inventory/locations`   | Consulta y revalidación del único almacén de Estados Unidos basado en la solicitud aprobada. No permite creación libre.                                         |
| Vendor `/seller/orders`                | Pedidos asignados, detalle, preparación parcial, envío/tracking y transiciones admitidas; cancelación/refund TEST según elegibilidad backend.                   |
| Vendor `/seller/settings`              | Edición de perfil, dirección comercial y nombre de empresa.                                                                                                     |
| Vendor `/seller/settings/shipping`     | Configuración de opciones de envío admitidas y tarifas propias para la cobertura estadounidense soportada.                                                      |
| Vendor `/seller/settings/payments`     | Alta/reanudación Connect TEST, consulta y refresco de estado. No muestra una liquidación ni un payout bancario.                                                 |
| Admin `/dashboard/orders`              | Consulta/operación de pedidos y captura, cancelación y reembolsos TEST protegidos por el backend.                                                               |
| Admin `/dashboard/commissions`         | Consulta y edición de la regla global; no es un dashboard de ingresos.                                                                                          |

El catálogo compartido publicado de Mercur puede ser visible a más de una tienda.
Los productos privados y los registros de inventario requieren el alcance de la
tienda. La API vuelve a comprobar la membresía activa y el estado operativo; una
cookie válida por sí sola no mantiene acceso a una tienda suspendida.

El almacén se gestiona con la dirección aprobada. Si falta o no se puede confirmar
uno único, la UI informa del bloqueo y requiere revisión del operador. Crear otra
ubicación no es la solución del flujo actual. Los contratos y evidencia de esa
entrega están en [el informe de almacén](reports/phase-1-warehouse.md).

Una cuenta Connect habilitada, una oferta activa y stock disponible tampoco
demuestran una venta cobrada: el checkout autoriza con captura manual y separa
pedidos por vendedor. Ver [pedidos](orders-flow.md) y
[operaciones financieras](order-finance.md). Los dashboards actuales muestran
conteos operativos; el detalle financiero muestra asignado/capturado/reembolsado,
pero todavía no las ganancias netas y balances reconciliados de cada vendedor.

## Verificación de correo en pruebas

El identificador de la tienda es interno: el backend lo genera al guardar la
solicitud y conserva el de los borradores existentes. No se solicita ni se muestra
como un campo editable al cliente.

Configura `VENDOR_ONBOARDING_TEST_VERIFICATION=true` en el entorno privado de la
API (el `.env` raíz para desarrollo local o las variables del servicio desplegado).
La solicitud de vendedor mostrará «Generar código de prueba»: el servidor genera
un token nativo para el correo de la cuenta autenticada y el formulario lo
completa automáticamente. La persona debe pulsar «Confirmar código»; generar el
token por sí solo no verifica la cuenta. No se envía un correo en este modo y se
mantienen los límites de reenvío y la caducidad del token.

La opción está desactivada por defecto, independientemente de `NODE_ENV`. Para
volver a verificar la posesión real del correo, elimina la variable o configura
`VENDOR_ONBOARDING_TEST_VERIFICATION=false` y reinicia la API. Las cuentas ya
verificadas conservan su estado. Activa esta opción solo en el entorno de pruebas.

## Pendientes de desarrollo y límites

- **Finanzas:** F01–F03 cubren histórico, redondeo y validación; F04 protege
  escritores de pedidos; F07–F09 cierran liquidación, recuperación y reporting.
  No repetir transferencias ni liberar journals por SQL para resolver un resultado
  incierto. El detalle y los criterios de salida están en la auditoría.
- **Autorización:** F05 trata el aislamiento de carrito/identidad; F06 registra
  privilegios públicos peligrosos en tablas nativas PostgreSQL. La autorización
  Medusa no protege consultas directas que esos roles puedan ejecutar. La
  exposición externa concreta de Data API requiere verificación; no afirmar que
  esta documentación haya corregido permisos.
- **Catálogo y checkout:** F10–F11 cubren continuidad del catálogo y coherencia del
  desglose con descuentos/impuestos. F12 exige regresión integral del código final.
- **Inventario:** el ajuste vendor ya compara y escribe de forma atómica, con
  bloqueos compartidos con reservas/ajustes nativos. La evidencia histórica incluye
  carreras PostgreSQL. La extensión usa clases internas de Medusa 2.18.0 y exige
  revisar compatibilidad al actualizar; no protege escrituras SQL externas.
  Consultar [el contrato de concurrencia](../packages/api/src/modules/inventory/README.md).
- **Configuración comercial:** el backend debe suministrar categorías, monedas,
  regiones, variantes, ofertas, inventario y envíos. No fabricar datos en el
  frontend. Productos propuestos necesitan moderación; borradores preexistentes
  necesitan progresión por el operador cuando el esquema vendor no lo admite.

## Integraciones y comprobaciones externas

Resend está integrado con Notification de Medusa y sus plantillas. Su
configuración y recuperación se documentan en
[el módulo](../packages/api/src/modules/resend/README.md). Las variables privadas
incluyen `RESEND_API_KEY`, `AUTH_EMAIL_ENABLED`, `RESEND_FROM_EMAIL`,
`STOREFRONT_URL`, `ADMIN_URL` y `VENDOR_URL`; `AUTH_EMAIL_FROM` conserva compatibilidad
si no existe `RESEND_FROM_EMAIL`. El remitente de pruebas de Resend tiene límites
propios y no acredita entrega a compradores reales.

Redis sostiene eventos, workflows y bloqueos. La cuota agotada registrada el
2026-09-05 es evidencia histórica, no una consulta al estado actual del servicio.
No cambiar ni vaciar la instancia para eludir un fallo de acceso/cuota sin la
correspondiente autorización.

La entrega real de correo y el recorrido autenticado completo requieren pruebas
integradas; tipos y unitarios no sustituyen esa validación. Los dominios,
remitentes, credenciales live y despliegue definitivos pertenecen a la etapa
posterior de preparación para producción. No son parte de las fases obligatorias
del plan de cierre funcional. No incluir secretos ni credenciales en evidencias.

## Configuración y despliegue

En el frontend web, `NEXT_PUBLIC_VENDOR_URL` contiene únicamente el origen público
del portal. En vendor, `NEXT_PUBLIC_STOREFRONT_URL` contiene el origen público de
la tienda. Son valores públicos de compilación de Next.js; reconstruir al cambiar
el destino. Las sesiones siguen aisladas por aplicación.

Los destinos de Railway y los watch paths del paquete de contratos están
declarados en `.railway/railway.ts`. Editar ese archivo no despliega ni aplica
configuración externa. API y worker deben ejecutar la misma versión. El servicio
API conserva la responsabilidad de migrar antes del despliegue.

La migración `Migration20260905012452` añade `vendor_application`,
`vendor_application_event` y `vendor_application_mutation`.
`Migration20260905015700` fija el `search_path` de la función de auditoría.
No editarlas después de aplicarlas. El historial es deliberadamente inmutable; no usar
la base compartida como destino de fixtures que después se pretenda borrar.

Los contratos de transporte se generan desde los esquemas Zod del backend en
`packages/vendor-onboarding-contracts`, un paquete de tipos sin código de servidor
importado por los frontends:

```powershell
pnpm --filter @marketplace-v2/api contracts:generate
pnpm --filter @marketplace-v2/api contracts:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm peers check
```

## Pruebas HTTP aisladas

Consultar primero el encabezado completo de
`packages/api/integration-tests/http/vendor-onboarding.spec.ts`. La suite se
omite por defecto y exige la opción `VENDOR_ONBOARDING_TESTS=disposable-local`,
credenciales explícitas de PostgreSQL local y una instancia Redis TLS local
dedicada. La configuración actual de API también requiere TLS en PostgreSQL.

El runner nativo crea/restaura/elimina bases y plantillas temporales. **No usar
Supabase ni Redis compartidos, ni ejecutar la suite HTTP general contra ellos.**
Las variables deben existir antes de iniciar el proceso; `TEST_DATABASE_URL` no
es un sustituto de la configuración del runner. No requiere credenciales de
usuarios existentes ni envía correos reales.

Desde `packages/api`, y solamente después de preparar ese entorno desechable:

```powershell
pnpm test:integration:http --runTestsByPath integration-tests/http/vendor-onboarding.spec.ts
```

La suite cubre acceso, verificación, aislamiento entre tiendas, reintentos,
concurrencia y compensación de aprobación. Que el runner informe `skipped` no
significa que esas pruebas hayan pasado.

## Recuperación de aprobaciones interrumpidas

Una aprobación con resultado de escritura incierto permanece bloqueada para
recuperación; no se crea otra tienda mediante un nuevo intento a ciegas. El
operador puede inspeccionar la operación original, desde `packages/api`:

```powershell
pnpm exec medusa exec ./src/scripts/recover-vendor-application.ts <operation-id> inspect
```

El script también dispone de `cancel` y `finalize`, con confirmación explícita
mediante `VENDOR_ONBOARDING_RECOVERY_CONFIRMED=true`. Son operaciones de
recuperación que modifican datos: revisar primero la transacción original y
detener su worker ejecutor antes de usarlas. No borrar journals, cambiar estados
por SQL ni autorizar otra aprobación mientras el resultado siga siendo incierto.

## Verificación inicial del coordinador · 2026-09-05

Los siguientes resultados corresponden a la entrega inicial. La ampliación
posterior de correo, inventario y QA autenticada se recoge al final.

- Lint, tipos y compilaciones de web, admin, vendor y API: correctos en el código
  final; contratos generados y dependencias pares también comprobados.
- Tests de proyecto: web 41, admin 19, vendor 26 y API 95, todos correctos.
  Los de API usan dobles de persistencia; no son los tests HTTP aislados.
- Ambas migraciones se aplicaron correctamente en la base configurada, con
  sincronización de enlaces finalizada y sin migraciones nativas pendientes.
- Navegador: login de comprador en escritorio/móvil, rutas de autenticación,
  login de vendor móvil sin desbordamiento y redirecciones sin sesión que
  conservan el destino. No se probó una aprobación con sesiones reales.
- API local restaurada: `/health` devuelve `200 OK`; siete comprobaciones de
  rutas protegidas/registro cerrado devolvieron los `401`/`403` esperados mediante
  el SDK. Las lecturas públicas confirman **cero categorías y cero regiones**;
  no se añadieron datos comerciales de demostración para ocultar esa dependencia.
- Tras el ajuste de la función, el asesor de Supabase no reporta advertencias
  ni errores nuevos del módulo. Los tres avisos informativos de RLS sin políticas
  son intencionales para tablas privadas del backend. Persisten 201 avisos de
  tablas públicas preexistentes sin RLS, fuera de esta modificación de permisos.
- No se ejecutó la suite HTTP destructiva en infraestructura compartida, no se
  enviaron correos, no se hizo despliegue externo y no se hizo commit ni push.

## Ampliación de QA, Resend e inventario · 2026-09-05

- 268 tests correctos: web 44, admin 33, vendor 34 y API 157; lint sin errores
  (cinco advertencias documentadas por imports nativos de inventario), tipos,
  contratos, dependencias pares y cuatro builds correctos. La compilación usó
  `AUTH_EMAIL_ENABLED=false` únicamente en ese proceso, no en el entorno local.
- Cuatro pruebas de concurrencia con PostgreSQL real correctas; artículos,
  reservas y ubicación de QA eliminados mediante workflows nativos.
- Login real del comprador y administrador comprobado. Corregida la confusión
  entre caída del API, sesión vencida y credenciales incorrectas.
- Resend confirmó entrega del correo de conexión al administrador; el envío al
  comprador fue rechazado por la restricción del remitente de pruebas.
- Se añadió una categoría explícita de QA, no un catálogo comercial. No se
  confirmó el guardado de la solicitud ni se creó o aprobó una tienda del comprador.
- El API quedó detenido tras encontrar agotada la cuota de Redis; los frontends
  siguen abiertos. La entrega de correos desde la app y el recorrido completo
  hasta el portal vendor permanecen pendientes de Redis y del dominio de Resend.

La evidencia y las limitaciones se detallan en
[el informe de QA](reports/vendor-qa-resend-inventory.md).
