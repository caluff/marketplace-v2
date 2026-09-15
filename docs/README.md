# Documentación del proyecto

Revisión documental: **2026-09-15**. El código contiene funcionalidades operativas
que no existían en los primeros informes. La auditoría de cierre sigue en
**Financial Readiness: FAIL** y su plan de implementación permanece **NOT STARTED**.
Actualizar documentación no equivale a resolver los hallazgos ni a repetir QA.

## Punto de entrada para implementar

| Documento                                                               | Uso y regla de mantenimiento                                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [Auditoría de cierre](develpment/development-completion-audit.md)       | Base histórica F01–F17, evidencia y definición de cierre. Solo corregir errores factuales demostrados; no borrar hallazgos resueltos |
| [Plan de implementación](develpment/development-implementation-plan.md) | Seis fases obligatorias P0/P1 y dependencias. Registrar cambios justificados de secuencia o alcance                                  |
| [Progreso](develpment/development-progress.md)                          | Handoff mutable: decisiones, archivos, migraciones, tests, resultados, bloqueos y siguiente acción de cada sesión                    |

Se conserva el nombre de carpeta `develpment` solicitado por el usuario.
Una nueva sesión debe leer esos tres archivos, el código y las instrucciones
`AGENTS.md` aplicables. Los números «Phase 1» de informes antiguos se refieren
a otro trabajo; no indican que la nueva Phase 1 financiera esté implementada.

## Guías vigentes

| Tema                              | Referencias                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Arquitectura, arranque y comandos | [README raíz](../README.md), [instrucciones del repositorio](../AGENTS.md)                                                                                                                             |
| Sesiones, actores y correo        | [Autenticación](../AUTHENTICATION.md), [Google OAuth](google-auth.md), [Resend](../packages/api/src/modules/resend/README.md)                                                                          |
| Búsqueda                          | [Algolia](algolia-search.md), [módulo de indexación](../packages/api/src/modules/algolia/README.md)                                                                                                    |
| Operación de vendedores           | [Guía vendor](vendor-operations.md), [README vendor](../apps/vendor/README.md)                                                                                                                         |
| Operación administrativa          | [README admin](../apps/admin/README.md), [feedback de formularios](admin-vendor-form-notifications.md)                                                                                                 |
| Pedidos                           | [Flujo de pedidos](orders-flow.md), [cancelaciones y reembolsos](order-finance.md)                                                                                                                     |
| Backend                           | [Rutas](../packages/api/src/api/README.md), [workflows](../packages/api/src/workflows/README.md), [módulos](../packages/api/src/modules/README.md), [links](../packages/api/src/links/README.md)       |
| Procesamiento asíncrono           | [Subscribers](../packages/api/src/subscribers/README.md), [jobs](../packages/api/src/jobs/README.md)                                                                                                   |
| Diagnóstico y pruebas             | [Scripts operativos](../packages/api/src/scripts/README.md), [tests de integración](../packages/api/integration-tests/http/README.md), [trazado de peticiones](reports/performance-request-tracing.md) |
| Tema e imágenes de medios de pago | [Theme sync](../packages/theme-sync/README.md), [assets de pagos](../apps/web/public/payment-methods/README.md)                                                                                        |
| Infraestructura ya declarada      | [Railway](../.railway/README.md); referencia existente, fuera de las fases obligatorias de cierre                                                                                                      |

Las guías describen el código actual y señalan sus límites conocidos. Sus
instrucciones de configuración no demuestran el estado remoto de ningún entorno.
Para prioridades de cierre prevalece la auditoría; para saber qué se implementó
después de ella, consultar progreso y Git.

## Planes e informes históricos

Se conservan porque explican decisiones, incidencias y pruebas que la auditoría
referencia. Sus fechas, comandos, resultados y cuerpos originales no se
reescriben como si hubieran sido verificados hoy.

- [Planes anteriores](plans): [onboarding](plans/vendor-onboarding.md), [comercio vendor](plans/phase-1-vendor-commerce.md) y [envíos](plans/vendor-managed-shipping.md). Documentan alcance y decisiones de esas etapas; no sustituyen el nuevo plan de cierre.
- [Informes de implementación y QA](reports): incluyen catálogo, inventario, onboarding, Stripe, comisiones, correo, checkout, pedidos y rendimiento. Las pruebas son válidas únicamente para las revisiones, fixtures y entornos descritos.
- QA financiera: [cancelaciones y reembolsos](reports/qa-order-finance-2026-09-12.md), [captura y reversiones](reports/qa-order-finance-extension-2026-09-12.md), [auditoría de seguridad de pagos](reports/qa-payment-safety-2026-09-12.md).
- QA de interfaces: [operador](reports/qa-admin-browser-2026-09-12.md), [pedidos](reports/qa-orders-browser-2026-09-12.md), [envíos vendor](reports/vendor-managed-shipping-qa.md).
- Primeras interfaces: [informe admin](../apps/admin/IMPLEMENTATION_REPORT.md) e [informe vendor](../apps/vendor/IMPLEMENTATION.md). Sus descripciones de mocks corresponden a la implementación inicial, no al estado completo actual.

`reports/performance-request-tracing.md` es una guía de diagnóstico vigente
ubicada en esa carpeta, no un certificado de rendimiento actual.

## Material que se conserva sin reescribir

`docs/skills` y las skills instaladas contienen instrucciones especializadas;
se leen cuando lo exige `AGENTS.md`. Los avisos de terceros y las instrucciones
generadas por herramientas conservan su procedencia. No se actualizan versiones,
licencias o recomendaciones de terceros mediante esta revisión documental.

Al cambiar una funcionalidad, actualizar su guía y el progreso con evidencia
de esa sesión. No duplicar resultados de tests en varios documentos como estado
permanente y no guardar tokens, credenciales ni valores de entorno sensibles.
