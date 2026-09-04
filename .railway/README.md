# Railway deployment

This repository uses Railway Infrastructure as Code. The five services and
their GitHub sources, build commands, start commands, health checks, watch
paths, and variable references live in `railway.ts`.

Supabase PostgreSQL and Upstash Redis remain external. Their credentials and
the Medusa signing secrets are Railway shared variables and must never be
committed to this repository.

From a Railway-authenticated shell linked to the `grateful-presence` project:

```powershell
railway config plan
railway config apply
```

Only `api` runs the database migration pre-deploy command. The `worker` uses
the same build and database but does not run migrations or receive a public
domain.
