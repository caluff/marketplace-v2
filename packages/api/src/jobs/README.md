# Scheduled jobs

| Job                                   | Schedule         | Gate and behavior                                                                                                |
| ------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `reconcile-search.ts`                 | Every 15 minutes | Returns if Algolia is not registered; otherwise synchronizes products.                                           |
| `vendor-application-notifications.ts` | Every minute     | Requires enabled email; drains up to 20 successful deliveries, stopping at an empty claim or failure.            |
| `evaluate-commerce.ts`                | Every 15 minutes | Requires `STRIPE_AUTOMATIC_JOBS_ENABLED=true` and valid TEST Connect configuration before invoking its workflow. |

Automatic commerce jobs are disabled by default. Enabling the environment flag
does not complete capture, payout or recovery:
[configuration.ts](../lib/commerce-automation/configuration.ts) has additional
code gates and [runner.ts](../lib/commerce-automation/runner.ts) retains pending
integration boundaries. Keep automation disabled while following the
[development plan](../../../../docs/develpment/development-implementation-plan.md).

Jobs invoke workflows instead of owning business mutations. Ambiguous financial
outcomes retain durable claims for reconciliation. Notification and search
READMEs describe their separate retry/consistency behavior.

API and worker share persistence. [Package scripts](../../package.json) set their
runtime modes; a job file does not prove that a remote worker is running.
