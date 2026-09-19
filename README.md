# marketplace-v2

Marketplace con storefront, panel de operador y panel de vendedor independientes sobre un backend modular Mercur/Medusa. El repositorio contiene flujos reales de catálogo, autenticación, onboarding, inventario, envío, checkout y pedidos. El desarrollo todavía no está cerrado: **Financial Readiness: FAIL**. Stripe está limitado a pruebas; el histórico de comisiones, la liquidación operativa y los dashboards financieros tienen pendientes documentados.

Documentación revisada el **15 de septiembre de 2026** contra el código. Esta actualización no implementa hallazgos ni constituye una nueva ejecución de QA. La evidencia de la auditoría corresponde al 13–14 de septiembre.

## Continuar el desarrollo

Leer en este orden, junto con las instrucciones aplicables de `AGENTS.md`:

1. [Auditoría de cierre](docs/develpment/development-completion-audit.md): evidencia, F01–F17 y criterio financiero.
2. [Plan de implementación](docs/develpment/development-implementation-plan.md): seis fases, dependencias y criterios de salida para P0/P1.
3. [Progreso y handoff](docs/develpment/development-progress.md): estado actual, verificaciones y siguiente acción.

La implementación permanece **NOT STARTED**. La siguiente fase es **Phase 1 — Financial Foundation**. El estado mutable se registra en el archivo de progreso; la auditoría no se reescribe al resolver hallazgos. La carpeta `docs/develpment` conserva el nombre solicitado para el handoff. El [índice documental](docs/README.md) distingue guías vigentes de planes e informes históricos.

## Arquitectura

| Área                 | Ubicación                              | Función                                                               | URL local                         |
| -------------------- | -------------------------------------- | --------------------------------------------------------------------- | --------------------------------- |
| Storefront           | `apps/web`                             | Catálogo, cuenta, carrito, checkout y solicitud de vendedor           | `http://localhost:3000`           |
| Admin                | `apps/admin`                           | Operación del marketplace, revisión de vendedores, catálogo y pedidos | `http://localhost:7000/dashboard` |
| Vendor               | `apps/vendor`                          | Ofertas, inventario, almacén, envíos, pedidos y cuenta Connect        | `http://localhost:7001/seller`    |
| API / worker         | `packages/api`                         | Mercur 2.3.3 / Medusa 2.18.0; modos server, worker y shared           | API: `http://localhost:9000`      |
| Tema                 | `packages/theme-sync`                  | Contrato y sincronización de preferencias visuales                    | —                                 |
| Contratos onboarding | `packages/vendor-onboarding-contracts` | Contratos de transporte compartidos del alta de vendedor              | —                                 |

Las aplicaciones usan Next.js 16.3.4, React 19 y TypeScript. Se comunican con las APIs mediante SDKs; no acceden directamente a PostgreSQL o Redis. El admin Vite integrado está desactivado porque el operador usa su propia aplicación Next.js. PostgreSQL/Supabase persiste datos y Redis participa en caché, eventos, workflows y locks; producción lo provisiona dentro de Railway.

Hay un único workspace pnpm y lockfile raíz. Las versiones, overrides y patches vigentes están en [package.json](package.json), [pnpm-workspace.yaml](pnpm-workspace.yaml) y `pnpm-lock.yaml`; consultar esos contratos antes de actualizar dependencias.

## Alcance implementado y límites

- **Cliente:** catálogo con ofertas reales, categorías, búsqueda Algolia con filtros/paginación, cuenta, favoritos, carrito, checkout, confirmación e historial de pedidos. La continuidad del catálogo inicial/categorías y ciertos desgloses monetarios siguen pendientes (F10/F11).
- **Vendedor:** solicitud desde una cuenta de comprador y revisión administrativa, portal autenticado, catálogo maestro y ofertas propias, imágenes, inventario, un almacén aprobado, envíos y preparación/seguimiento de pedidos. El registro genérico de sellers permanece desactivado deliberadamente.
- **Operador:** autenticación y controles conectados al backend, revisión de solicitudes y vendedores, catálogo, pedidos y configuración de comisiones. Los dashboards actuales son operativos; aún no proporcionan el reporte financiero exigido por F09.
- **Dinero:** checkout USD/Estados Unidos con Stripe TEST, autorización compartida por carrito, captura por operador, cancelación y reembolsos por tienda, incluida reversión proporcional de transferencias verificadas. Existe journal y bloqueo de resultados inciertos. Siguen abiertos histórico, redondeo, validación, cobertura de escritores, liquidación y recuperación (F01–F08).
- **Integraciones:** Google OAuth, correo Resend, Algolia, imágenes mediante almacenamiento S3 compatible de Supabase y Stripe Connect se registran según configuración. Su presencia en código no acredita la configuración o entrega remota de cada entorno.

La comisión observada en la auditoría es configurable en backend, no una constante contractual. No equiparar GMV, comisiones, transferencias al connected account y payouts bancarios. Consultar el [flujo financiero](docs/order-finance.md) y las fuentes de verdad de la auditoría antes de modificar pagos o métricas.

