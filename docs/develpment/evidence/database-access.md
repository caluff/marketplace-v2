# F06 — Backend-only database access

Fecha: 2026-09-19. Estado: implementado; integración SQL aislada verificada. Aplicación remota pendiente de autorización específica. No certifica la exposición externa de Data API.

## Diagnóstico actual

Inspección de metadatos en una transacción `BEGIN READ ONLY` contra la conexión de desarrollo: 209 tablas en `public`, todas del propietario backend; 201 permiten SELECT a `anon`. No hay vistas, tablas externas ni rutinas SECURITY DEFINER en ese esquema. Las aplicaciones consumen Medusa/Mercur, no la Data API de Supabase. Storage usa el servicio S3 y su esquema independiente.

## Cambio y alcance

`packages/api/src/modules/commerce-automation/migrations/Migration20260919120000.ts` endurece el esquema `public` dedicado a Medusa. Se conserva acceso explícito del propietario, se elimina acceso al esquema de `PUBLIC`, `anon` y `authenticated`, se habilita RLS y se revocan grants públicos sobre relaciones y rutinas propias. Los objetos de extensiones quedan fuera del recorrido de modificaciones individuales.

La migración falla antes de alterar permisos si hay un propietario no revisado, un esquema distinto o un consumidor no propietario sin BYPASSRLS cuyo grant se rompería al habilitar RLS. Es necesario definir previamente su política explícita. El backend actual usa el propietario; no se exige ampliar privilegios de ningún rol. Los grants explícitos a consumidores backend con BYPASSRLS se conservan y se prueban con SELECT/UPDATE efectivos.

Los defaults de tablas/secuencias futuras se revocan para el creador de la migración. PostgreSQL no permite restar el EXECUTE global de funciones mediante un REVOKE por esquema: la denegación de USAGE/CREATE en `public` protege también funciones/procedimientos futuros y objetos de otros creadores. No se cambian defaults globales del propietario que afectarían esquemas ajenos. Si posteriormente se reabre el esquema a roles públicos, se necesita revisar todos sus objetos y defaults; no basta modificar un GRANT aislado.

La comprobación final rechaza permisos heredados que todavía den acceso al esquema a roles públicos. Todo el bloque SQL es atómico. `down()` rechaza una reapertura automática; cualquier restauración requiere grants explícitos revisados. No se modifican datos comerciales.

## Verificación

Suite `src/modules/commerce-automation/__tests__/database-access.integration.spec.ts`, PostgreSQL 17.11 real dedicado en loopback con TLS validado. Bases aleatorias `closure_access_*` creadas y eliminadas exclusivamente por la suite; propietarios de fixture sin superuser ni BYPASSRLS. Proveedores externos deshabilitados.

Comando, después de cargar la configuración desechable en el mismo proceso:

```powershell
$env:DATABASE_ACCESS_TESTS = 'disposable-local'
pnpm --filter @marketplace-v2/api test:integration:modules --runTestsByPath src/modules/commerce-automation/__tests__/database-access.integration.spec.ts
```

Resultado: **6 PASS**, incluyendo lectura/escritura denegadas, vistas/rutinas/secuencias, objetos futuros, CRUD propietario, consumidor backend explícito, conservación de otro esquema, propietario desconocido, consumidor sin política, fallo tardío con rollback y negativa a rollback inseguro. Se ejecuta el SQL de la clase de migración; no es una simulación del motor SQL.

Suite `integration-tests/http/database-hardening.spec.ts`: runner completo de Medusa sobre PostgreSQL/Redis TLS desechables, todas las migraciones y enlaces nativos cargados. **2 PASS**: health HTTP, CRUD mediante módulo de clientes, permisos denegados para tablas nativas de cliente/pago/autenticación y tabla futura, y SELECT efectivo rechazado con rol público. Cada ejecución posee una base y plantilla aleatorias `closure_schema_*`. Los roles `anon` y `authenticated` son fixtures NOLOGIN del clúster desechable; no se crean roles remotos.

```powershell
$env:DATABASE_ACCESS_TESTS = 'disposable-local'
pnpm --filter @marketplace-v2/api test:integration:http --runTestsByPath integration-tests/http/database-hardening.spec.ts
```

Gates API: lint PASS (51 advertencias, ninguna falla), typecheck PASS, build PASS; 68 suites / 883 pruebas unitarias PASS y 3 pruebas de scripts de deployment PASS. La primera ejecución de la suite HTTP detectó una firma incorrecta de `updateCustomers` en el fixture, corregida contra la implementación instalada antes del resultado PASS.

Pendiente: autorizar/aplicar posteriormente en la base compartida y verificar allí sus consumidores. La integración local no significa que se corrigieron los permisos remotos ni que se verificó una llamada externa a Data API. No se alteraron permisos ni datos remotos.

## Fuentes

- [Supabase: seguridad de Data API](https://supabase.com/docs/guides/api/securing-your-api).
- [PostgreSQL: ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html).
- [PostgreSQL: Row Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

La estructura sigue las migraciones de seguridad ya presentes en commerce-automation, catalog-media y vendor-onboarding. Skills Medusa/db-migrate y Supabase/Postgres revisadas; defaults y seguridad contrastados con documentación actual mediante Context7.
