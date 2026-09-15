# Railway service definitions

[railway.ts](railway.ts) defines five services sourced from the repository's
`develop` branch. It records builds, start commands, watch paths, networking
and variable references. It does not prove that a remote environment matches.

| Service    | Build                      | Start               | Health check    |
| ---------- | -------------------------- | ------------------- | --------------- |
| API        | `pnpm build:api:deploy`    | `pnpm start:api`    | `/health`       |
| Worker     | `pnpm build:worker:deploy` | `pnpm start:worker` | None declared   |
| Storefront | `pnpm build:web`           | `pnpm start:web`    | `/`             |
| Admin      | `pnpm build:admin`         | `pnpm start:admin`  | `/login`        |
| Vendor     | `pnpm build:vendor`        | `pnpm start:vendor` | `/seller/login` |

Only API declares `pnpm db:migrate` before deployment. Worker shares the database
and backend build but has no public domain declared.

PostgreSQL and Redis are external. Backend references include `DATABASE_URL`,
`REDIS_URL`, signing secrets, CORS, Google and Stripe TEST settings. Frontends
reference public configuration only. Credentials belong in the deployment
environment, never in docs or Git.

This file does not declare every optional integration supported by
[medusa-config.ts](../packages/api/medusa-config.ts). Email/Resend, Algolia,
product-media storage, onboarding options and the public theme-cookie domain are
not all mapped here. Review feature configuration alongside this definition
before later deployment work.

`NODE_ENV=production` does not enable live Stripe: the application accepts TEST
keys only, financial operations are scoped to USD, and automatic financial jobs
are disabled by default with additional code gates. Start with the
[development audit](../docs/develpment/development-completion-audit.md).

This docs refresh does not apply remote configuration, run migrations or change
deployment state. Definitive deployment preparation follows functional closure.