## Requisitos y entorno local

- Node.js compatible con el mínimo declarado (`>=20.9.0`) y las dependencias instaladas.
- pnpm 12.0.0, declarado en `packageManager`; usar exclusivamente pnpm.
- PostgreSQL y Redis accesibles desde desarrollo. Redis acepta `redis://` en redes privadas confiables, como Railway, y `rediss://` para conexiones TLS externas.

Las credenciales backend van en el `.env` ignorado de la raíz. Medusa encuentra esa raíz desde fuente o artefacto compilado. No copiar secretos a documentación, código ni variables `NEXT_PUBLIC_*`.

| Configuración         | Variables / referencia                                                                                                                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API básica            | `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `COOKIE_SECRET`; secretos de firma distintos, no placeholders y de al menos 32 caracteres                                                                              |
| Orígenes y procesos   | `STORE_CORS`, `ADMIN_CORS`, `VENDOR_CORS`, `AUTH_CORS`; `MEDUSA_WORKER_MODE` (`shared` por defecto local)                                                                                                         |
| Frontends             | `NEXT_PUBLIC_MEDUSA_BACKEND_URL`; storefront además `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`, asociada al canal correcto                                                                                              |
| Login y correo        | [Autenticación](AUTHENTICATION.md) y [Google OAuth](docs/google-auth.md)                                                                                                                                          |
| Stripe TEST / Connect | `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PAYOUT_WEBHOOK_SECRET`, `VENDOR_PUBLIC_URL`; [guía vendor](docs/vendor-operations.md). No habilitar jobs financieros como parte del arranque básico            |
| Búsqueda              | `ALGOLIA_APP_ID`, `ALGOLIA_API_KEY`, `ALGOLIA_PRODUCT_INDEX`; [guía Algolia](docs/algolia-search.md)                                                                                                              |
| Imágenes              | `SUPABASE_S3_ENDPOINT`, `SUPABASE_S3_REGION`, `SUPABASE_S3_ACCESS_KEY_ID`, `SUPABASE_S3_SECRET_ACCESS_KEY`, `SUPABASE_STORAGE_BUCKET`; [configuración fuente](packages/api/src/lib/file-storage-configuration.ts) |

Para storefront local, `apps/web/.env.local` admite solo configuración pública. Los paneles también necesitan su URL pública del backend en el entorno Next; seguir los [README admin](apps/admin/README.md) y [README vendor](apps/vendor/README.md). Las integraciones condicionales tienen requisitos adicionales: las variables mínimas no bastan para probar correo, imágenes, búsqueda o checkout completo.

## Instalar y ejecutar

```bash
pnpm install
pnpm dev
```

Antes del primer arranque, configurar el entorno y verificar las migraciones de la base seleccionada. `pnpm db:migrate` **modifica esa base**: ejecutarlo como paso explícito contra el destino de desarrollo autorizado, siguiendo las skills/instrucciones de migraciones. Arrancar no crea por sí solo regiones, vendedores aprobados, ofertas, stock, opciones de envío o cuentas Stripe aptas para comprar.

`pnpm dev` inicia API, web, admin y vendor. El modo API local `shared` incluye trabajo asíncrono; no hace falta iniciar otro worker para ese mismo modo. Los comandos `dev:web`, `dev:admin`, `dev:vendor` y `dev:api` ejecutan un área. La API ofrece `/health`; los accesos son `/login` (admin) y `/seller/login` (vendor), con autenticación real.

## Verificación

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm peers check
```

`lint:*`, `typecheck:*`, `test:*` y `build:*` tienen variantes `web`, `admin`, `vendor` y `api`. `pnpm test` incluye además `test:theme`. Un cambio exclusivamente documental necesita revisión de formato, enlaces y diff; no requiere builds de aplicaciones.

`pnpm test:smoke` ejecuta los tests admin y la integración HTTP de API. Los comandos `test:api:integration:http` y `test:api:integration:modules` requieren infraestructura de pruebas y pueden preparar/modificar datos: consultar su [guía](packages/api/integration-tests/http/README.md). No tratar scripts operativos de QA como tests unitarios ni ejecutarlos contra datos compartidos sin comprobar su alcance.

Los resultados históricos están fechados en informes y auditoría. No constituyen verificación del siguiente cambio: cada fase exige registrar comandos, resultados y verificaciones pendientes en el handoff.

## Definiciones de infraestructura existentes

[.railway/README.md](.railway/README.md) documenta los cinco servicios, comandos y variables. El worker reutiliza el backend; `pnpm build` compila cada aplicación una vez. Los artefactos backend se preparan con `build:api:deploy` / `build:worker:deploy` y tienen comandos `start:*` independientes.

Estas definiciones no certifican cierre de desarrollo ni preparación para producción. El plan de cierre no incluye dominios, escalado ni despliegue definitivo.
