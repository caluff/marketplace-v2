# Fase 1: catálogo, almacén, ofertas y preparación de cobros

Fecha: 2026-09-05. Actualización de integración: 2026-09-06 UTC.
Estado: código integrado, dos migraciones aplicadas y controles de compilación
aprobados. QA real parcial de almacén, catálogo, administración y alta de Stripe.
La fase no está cerrada: faltan verificaciones integrales
y mejoras adicionales de rendimiento. No se habilitan ventas reales.
Evidencia y pendientes consolidados: [informe de integración](../reports/phase-1-integration-qa.md).

## Objetivo y límites

Completar la preparación del vendedor aprovechando Mercur 2.3.3 y Medusa 2.18.0:
productos con variantes e imágenes, ofertas con precio e inventario, un almacén
por tienda, alta de Stripe Connect y mejor rendimiento del portal.

La aprobación del vendedor, la aprobación del producto, la disponibilidad de su
oferta y la habilitación de cobros son condiciones independientes. Ningún cambio
de interfaz debe sustituir su comprobación en el backend.

Esta fase prepara el catálogo comercial y Connect. El checkout completo del
comprador, envíos, operación de pedidos y recuperación de reembolsos/disputas
requieren sus propios criterios de aceptación antes de abrir ventas reales.
No se presentará un catálogo preparado como una tienda lista para producción.

## Decisiones confirmadas

### Instrucción posterior: prioridad de los flujos nativos

El usuario confirmó posteriormente que se utilicen **siempre los flujos
recomendados por Mercur en esta implementación**, y que las diferencias con sus
reglas iniciales se informen al finalizar para decidir ajustes después.
Las reglas iniciales que siguen se conservan como historial, no como autorización
para sustituir el cobro, la cancelación o las liquidaciones nativas.

- Usar autorización manual al comprar y captura según el pipeline nativo.
- Confirmación posterior: en una compra multivendedor, si una tienda supera las
  72 horas sin preparar su parte, cancelar únicamente esa parte. Conservar las
  demás y ajustar la captura única; no cancelar la compra completa por esa tienda.
- Si a las 72 horas la parte de una tienda está parcialmente preparada, queda
  pendiente de revisión administrativa: sin cancelación automática ni transferencia
  a esa tienda hasta resolverla. Confirmado por el usuario al retomar esta fase.
- Mantener los plazos y condiciones nativos de captura/cancelación/transferencia;
  no incorporar por ahora la retención personalizada de 7 días tras la entrega.
- Usar el proveedor oficial `@mercurjs/payout-stripe-connect@2.3.3` y su
  onboarding alojado en Stripe. No crear un proveedor Accounts v2 paralelo.
- Registrar las diferencias frente a comisión, devolución y recuperación de deuda
  anteriores sin afirmar que el flujo nativo implementa esas reglas.
- Se mantienen pruebas exclusivamente test, US/USD, controles de autorización,
  almacén único solicitado y límite de consumo de Redis. Los jobs de dinero no se
  activan sin completar y verificar su configuración.
- El usuario eligió Supabase Storage para las imágenes de productos.
  La configuración S3 ya se verificó mediante subida, moderación y recarga real.

### Reglas iniciales (comparar con el flujo nativo al cierre)

- La empresa operadora se registrará en Estados Unidos, con operación en Florida.
  El plugin ya permite consultar la cuenta de pruebas y la cuenta real. Esto
  no acredita activación comercial ni registros fiscales.
- La operación inicial se limita a Estados Unidos y USD. No convertir datos
  preexistentes en EUR ni sus precios sin revisar antes su origen y uso.
- Una compra admite productos de varios vendedores y un único pago del comprador.
  El cobro se confirma al completar el checkout; transferir a vendedores es otro
  proceso, separado del cobro y del pago bancario.
- Comisión inicial del 8%, editable por un administrador autorizado. Su base es
  productos después de descuentos más envío, excluyendo impuestos. La plataforma
  absorbe los costes de procesamiento y Connect dentro de su comisión, sin
  descontarlos de nuevo al vendedor.
