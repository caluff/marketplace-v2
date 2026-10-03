# Railway service definitions

[railway.ts](railway.ts) defines five application services and one Redis
database sourced from the repository's `develop` branch. It records builds,
start commands, watch paths, networking and variable references. It does not
prove that a remote environment matches.

| Service    | Build                      | Start               | Health check    |
| ---------- | -------------------------- | ------------------- | --------------- |
| API        | `pnpm build:api:deploy`    | `pnpm start:api`    | `/health`       |
| Worker     | `pnpm build:worker:deploy` | `pnpm start:worker` | None declared   |
| Storefront | `pnpm build:web`           | `pnpm start:web`    | `/`             |
| Admin      | `pnpm build:admin`         | `pnpm start:admin`  | `/login`        |
| Vendor     | `pnpm build:vendor`        | `pnpm start:vendor` | `/seller/login` |

Only API declares `pnpm db:migrate` before deployment. Worker shares the database
and backend build but has no public domain declared.

PostgreSQL remains external. Redis is provisioned in Railway and API/worker use
the database helper's private `REDIS_URL`. Backend references also include
`DATABASE_URL`, signing secrets, CORS, Google and Stripe TEST settings.
Frontends reference public configuration only. Credentials belong in the
deployment environment, never in docs or Git.

This file does not declare every optional integration supported by
[medusa-config.ts](../packages/api/medusa-config.ts). Email/Resend, Algolia,
product-media storage, onboarding options and the public theme-cookie domain are
not all mapped here. Review feature configuration alongside this definition
before later deployment work.

`NODE_ENV=production` does not enable live Stripe: the application accepts TEST
keys only and financial operations are scoped to USD. General commerce jobs stay
disabled (`STRIPE_AUTOMATIC_JOBS_ENABLED=false`). The separate 72-hour settlement
job requires `STRIPE_AUTOMATIC_SETTLEMENT_ENABLED=true`, the financial migrations
and a running worker. It is active in the local TEST environment; that does not
prove activation in Railway or a new-order transfer after 72 real hours.

F01–F12 / Phase 1–6 are complete for TEST/USD/manual operations. The new automatic
path still needs its full elapsed-time verification. LIVE compatibility cannot be
enabled by replacing keys alone, and transfer to a Connect balance does not prove
arrival at the seller's bank. Consult [current development progress](../docs/develpment/development-progress.md)
and the [job contract](../packages/api/src/jobs/README.md).

This docs refresh does not apply remote configuration, run migrations or change
deployment state. Before production, validate the five deployed services,
migrations, HTTPS/authentication, optional integrations, monitoring, financial
recovery and backup restoration against the selected destination.
