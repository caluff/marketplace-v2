# HTTP integration tests

Suites use installed `@medusajs/test-utils` 2.18.0 and real Medusa wiring.
The API retains integration tests only. `pnpm test` and `pnpm test:api`
run module integration followed by HTTP integration; both require isolated test
infrastructure and the explicit opt-ins documented in each selected suite.

| Suite                        | Coverage / opt-in                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `health.spec.ts`             | Health endpoint; protected by the global isolated-environment preflight.                                                                                     |
| `catalog-permission.spec.ts` | Per-store moderation authority, native publication, revocation, image ownership and shared catalog concurrency; `CATALOG_PERMISSION_TESTS=disposable-local`. |
| `google-auth.spec.ts`        | Google completion/account association with local fixtures; `GOOGLE_AUTH_TESTS=disposable-local`. No Google network calls.                                    |
| `vendor-onboarding.spec.ts`  | Lifecycle, authorization and native onboarding; `VENDOR_ONBOARDING_TESTS=disposable-local`.                                                                  |

Read the selected file header first. Before any suite loads, the global setup
requires `NODE_ENV=test`, PostgreSQL at `DB_HOST=localhost`, `DB_PORT=55432`,
`DB_USERNAME=closure_test`, an explicit `DB_PASSWORD`, and a `DATABASE_URL`
matching those credentials and that local destination. TLS requires
`PGSSLMODE=require`, an existing `NODE_EXTRA_CA_CERTS` file, and no disabled
certificate verification. Redis must use `rediss://closure:<password>@localhost:56379/15`
without URL query or fragment overrides. `DB_TEMP_NAME`/`MEDUSA_DB_SCHEMA` are
rejected; an optional `DB_WAITINGROOM_DATABASE` must be `postgres`.

External provider credentials must be explicitly blank; setup preserves that
opt-out against root dotenv loading and disables outbound email and financial
jobs. Suites require test-only signing secrets and their own documented opt-ins.
Ordinary development configuration is rejected before metadata initialization
or application startup. This also applies to the health suite and module tests.

**The runner creates and drops disposable databases.** Do not use shared
Supabase/PostgreSQL or a normal development database. Set isolated configuration
before starting the process; no real actor credentials are needed.

After configuring that environment, select the intended suite:

```sh
pnpm --filter @marketplace-v2/api test:integration:http --runTestsByPath integration-tests/http/google-auth.spec.ts
pnpm --filter @marketplace-v2/api test:integration:http --runTestsByPath integration-tests/http/vendor-onboarding.spec.ts
```

A skipped suite is not successful verification. Existing suites do not cover
the full checkout/commission/transfer/refund circuit. F12 in the
[audit](../../../../docs/develpment/development-completion-audit.md) and Phase 6
of the [plan](../../../../docs/develpment/development-implementation-plan.md)
define that work. Historical results apply to their recorded date only; record
new commands/results in [progress](../../../../docs/develpment/development-progress.md).