- La comisión y el plazo de liberación se guardan como snapshot por pedido.
  Cambios administrativos auditados aplican solo a pedidos nuevos.
- Liberación de la parte del vendedor a los 7 días naturales de entrega
  confirmada, por pedido de cada vendedor. El comprador confirma recepción o el
  administrador verifica evidencia; el vendedor no puede confirmar su entrega.
- Una incidencia abierta pausa el importe afectado, no todos los pedidos.
  Los pagos bancarios serán automáticos cuando los fondos sean elegibles y estén
  disponibles; no se promete que lleguen al banco el día de liberación.
- Cada vendedor es responsable de su envío: tarifa fija configurable por vendedor
  y pedido, no por artículo; las tarifas se suman y muestran antes de pagar.
  Despacho máximo de 3 días hábiles desde el pago confirmado y registro de
  transportista/seguimiento. No se ha acordado cancelación automática por demora.
- No hay devolución voluntaria por cambio de opinión. La política se muestra
  antes de pagar. Se mantiene «Ayuda con este pedido» para incidencias reales y
  revisión manual del administrador; no hay reembolso automático del comprador.
- Los 7 días de liberación no extinguen derechos aplicables ni disputas bancarias.
  Reembolsos parciales revierten solo la comisión sobre productos/envío realmente
  reembolsados, con la tasa original; los impuestos quedan fuera de esa base.
- Si la incidencia es atribuible al vendedor y exige devolver el producto, este
  asume el envío de retorno. Si ya recibió una transferencia, recuperar su parte
  del saldo disponible/futuras liquidaciones y registrar cualquier deuda pendiente.
- Precios del catálogo antes de impuestos; mostrar envío, impuestos aplicables y
  total antes de cobrar. No existen registros de sales tax confirmados: probar en
  modo test y revisar obligaciones/altas fiscales con asesoría antes de ventas reales.
- Cada vendedor tendrá un único almacén, inicialmente con la dirección de su
  solicitud aprobada. No habrá creación libre de múltiples almacenes.
- Se utilizará Stripe Connect; los vendedores deben completar su configuración
  antes de poder vender. Pueden preparar su catálogo sin que eso habilite cobros.
- La integración y QA de Stripe se harán exclusivamente en pruebas.
- Se conserva el diseño existente, los componentes shadcn y Sonner del portal.
- El trabajo se coordina desde la sesión principal, en el mismo worktree; las
  tareas delegadas tienen áreas de responsabilidad explícitas.
- No se añaden consultas periódicas a Redis ni se duplican servidores para QA.
- Usar date-fns para fechas. Effect se evaluó, pero no se adopta por ahora: no se
  identificó una necesidad que justifique otro runtime sobre workflows de Medusa.

## Prerrequisitos y decisiones todavía pendientes

- Almacenamiento duradero de imágenes: Supabase Storage configurado y verificado.
  Las credenciales S3 permanecen exclusivamente en el servidor.
- Fiscalidad real: faltan evaluación de obligaciones y registros aplicables.
  Esto bloquea ventas reales, no el desarrollo ni las pruebas simuladas.
- Invoicing: no se ha definido necesidad de facturación adicional al recibo de
  pago. No activar generación de facturas ni costes de Invoicing por defecto.
- Webhooks: secretos reales de prueba configurados y entrega firmada de
  `account.updated` verificada con HTTP 200; una solicitud sin firma recibió 400.
  Los listeners temporales de QA se detienen al cerrar la revisión; deben
  iniciarse nuevamente para continuar pruebas locales de eventos. El despliegue
  necesitará sus propios endpoints/secretos. Nunca marcar el alta completa por
  la URL de retorno.
- Perfil de plataforma/aceptaciones legales de Connect: el operador debe
  completar las que Stripe requiera; el agente no las acepta en su nombre.
- Revisar datos existentes en EUR antes de configurar USD. No reinterpretar
  importes ya persistidos como otra moneda.

