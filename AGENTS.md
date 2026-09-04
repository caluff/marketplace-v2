# marketplace-v2

- Use pnpm only. Keep one lockfile at the repository root.
- The Mercur/Medusa backend lives in `packages/api`; the only custom UI lives in `apps/web`.
- Store credentials in the ignored root `.env`. Never add database, Redis, or signing secrets to source control.
- Keep seller registration disabled unless marketplace workflows are deliberately introduced.
- Do not add Stripe, checkout, seller, or payout functionality without an explicit request.
- Before changing Mercur behavior, consult its version-matched documentation in `node_modules/@mercurjs/docs` after dependencies are installed.

## Required Medusa skills

Before planning, researching, implementing, reviewing, or debugging work in the
areas below, load and follow every applicable installed skill:

- Medusa backend features (modules, workflows, API routes, subscribers, jobs,
  links, or data models): `building-with-medusa`.
- Medusa Admin dashboard pages, widgets, forms, tables, or UI extensions:
  `building-admin-dashboard-customizations`.
- Storefront features or custom API consumption from `apps/web`:
  `building-storefronts` and `storefront-best-practices`.
- Generating a module migration: `db-generate` in addition to
  `building-with-medusa`.
- Running database migrations: `db-migrate` in addition to
  `building-with-medusa`.
- Creating an admin user: `new-user`.

When a task spans multiple areas, use all applicable skills. Skills supplement
the version-matched Mercur documentation; they do not replace it.
