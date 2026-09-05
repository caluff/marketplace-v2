# Alta y operación de vendedores

Implementación para Mercur 2.3.3 y Medusa 2.18.0. El diseño previo y las
particularidades de estas versiones están en [el plan](plans/vendor-onboarding.md).
Este documento distingue las capacidades conectadas de los requisitos de puesta
en producción; no certifica una operación comercial completa.

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

| Ruta                                   | Capacidad y límite                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Web `/account/sell`                    | Borrador, envío, estado, correcciones e historial/notificaciones dentro de la cuenta.                                                    |
| Admin `/dashboard/vendor-applications` | Cola, detalle y decisión de solicitudes, con permisos y control de versión.                                                              |
| Admin `/dashboard/product-review`      | Moderación nativa de productos propuestos y de cambios pendientes. No configura precios ni ofertas.                                      |
| Vendor `/seller`                       | Conteos reales, pedidos recientes y preparación de la tienda. Sin métricas financieras simuladas.                                        |
| Vendor `/seller/catalog`               | Catálogo accesible y detalle; creación de productos y envío de cambios a la revisión de Mercur. No equivale a crear una oferta vendible. |
| Vendor `/seller/inventory`             | Consulta y ajuste del total físico en niveles existentes. Crear una ubicación no vincula automáticamente artículos ni configura envíos.  |
| Vendor `/seller/inventory/locations`   | Ubicaciones vinculadas a la tienda y creación de ubicación.                                                                              |
| Vendor `/seller/orders`                | Lista y detalle de pedidos asignados a la tienda, en modo consulta.                                                                      |
| Vendor `/seller/settings`              | Edición de perfil, dirección comercial y nombre de empresa.                                                                              |

El catálogo compartido publicado de Mercur puede ser visible a más de una tienda.
Los productos privados y los registros de inventario requieren el alcance de la
tienda. La API vuelve a comprobar la membresía activa y el estado operativo; una
cookie válida por sí sola no mantiene acceso a una tienda suspendida.

## Requisitos pendientes para producción

- **Correo transaccional:** Resend está integrado con Notification de Medusa y
  sus seis plantillas. Falta verificar un dominio propio y configurar un remitente
  autorizado. En el entorno privado del backend: `RESEND_API_KEY`,
  `AUTH_EMAIL_ENABLED=true`, `RESEND_FROM_EMAIL`, `STOREFRONT_URL`, `ADMIN_URL` y
  `VENDOR_URL`. El remitente `onboarding@resend.dev` solo permite pruebas al
  propietario de la cuenta de Resend y está rechazado por la configuración de
  producción. El job `vendor-application-notifications` procesa las notificaciones
  pendientes cuando proveedor y Redis están disponibles. No saltar la verificación
  para probar cuentas reales. Consultar
  [configuración, idempotencia y recuperación](../packages/api/src/modules/resend/README.md).
  `AUTH_EMAIL_FROM` sigue siendo compatible si `RESEND_FROM_EMAIL` no existe.
  El job sale al primer resultado vacío o fallido y no inicia workflows con el
  correo deshabilitado; conserva un máximo de 20 envíos por ejecución.
- **Redis disponible:** la QA encontró la cuota mensual de Upstash agotada
  (límite 500000 solicitudes). Recuperar capacidad en la instancia existente y
  revisar el consumo de los workers antes de continuar. No sustituir ni vaciar
  Redis para eludir el límite: contiene colas, workflows y bloqueos compartidos.
- **Configuración comercial:** habilitar categorías y monedas reales. El flujo
  no inventa categorías, almacenes, regiones ni productos. Configurar variantes,
  ofertas/precios, vínculos de inventario y distribución comercial antes de
  considerar un producto comprable. Los productos nuevos se crean propuestos
  para revisión. Los borradores preexistentes requieren que el operador haga
  avanzar su estado: la edición nativa de vendor no acepta ese cambio.
- **Mantenimiento del inventario:** el ajuste de vendor ya usa comparación y
  escritura atómicas, con bloqueos compartidos con las operaciones nativas de
  reserva/ajuste. Cuatro carreras pasaron en PostgreSQL real. La extensión usa
  clases internas de Medusa 2.18.0, sin un equivalente público; requiere revisar
  compatibilidad y repetir esas carreras en cada actualización. No protege
  escrituras SQL que eludan los servicios. Consultar
  [el contrato de concurrencia](../packages/api/src/modules/inventory/README.md).
- **Operación posterior:** pagos, liquidaciones, comisiones, envíos, devoluciones,
  reembolsos, KYC y gestión de equipos no se habilitan con esta entrega. Requieren
  reglas y proveedores definidos, y un flujo propio probado.
- **Seguridad de Supabase:** las tres tablas nuevas del módulo tienen RLS y no
  conceden acceso a los roles públicos `anon`/`authenticated`. Las tablas nativas
  preexistentes deben revisarse antes de exponer la Data API; la autorización de
  Mercur no protege una consulta directa que el rol público pueda ejecutar. No
  se revocan permisos de otros consumidores automáticamente. Consultar el
  [aviso de RLS en tablas públicas](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public).
- **Verificación integral:** ejecutar la suite aislada y probar el recorrido
  autenticado completo con un remitente verificado antes de abrir altas en producción.
  Las comprobaciones de tipos y los tests unitarios no sustituyen esa validación.
- **Credenciales y logs:** rotar las claves compartidas durante la QA y las
  contraseñas de prueba antes de producción. Revisar el saneamiento de los logs
  nativos de infraestructura: un error de cuota de Redis puede incluir los
  argumentos del comando fallido, incluidos los de autenticación.

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