Por la instrucción posterior del usuario, usar el flujo nativo y presentar sus
diferencias al cierre, sin seguir preguntando por cada regla comercial. Solicitar
solo credenciales/prerrequisitos realmente ausentes. No inventar datos fiscales,
firmas de webhook o tarifas para desbloquear QA.

## Secuencia de implementación

| Bloque                    | Entrega                                                                           | Dependencias                                                    |
| ------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 0. Contratos y decisiones | Contratos de Mercur verificados, reglas confirmadas y plan de Stripe              | Completado; quedan prerrequisitos específicos listados arriba   |
| 1. Almacén único          | Aprovisionamiento idempotente desde la solicitud y alcance obligatorio en backend | Contratos de aprobación, ubicaciones y enlaces                  |
| 2. Catálogo y medios      | Opciones, variantes, SKU, categorías e imágenes con moderación existente          | Contratos nativos; almacenamiento para persistencia de medios   |
| 3. Ofertas e inventario   | Ofertas por variante, precios, artículos y niveles en el único almacén            | Bloques 1–2, moneda y perfil de envío válido                    |
| 4. Stripe Connect         | Alta, requisitos pendientes, actualización de estado y bloqueo de venta           | Planificador, reglas confirmadas y compatibilidad del proveedor |
| 5. Rendimiento            | Reducir inicialización repetida y consultas innecesarias sin debilitar permisos   | Auditoría y pruebas de aislamiento/revocación                   |
| 6. Integración y QA       | Recorrido completo de preparación con estados reales y fallos recuperables        | Bloques anteriores y servicios de prueba configurados           |

Rendimiento puede trabajarse en paralelo con catálogo y almacén una vez
delimitado el parche. La integración final permanece a cargo del coordinador.

### 1. Almacén único

- Reutilizar Stock Location, enlaces de seller e Inventory de Medusa/Mercur.
- Usar la revisión aprobada de la solicitud, no un borrador que pueda cambiar.
- Integrar la creación en el flujo de aprovisionamiento con idempotencia,
  recuperación de resultados inciertos y compensación de recursos propios.
- En tiendas preexistentes: inspeccionar antes de actuar; reutilizar una ubicación
  válida o aprovisionar la ausente. Si existen varias, informar el conflicto;
  no borrar ni fusionar existencias automáticamente.
- No basta con retirar el botón de la UI: impedir también una segunda ubicación
  y rechazar referencias a almacenes ajenos desde rutas de ofertas/inventario.
- No propagar cambios de dirección comercial sobre un almacén operativo sin
  definir antes esa política.

### 2. Catálogo y medios

- Mantener el catálogo maestro y los productos propuestos/cambios moderados de
  Mercur. El vendedor no se concede a sí mismo la aprobación del producto.
- Completar opciones y combinaciones de variantes, identificadores y categorías
  usando contratos nativos. Evitar combinaciones duplicadas y referencias ajenas.
- Conservar la propuesta de categorías al administrador; no crear categorías
  públicas por el simple envío de texto desde un vendedor.
- Añadir imágenes mediante el módulo File, con validación de tamaño, contenido,
  propiedad y errores recuperables. No introducir URLs arbitrarias como sustituto
  de una subida persistente.
- La selección del proveedor duradero debe preceder a declarar cumplida la
  persistencia. No contratar infraestructura ni incluir secretos en el navegador.

### 3. Ofertas e inventario

- Reutilizar `/vendor/offers` y `createOffersWorkflow`; una oferta conecta la
  variante maestra con SKU, precios, perfil de envío e inventario del vendedor.
- Los precios se conservan en unidades de presentación de Medusa. La conversión
  requerida por Stripe pertenece exclusivamente al límite del proveedor.
- Crear/vincular los artículos y sus niveles iniciales mediante workflows;
  restringir todas las ubicaciones al único almacén de la tienda.
- Respetar el contrato de reemplazo de precios al editar para no eliminar
  inadvertidamente monedas o escalas que no se mostraron en el formulario.
- Mantener la extensión de concurrencia ya implementada: reservas y ajustes
  comparten bloqueos. No reemplazarla por comprobaciones solo en el cliente.
