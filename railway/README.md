# Railway deployment

Deploy this repository as five Railway services: `web`, `admin`, `vendor`,
`api`, and `worker`. Supabase PostgreSQL and Upstash Redis remain external;
do not provision replacement databases in Railway.

## Service settings

All services must use `/` as their **Root Directory**. This is a shared pnpm
workspace: Railway only pulls the selected root directory, so choosing an app
subdirectory would exclude the root `pnpm-lock.yaml` and workspace manifests.

Set each service's Railway Config File to the listed absolute path. The config
files provide the build command, start command, health check where applicable,
and root-relative watch paths.

| Service | Root Directory | Config File | Build | Start | Public domain |
| --- | --- | --- | --- | --- | --- |
| web | `/` | `/railway/web.json` | `pnpm build:web` | `pnpm start:web` | Yes |
| admin | `/` | `/railway/admin.json` | `pnpm build:admin` | `pnpm start:admin` | Yes |
| vendor | `/` | `/railway/vendor.json` | `pnpm build:vendor` | `pnpm start:vendor` | Yes |
| api | `/` | `/railway/api.json` | `pnpm build:api:deploy` | `pnpm start:api` | Yes |
| worker | `/` | `/railway/worker.json` | `pnpm build:worker:deploy` | `pnpm start:worker` | No |

Railpack installs the root workspace first. The API deployment build then runs
the additional production-only pnpm install required by Medusa inside its
generated `.medusa/server` artifact, without generating a second lockfile.
Only the API service runs `pnpm db:migrate` as a Railway pre-deploy command;
the worker shares the resulting schema and must not race a second migration.

Railway provides `PORT` at runtime. The three Next.js servers and both Medusa
modes bind to `0.0.0.0` and consume that dynamic port. Do not assign a public
domain or TCP proxy to the worker.

## Variables

Add values in Railway, never in these committed files. The names needed by
each service are:

- `web`: `NEXT_PUBLIC_MEDUSA_BACKEND_URL`,
  `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`.
- `api`: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `COOKIE_SECRET`,
  `STORE_CORS`, `ADMIN_CORS`, `VENDOR_CORS`, `AUTH_CORS`.
- `worker`: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `COOKIE_SECRET`,
  `STORE_CORS`, `ADMIN_CORS`, `VENDOR_CORS`, `AUTH_CORS`.
- `admin` and `vendor`: no application variables while they remain demo-only
  shells.

The two public storefront variables must also be present during the `web`
build because Next.js inlines them. Use Railway variables or reference
variables for the existing Supabase and Upstash credentials; never copy their
values into source control.

The backend forces encrypted PostgreSQL transport. The current external
database accepts encrypted connections but its certificate chain was not
trusted by the local Node.js client, so certificate verification remains off
to preserve connectivity. For full `verify-full` protection, first enable SSL
enforcement in Supabase, download the project's server root certificate from
Database Settings, make that CA available to both Railway backend services,
then configure Medusa's PostgreSQL driver with that CA and
`rejectUnauthorized: true`; validate both API and worker before removing the
compatibility setting.

## Domains and routing

The recommended topology is one subdomain per public service, for example
`shop`, `admin`, `vendor`, and `api` under the owned domain. Configure the four
origins in the backend CORS variables and point the storefront backend URL at
the API origin.

A single-domain alternative can expose the storefront at `/`, admin at
`/dashboard`, vendor at `/seller`, and the backend through an explicit API
prefix. That design requires a separate gateway or reverse proxy with path
rewrites and forwarded-host handling. Railway does not automatically combine
independent services into path-based routes.
