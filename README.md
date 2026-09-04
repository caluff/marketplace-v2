# marketplace-v2

`marketplace-v2` is a pnpm workspace with a Mercur/Medusa backend and three
independently deployed Next.js applications.

## Architecture

| Area | Location | Runtime | Local URL |
| --- | --- | --- | --- |
| Storefront | `apps/web` | Next.js 16.3.4, React 19 | `http://localhost:3000` |
| Operator UI | `apps/admin` | Next.js 16.3.4, React 19 | `http://localhost:7000/dashboard` |
| Vendor UI | `apps/vendor` | Next.js 16.3.4, React 19 | `http://localhost:7001/seller` |
| API | `packages/api` | Mercur 2.3.3 on Medusa 2.18.0 | `http://localhost:9000` |
| Worker | `packages/api` | Medusa worker mode | No browser route |

The storefront reads real categories, regions, and products through the
Medusa JS SDK and renders loading, empty, configuration, and Store API error
states. The operator and vendor applications are independent Next.js
recreations of the corresponding Mercur surfaces; their records are clearly
marked demo data and their controls do not call the backend. The Mercur Vite
dashboard modules remain registered but disabled so the API does not try to
mount the Next.js applications as Vite projects.

All three frontends keep editable shadcn/ui-style primitives in source and use
Lucide icons. Mercur's dependency graph stays on the root Vite `5.4.21`
override required by this Medusa/Mercur combination.

## Requirements

- Node.js 20.9 or newer; Node.js 24.18.0 is the verified development version.
- pnpm 12.0.0 through the root `packageManager` declaration.
- An existing Supabase PostgreSQL database.
- An existing Upstash Redis database with TLS.

Use pnpm only. The repository intentionally keeps one dependency lockfile:
`pnpm-lock.yaml` at the workspace root.

## Environment

Backend configuration belongs in the ignored root `.env`. The Medusa config
loads that file from the repository root regardless of the current working
directory. It expects exactly these backend names: `DATABASE_URL`, `REDIS_URL`,
`JWT_SECRET`, `COOKIE_SECRET`, `STORE_CORS`, `ADMIN_CORS`, `VENDOR_CORS`, and
`AUTH_CORS`. Do not put their values in application source or add backend
credentials to a frontend env file.

The storefront's only browser-visible settings belong in the ignored
`apps/web/.env.local`, which Next.js loads automatically:

- `NEXT_PUBLIC_MEDUSA_BACKEND_URL`
- `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`

Do not duplicate those two names in the root `.env`. A Medusa publishable key
is safe to send to the browser and must be scoped to the intended sales
channel, but it is not a database, Redis, admin, or signing secret. Create it
under Medusa Admin **Settings → Publishable API Keys** and use the complete
generated key. Validate it without printing it by requesting `/store/products`
through `sdk.store.product.list()` and confirming a successful response rather
than the "publishable key needs to have a sales channel" error. No other env
file or variable is required by the local baseline.

## Install and develop

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

`pnpm dev` starts the API, storefront, operator UI, and vendor UI together.
Run one area with `pnpm dev:api`, `pnpm dev:web`, `pnpm dev:admin`, or
`pnpm dev:vendor`.

Useful routes:

- storefront catalog: `/`
- operator dashboard and visual login: `/dashboard`, `/login`
- vendor workspace and visual login: `/seller`, `/seller/login`
- backend health check: `/health`
- Medusa Store API: `/store/*`

Seller registration remains disabled. Seller onboarding, real operator/vendor
authentication and actions, cart, checkout, Stripe, payments, and payouts are
not implemented.

## Quality checks

```bash
pnpm peers check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The root commands cover all four code areas. Targeted variants include
`lint:*`, `typecheck:*`, `test:*`, and `build:*`; `pnpm test:smoke` runs the
admin shell smoke suite and the Medusa HTTP health integration test.

Production starts are independent: `pnpm start:web`, `pnpm start:admin`,
`pnpm start:vendor`, `pnpm start:api`, and `pnpm start:worker`. Build the
Medusa deployment artifact first with `pnpm build:api:deploy` or
`pnpm build:worker:deploy`; the normal `pnpm build` compiles each unique
application once without rebuilding the shared backend for the worker.

The baseline has no Vercel configuration or Vercel deployment requirement.
The supported deployment files in this repository target Railway only.

## Railway

Railway is configured as five services with the shared workspace root,
service-specific build/start commands and watch paths, dynamic ports, and no
public domain for the worker. Supabase and Upstash stay external. See
[`railway/README.md`](railway/README.md) for the service matrix, variable
names, database TLS note, and recommended subdomain or explicit-gateway
routing strategies.