- No generar perfiles/tarifas de envío ficticios para satisfacer campos obligatorios.

### 4. Stripe Connect y preparación para vender

- El plugin ya está autenticado. Se ejecutó `stripe_implementation_planner` en
  modo test y se completó su árbol de decisiones. Guía:
  `iguide_61VLqz3FNFQ1OZ85441LYDSAMFoVr`, estado `accepted`.
  Esa aceptación finaliza una recomendación técnica, no términos legales, recursos
  de Stripe ni una implementación validada.
- El patrón recomendado es separate charges and transfers: un cobro en la
  plataforma, reparto entre varias cuentas y comisión retenida al transferir.
  El planificador propuso acceso Express y onboarding embebido. Por la instrucción
  posterior del usuario se usa Express con onboarding alojado, como el proveedor
  nativo de Mercur. No activar productos de pago adicionales
  de gestión de fraude por el mero hecho de que la guía los mencione.
- Las claves de pruebas suministradas están en archivos ignorados: secreto
  `STRIPE_API_KEY` en el `.env` raíz y clave pública
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` en los frontends web/vendor. No se
  configuraron secretos de webhook ficticios.
- La guía incluida de Mercur documenta dos proveedores: Payment para el cobro y
  Payout para transferir a vendedores. No sustituir el registro de pagos/pedidos
  de Medusa por un segundo sistema independiente.
- La diferencia entre Accounts v1 nativo y Accounts v2 del planificador se
  resolvió siguiendo la prioridad de Mercur: proveedor oficial 2.3.3, sin un
  adaptador paralelo, conservando PayoutAccount/Onboarding nativos.
- Se verificó y actualizó mediante el workflow administrativo nativo la comisión
  global de 0% a 8%. Se conservaron `include_tax: false` e
  `include_shipping: false`, siguiendo la instrucción posterior de priorizar
  Mercur. Su base nativa es el subtotal anterior a descuentos; no equivale a la
  base inicial acordada. El panel propio ya expone su edición en
  `/dashboard/commissions`.
- El alta y la corrección de requisitos deben usar componentes/flujo de Stripe,
  sin almacenar documentos de identidad o cuentas bancarias en nuestros formularios.
- Incorporar estado persistente, acceso para continuar la configuración y aviso
  de requisitos pendientes. No marcar una cuenta lista únicamente al regresar
  desde Stripe: verificar capacidades del proveedor y cambios por webhooks.
- Verificar firmas, separar los eventos de pago y de cuenta, procesar reintentos
  idempotentemente y contemplar eventos duplicados o fuera de orden.
- Comprobar la preparación en el backend antes de permitir venta/transferencia;
  conservar el bloqueo ante pérdida de capacidades o suspensión de la tienda.
- Las reglas iniciales de captura/liberación no se implementan como extensiones.
  Antes de activar jobs, verificar su existencia en el paquete instalado, además
  de frecuencia, reintentos, consumo e idempotencia. La documentación de Mercur
  no demuestra por sí sola que un job venga incluido en esta versión.
  Conservar todas las operaciones de desarrollo en modo test.
- Actualización condicionada de Mercur: no se realiza. El registro npm mantiene
  2.3.3 como última versión estable; 2.3.4-canary.3 no añade la automatización
  buscada. Los valores de plazo del módulo no sustituyen jobs: el paquete
  inspeccionado no incluye los programadores de captura/cancelación/payout.

### 5. Rendimiento

La [auditoría previa](../reports/vendor-navigation-performance.md) ya eliminó
una consulta redundante de membresía y añadió límites de carga. Las mediciones
históricas no prueban la latencia actual ni aíslan cada consulta SQL.

- Auditar `ensureSellerDefaultRoles`, llamado repetidamente por el middleware
  de alcance de vendedor. Separar preparación de roles de comprobación de
  permisos solo con readiness, reintentos y pruebas de revocación.
- No desactivar RBAC ni guardar autorizaciones del usuario en una caché global.
- Revisar la selección de productos compartidos/propios sin recorrer vínculos
  ajenos innecesariamente ni alterar la visibilidad autorizada.
- Sustituir el N+1 de niveles/ubicaciones por lecturas acotadas y autorizadas
  cuando el contrato lo permita; preservar paginación y ubicaciones permitidas.
- Mantener deduplicación por render y paralelizar lecturas independientes de la
  UI sin introducir polling de permisos, stock o estado de Stripe.
- Comparar consultas y navegación con una muestra pequeña antes/después. No
  prometer un tiempo de respuesta sin medición ni usar carga contra Redis compartido.

## Validación y criterio de cierre

- Pruebas de dos vendedores: lecturas y mutaciones no admiten IDs ajenos.
- Almacén: aprobación repetida/concurrente no duplica la ubicación; errores no
  eliminan recursos preexistentes ni permiten aprobar nuevamente a ciegas.
- Catálogo/ofertas: variantes válidas, precios preservados, moderación correcta,
  imágenes recuperables y datos realmente recargados desde el backend.
- Inventario: creación de niveles y carreras con reservas/ajustes nativos.
- Connect: repetir/cancelar/retomar alta, requisitos pendientes, restricción
  posterior, reintentos de webhook y prohibición de venta con cuenta no preparada.
- Rendimiento: contar consultas además de medir la UI; verificar permisos recién
  revocados, fallos transitorios y reintento del inicializador.
- Ejecutar lint, typecheck, tests y build de cada aplicación afectada y del API.
  Comprobar contratos y dependencias pares si cambian paquetes.
- Usar infraestructura desechable para tests destructivos. No ejecutar suites
  que crean/restauran bases contra PostgreSQL o Redis compartidos.
- La evidencia final distinguirá implementación, tests ejecutados y verificaciones
  bloqueadas. No considerar completa la fase con piezas obligatorias pendientes.

## Referencias de la revisión

- Documentación instalada `@mercurjs/docs@2.3.3`: integración Stripe Connect,
  ofertas, cuentas de payout, onboarding y workflows de creación.
- Contrato instalado `PayoutProviderService`: admite exactamente un proveedor y
  delega creación de cuenta, onboarding, payout y traducción de webhooks.
- [Stripe: Accounts v2](https://docs.stripe.com/connect/accounts-v2): configuraciones
  de cuenta y compatibilidad con endpoints existentes.
- [Stripe: cobros y transferencias separados](https://docs.stripe.com/connect/separate-charges-and-transfers):
  patrón para distribuir un cobro entre varias cuentas, coherente con la compra
  multivendedor confirmada por el operador.
- [Stripe: onboarding embebido](https://docs.stripe.com/connect/embedded-onboarding)
  y [componentes Connect](https://docs.stripe.com/connect/get-started-connect-embedded-components),
  enlaces del árbol recomendado por el planificador.
- Context7: Mercur (`/mercurjs/mercur`), Stripe (`/websites/stripe`) y Next.js
  (`/vercel/next.js`). Contrastar ejemplos actuales con las versiones instaladas.

## Estado de esta revisión

- [x] País de la empresa confirmado por el usuario.
- [x] Claves de pruebas guardadas en archivos ignorados, sin valores en este plan.
- [x] Contratos base y riesgos de compatibilidad identificados.
- [x] Completar auditorías delegadas y anexar conclusiones en `docs/reports/phase-1-*`.
- [x] Reautenticar Stripe y completar la guía de su herramienta.
- [x] Confirmar y registrar reglas comerciales de compra, comisión y liberación.
- [x] Resolver persistencia de imágenes; quedan otros prerrequisitos de integración.
- [x] Integrar código, aplicar migraciones y aprovisionar el almacén de la tienda de QA.
- [x] Ejecutar lint, typecheck, pruebas y builds afectados; verificar dependencias pares.
- [x] Verificar propuesta de producto con variante, acceso administrativo y alta alojada de Stripe.
- [ ] Implementar, integrar y validar los bloques de esta fase.
