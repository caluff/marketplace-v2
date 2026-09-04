# marketplace-v2

## Objective

- Produce maintainable, performant, and type-safe code that follows the patterns already established in this repository.
- Prefer the smallest safe change that fully solves the requested problem.
- Preserve product boundaries and avoid introducing marketplace capabilities that were not requested.
- Prefer consistency with nearby code and version-matched documentation over generic examples.

## Project stack

- pnpm workspace with a single root lockfile.
- Next.js 16 App Router, React 19, TypeScript, and Tailwind CSS 4.
- Editable shadcn/ui-style primitives, Radix UI, and Lucide icons.
- Mercur 2.3.3 on Medusa 2.18.0.
- PostgreSQL for persistence and Redis for cache, events, workflows, and locking.
- Railway Infrastructure as Code under `.railway/`.

Use pnpm only. Prefer dependencies that are already installed. Do not add a
production dependency when the platform or an existing package already covers
the requirement.

## Documentation first

Use Context7 MCP whenever the task asks about a library, framework, SDK, API,
CLI, or cloud service, including setup, configuration, migration, API syntax,
library-specific debugging, or version-sensitive behavior.

1. Call `resolve-library-id` with the library name and the user's question,
   unless an exact `/org/project` Context7 ID was provided.
2. Select the closest official source, preferring strong documentation coverage,
   source reputation, and the requested version.
3. Call `query-docs` with the selected ID and one focused concept per query.
4. Base the implementation or answer on the fetched documentation.

Do not use Context7 for business-logic debugging, general programming concepts,
ordinary refactors, or repository code review.

Before changing Mercur behavior, consult the version-matched documentation in
`node_modules/@mercurjs/docs`. Installed Mercur documentation supplements the
required skills and current framework documentation; it does not replace them.

## Existing codebase first

Before writing code:

1. Inspect the nearest implementation, package manifest, and configuration.
2. Locate existing components, SDK clients, helpers, schemas, tests, and naming
   conventions before creating new ones.
3. Confirm that an imported API, route, type, component, or utility actually
   exists. Never invent project abstractions.
4. Preserve unrelated user changes in a dirty worktree.

If a requested feature has no established local pattern, use the framework's
documented pattern and state any material assumption.

## Repository architecture

This is a monorepo organized by independently deployable application. The
backend remains a modular monolith.

```text
apps/
├── web/       # Public customer storefront
├── admin/     # Independent operator Next.js application
└── vendor/    # Independent seller Next.js application
packages/
└── api/       # Mercur/Medusa API and worker
.railway/      # Railway service definitions
```

Repository boundaries:

- Applications must not import source files directly from another application.
- Frontends must not import backend source or access PostgreSQL/Redis directly.
- Communication with the backend goes through the appropriate typed Medusa or
  Mercur SDK.
- Keep code local to an application by default. Create a shared workspace
  package only after code is genuinely reused by at least two applications and
  has a stable, application-agnostic public API.
- Do not create a broad `shared`, `common`, or `utils` package for speculative
  reuse.

## Frontend organization

The storefront uses `apps/web/app`; the operator and vendor applications use
`apps/admin/src/app` and `apps/vendor/src/app`. Respect the structure of the
application being edited rather than moving files solely for uniformity.

Within each frontend:

- `app/`: routes, layouts, metadata, loading/error boundaries, and route-level
  composition.
- Route-local `_components/`: UI used only by that route or route subtree.
- `features/<domain>/`: substantial reusable business features, including their
  components, hooks, schemas, query keys, and feature-specific helpers.
- `components/ui/`: generic UI primitives without marketplace business logic.
- `components/`: application-wide layout and reusable presentation components.
- `lib/`: SDK clients, environment validation, infrastructure adapters, and
  generic pure helpers.

Frontend rules:

- Keep route files thin. They load/validate route input and compose feature UI.
- Use Server Components by default. Add `"use client"` only for browser APIs,
  event handlers, or client state.
- Keep server state in the backend/SDK cache rather than duplicating it in a
  global client store.
- Use Next.js `Image` for product and editorial images when compatible with the
  source. Configure allowed remote origins explicitly.
- Use dynamic routes for products, categories, sellers, and other data-driven
  entities.
- Do not hardcode products, categories, regions, inventory, shipping options, or
  other backend-owned data in operational storefront code.
- Handle loading, error, empty, and success states explicitly.
- Preserve each application's existing visual language. Do not assume the
  storefront, operator panel, and vendor panel share one design system.

## Backend organization

`packages/api` is a Medusa/Mercur modular monolith. Follow this flow for custom
backend behavior:

```text
Module → Workflow → API route → Typed frontend SDK
```

Use the Medusa conventions below:

- `src/modules/<domain>/`: one domain's models, service, module definition, and
  migrations.
- `src/workflows/`: mutation orchestration and cross-domain business processes.
- `src/workflows/steps/`: focused workflow operations with compensation where
  applicable.
- `src/api/`: thin HTTP adapters, authentication/scoping middleware, and request
  validation.
- `src/links/`: relationships between separate modules.
- `src/subscribers/`: asynchronous reactions to domain events.
- `src/jobs/`: scheduled background work.
- `src/scripts/`: operational CLI scripts.

Backend rules:

- All mutations go through workflows. API routes must not call module mutation
  methods directly.
