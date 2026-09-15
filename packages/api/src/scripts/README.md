# Operational scripts

Scripts execute inside Medusa's container; startup loads configured modules.
Inspect each script's guards and target environment before execution. Keep
credentials in the ignored root environment.

| Script                                                                  | Purpose / side effects                                                                                |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `configure-storefront-region.ts`                                        | US/USD region and Stripe configuration. Defaults to `dry-run`; `apply` mutates through workflows.     |
| `backfill-vendor-warehouse.ts`                                          | Seller warehouse; defaults to `dry-run`, supports explicit `apply`.                                   |
| `recover-vendor-application.ts`                                         | Inspects the original operation by default. `cancel`/`finalize` mutate and require its recovery gate. |
| `reindex-search.ts`                                                     | Writes Algolia settings/projections and removes obsolete records; package command `search:reindex`.   |
| `inspect-order-finance.ts`                                              | Reads a finance view without provider secrets/customer details; requires an operator.                 |
| `inspect-order-finance-extension-qa.ts`, `verify-order-finance-qa.ts`   | Inspects/checks existing financial QA fixtures; inspect each guard before use.                        |
| `seed-order-finance-qa.ts`, `seed-order-finance-extension-qa.ts`        | Creates/mutates dedicated QA fixtures; not ordinary setup.                                            |
| `reconcile-finance-extension-qa.ts`, `repair-finance-qa-payout-link.ts` | Fixture-specific repairs, not general recovery tools.                                                 |

Use the existing pnpm/Medusa tooling in [package.json](../../package.json) with
the script's declared arguments. Finance currently uses TEST Stripe and USD;
keep automatic jobs disabled. Never copy fixture assumptions to arbitrary orders.

General financial recovery remains F08 in the
[development audit](../../../../docs/develpment/development-completion-audit.md).
QA scripts and historical reports do not certify complete settlement. Record new
verification in [development progress](../../../../docs/develpment/development-progress.md).
