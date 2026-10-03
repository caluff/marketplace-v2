# Scheduled jobs

| Job                                   | Schedule         | Gate and behavior                                                                                                |
| ------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `reconcile-search.ts`                 | Every 15 minutes | Returns if Algolia is not registered; otherwise synchronizes products.                                           |
| `vendor-application-notifications.ts` | Every minute     | Requires enabled email; drains up to 20 successful deliveries, stopping at an empty claim or failure.            |
| `evaluate-commerce.ts`                | Every 15 minutes | Requires `STRIPE_AUTOMATIC_JOBS_ENABLED=true` and valid TEST Connect configuration before invoking its workflow. |
| `automatically-settle-orders.ts`      | Every minute     | Requires `STRIPE_AUTOMATIC_SETTLEMENT_ENABLED=true`, valid TEST Connect and general commerce jobs disabled; settles verified orders after 72 elapsed hours. |

General commerce evaluation remains disabled by default. Enabling its environment flag
does not complete capture, payout or recovery:
[configuration.ts](../lib/commerce-automation/configuration.ts) has additional
code gates and [runner.ts](../lib/commerce-automation/runner.ts) retains pending
integration boundaries. Keep `STRIPE_AUTOMATIC_JOBS_ENABLED=false` while following the
[development plan](../../../../docs/develpment/development-implementation-plan.md).

Automatic settlement has a separate opt-in. Apply the `order_completion`
migration before enabling `STRIPE_AUTOMATIC_SETTLEMENT_ENABLED=true` on both API
and worker, then restart them. A running worker/shared process checks up to 25
due orders per minute, continuing after blocked orders and wrapping its durable
cursor. A backlog can delay execution beyond the deadline; it never advances it.

The `order.completed` subscriber records a server-owned, immutable completion
clock after checking the current native order, only while this opt-in is active
and the order has an original financial snapshot. The deadline is 72 hours from
this server observation; event delivery delays can extend the wait, never shorten
it. Replayed events preserve the clock, including a lost persistence response.
Existing completed orders without a clock are not backfilled from `updated_at`
and remain available for manual review.

The observed order's `updated_at` is stored only as a version check, never as the
start of the retention. If it differs at settlement, automatic execution stops
for manual review. This also covers an event published before an exceptional
native workflow rollback and later completion. Any later update to the order,
including repeating completion, conservatively requires manual review.

Settlement reuses the manual financial executor, execution lock, unique payout
operation and stable Stripe idempotency key. It verifies completed status,
preparation/shipping, an active seller and Connect account, full capture,
attributable refunds, pending changes, disputes and reconciliation holds before
moving money. An uncertain operation stays held for operator reconciliation.
Successful manual payouts are never duplicated by the scheduler. Its scan
excludes orders with any payout operation, including processing/uncertain ones.
Pre-existing execution writers or group holds also prevent automatic takeover.

This transfers the net entitlement to the seller's Stripe TEST Connect balance.
The connected account's bank payout schedule is separate. LIVE activation and
migrations against shared databases require explicit authorization.

Jobs invoke workflows instead of owning business mutations. Ambiguous financial
outcomes retain durable claims for reconciliation. Notification and search
READMEs describe their separate retry/consistency behavior.

API and worker share persistence. [Package scripts](../../package.json) set their
runtime modes; a job file does not prove that a remote worker is running.
