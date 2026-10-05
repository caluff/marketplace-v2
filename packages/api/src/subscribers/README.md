# Event subscribers

| Subscriber                       | Responsibility                                                       |
| -------------------------------- | -------------------------------------------------------------------- |
| `auth-verification-requested.ts` | Auth verification notifications through the shared email adapter.    |
| `auth-password-reset.ts`         | Password-reset notifications through the same adapter.               |
| `algolia-catalog-changed.ts`     | Search projections after catalog, offer, seller and related changes. |
| `order-shipped.ts`               | Shipment notification workflow for native shipment-created events.   |
| `order-completed-settlement.ts`  | Observes completed orders through a workflow and records the immutable 72-hour settlement clock when separately enabled. |
| `vendor-settlement-order-changed.ts` | Invalidates the seller settlement read model after native order changes; reconciliation stays in the background worker. |
| `vendor-finance-reporting-changed.ts` | Registers native order references and invalidates the seller financial-report read model after group creation and native order changes; financial source verification stays in the background worker. |

Installed Mercur/Medusa packages also register subscribers; these files are not
the entire event graph. Inspect native consumers before extending events that
affect money, orders or inventory.

Email uses the [Resend provider](../modules/resend/README.md) and persisted
deduplication adapter. Vendor application emails are drained from the local
outbox by a [job](../jobs/README.md). Algolia also has scheduled reconciliation
for missed events and time-dependent visibility.

Retries must retain stable event/operation identity. Provider acceptance differs
from confirmed delivery or fully reconciled persistence. The
[development audit](../../../../docs/develpment/development-completion-audit.md)
records financial recovery and idempotency limits.

Automatic settlement uses its own flag and retains the first observed clock
across event retries. It never transfers money in the subscriber. The
[settlement job](../jobs/README.md) performs fresh checks and invokes the existing
financial executor after the retention expires. Changed order versions and
ambiguous money operations remain for manual review.
