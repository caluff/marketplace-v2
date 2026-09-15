# Marketplace admin

Independent Next.js operator application connected to the Mercur/Medusa Admin API.
This is no longer a demonstration shell. Authentication, protected reads and the
listed mutations use the application SDK and backend authorization.

## Connected surfaces

| Route                              | Current behavior                                                                                                                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login` and authentication routes | Login, MFA, recovery, email verification and Google authentication/linking when configured.                                                                                        |
| `/dashboard`                       | Real counts of applications awaiting review, proposed products, stores and orders. These are operational counts, not paid-sales or revenue metrics.                                |
| `/dashboard/vendor-applications`   | Application review, details, approval, rejection and requests for corrections; category-proposal handling.                                                                         |
| `/dashboard/product-review`        | Review of proposed products and pending content/image changes.                                                                                                                     |
| `/dashboard/stores`                | Store list and detail, including operational status. Store suspension/reactivation controls are not yet connected in this panel.                                                   |
| `/dashboard/orders`                | Orders and details, supported order operations and financial controls for capture, cancellation and refunds in Stripe TEST. Availability comes from backend state and permissions. |
| `/dashboard/commissions`           | Read and edit the global commission rule, subject to operator permissions. This is configuration, not financial reporting.                                                         |

The application does not yet provide reconciled GMV, marketplace revenue, vendor
earnings or payout reporting. A successful payment or an editable commission rate
does not certify financial completion. The audit records **Financial Readiness:
FAIL** and the open F01–F12 implementation work.

## Development

After the workspace installation and backend configuration described in the
[root README](../../README.md):

```bash
pnpm --filter @marketplace-v2/admin dev
```

Open `http://localhost:7000/login` or `http://localhost:7000/dashboard`.
`NEXT_PUBLIC_MEDUSA_BACKEND_URL` configures the public backend origin; it is not a
place for backend credentials. Sessions remain isolated from the other apps.

```bash
pnpm lint:admin
pnpm typecheck:admin
pnpm test:admin
pnpm build:admin
```

These are verification commands, not a claim that checks ran on the current tree.
The App Router composes domain features under `src/features`; editable generic
primitives live under `src/components/ui`.

## Documentation

- [Development audit](../../docs/develpment/development-completion-audit.md)
- [Implementation phases](../../docs/develpment/development-implementation-plan.md)
- [Session handoff/progress](../../docs/develpment/development-progress.md)
- [Vendor operations](../../docs/vendor-operations.md)
- [Form feedback](../../docs/admin-vendor-form-notifications.md)
- [Historical shell implementation report](IMPLEMENTATION_REPORT.md)