- Keep business validation, ownership checks, and cross-domain orchestration in
  workflows, not route handlers.
- Modules own their data and must not import or directly call other modules.
  Connect domains with module links.
- Use Medusa Query for reads across modules. Use `query.graph()` for graph
  retrieval and `query.index()` when filtering across linked modules.
- Use Zod from `@medusajs/framework/zod` in Medusa code and derive request types
  from schemas.
- Use authenticated request types for protected routes and rely on configured
  authentication/scoping middleware.
- Keep workflow composition functions synchronous; use workflow primitives such
  as steps, `transform`, and `when` rather than ordinary async control flow.
- Use static imports. Do not dynamically import workflows or modules inside
  request handlers.
- Medusa prices are stored in display units. Do not multiply or divide values by
  100 when saving or rendering prices.

## Backend integration from frontends

- Locate the existing SDK instance before adding an API call.
- Use built-in SDK methods for built-in endpoints.
- Use the SDK's generic client method for custom routes.
- Do not use raw `fetch` for Medusa/Mercur API calls; the SDK supplies required
  publishable-key, authentication, and session headers.
- Pass plain objects to SDK request bodies. Do not pre-serialize them with
  `JSON.stringify` unless the verified API explicitly requires a string.
- Use published or generated Medusa/Mercur types. Do not maintain handwritten
  copies of backend entity types in frontend applications.
- Include the correct region when retrieving priced storefront entities.

## Naming and TypeScript

- Components and types: `PascalCase`.
- Variables, functions, and hooks: `camelCase`; hooks begin with `use`.
- Constants: `UPPER_SNAKE_CASE` when they are true module-level constants.
- Files and directories: `kebab-case`, except for framework-mandated names.
- Prefer descriptive state names such as `isLoading`, `hasError`, and `canEdit`.
- Avoid `any`; use `unknown` and narrow it safely.
- Use `import type` for type-only imports.
- Prefer inference when it is clear; add explicit types at public boundaries.
- Derive TypeScript types from Zod schemas instead of duplicating validation
  shapes.
- Keep functions and components focused. Split large files at domain or behavior
  boundaries rather than extracting arbitrary tiny helpers.

## Product and security boundaries

- Store backend credentials only in the ignored root `.env`.
- Browser-visible storefront configuration belongs in the ignored
  `apps/web/.env.local` and must be limited to public values.
- Never commit database, Redis, signing, admin, or provider secrets.
- Keep seller registration disabled unless marketplace onboarding is explicitly
  requested.
- Do not add Stripe, checkout, seller onboarding, payments, or payouts without
  an explicit request.
- `apps/admin` and `apps/vendor` are currently demonstration shells. Do not
  present their authentication, records, or controls as operational until they
  are connected to Mercur deliberately.
- Validate external input and enforce authorization on the backend. UI hiding is
  not an authorization mechanism.

## Required skills

Before planning, researching, implementing, reviewing, or debugging these areas,
load every applicable installed skill:

- Medusa backend modules, workflows, API routes, subscribers, jobs, links, or
  data models: `building-with-medusa`.
- Medusa Admin extensions: `building-admin-dashboard-customizations`.
- Storefront work or Store API consumption in `apps/web`:
  `building-storefronts` and `storefront-best-practices`.
- Database migration generation: `db-generate` plus `building-with-medusa`.
- Running Medusa migrations: `db-migrate` plus `building-with-medusa`.
- Creating a Medusa admin user: `new-user`.
- Intentional creation or redesign of frontend interfaces: `frontend-design`.
- Supabase-specific work: `supabase`.
- Upstash-specific work: `upstash:upstash` and the relevant product sub-skill.

When a task spans multiple areas, use all applicable skills. The user's explicit
requirements take precedence over optional skill guidance.

## Code modifications

- Make the smallest coherent change that satisfies the request.
- Preserve architecture, formatting, import style, and naming in nearby files.
- Do not rewrite entire files or migrate an unrelated legacy area unless the
  user explicitly requests it.
- Avoid touching unrelated code, generated output, build artifacts, or lockfile
  entries.
- Update the root lockfile only through pnpm when dependencies actually change.
- Add comments only where intent, constraints, or non-obvious business behavior
  would otherwise be unclear.

## Validation before completion

Run checks proportional to the affected area. Do not claim a check passed unless
it was executed successfully.

Useful commands:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm peers check
```

Targeted variants are available as `lint:*`, `typecheck:*`, `test:*`, and
`build:*` for `web`, `admin`, `vendor`, and `api`.

- After changing one application, run its targeted lint and typecheck plus the
  closest meaningful tests.
- After changing Medusa modules, workflows, links, configuration, or API routes,
  run the API lint, typecheck, tests, and build.
- After changing shared configuration, dependencies, or multiple applications,
  run the corresponding root checks and `pnpm peers check` when dependencies
  changed.
- Documentation-only changes do not require application builds.
- If a required check cannot run because of missing infrastructure or
  credentials, report exactly what was not verified.

## Review checklist

Before finishing, verify that:

- The change follows the repository and domain boundaries above.
- Inputs, authorization, errors, and empty/loading states are handled where
  relevant.
- Types come from schemas or official/generated contracts rather than duplicate
  definitions.
- No secret, generated artifact, unrelated edit, or unnecessary dependency was
  introduced.
- Tests exercise meaningful behavior instead of merely mirroring the
  implementation.
