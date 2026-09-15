# HTTP integration tests

Suites use installed `@medusajs/test-utils` 2.18.0 and real Medusa wiring.
They are separate from the API unit-test command.

| Suite                       | Coverage / opt-in                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `health.spec.ts`            | Health endpoint; no dedicated local-environment guard. Run only with deliberately isolated test configuration.            |
| `google-auth.spec.ts`       | Google completion/account association with local fixtures; `GOOGLE_AUTH_TESTS=disposable-local`. No Google network calls. |
| `vendor-onboarding.spec.ts` | Lifecycle, authorization and native onboarding; `VENDOR_ONBOARDING_TESTS=disposable-local`.                               |

Read the selected file header first. Opt-in suites require `NODE_ENV=test`,
localhost PostgreSQL (`DB_HOST`, `DB_USERNAME`, `DB_PASSWORD`, `DB_PORT`),
dedicated localhost TLS Redis with credentials and a nonzero database, and
test-only signing secrets. They reject `DB_TEMP_NAME`/`MEDUSA_DB_SCHEMA`
overrides and disable outbound email.

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
