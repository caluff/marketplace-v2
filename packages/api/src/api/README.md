# API extensions

Local routes extend installed Mercur 2.3.3 / Medusa 2.18.0 APIs. This directory is
not the complete route inventory: native routes and middleware also load from
those packages.

| Area                           | Responsibilities                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `auth/`                        | Google completion and issuing/consuming vendor sessions.                                                                |
| `store/`                       | Favorites, account guards, product search, sale-readiness guards and vendor applications.                               |
| `vendor/`                      | Onboarding, warehouse, shipping, catalog images/options, prices, stock, sale status, Connect refresh and order finance. |
| `admin/`                       | Vendor application reviews and order finance.                                                                           |
| `middlewares.ts`               | Cross-cutting authentication, scoping and native/local composition.                                                     |
| `order-finance-middlewares.ts` | Financial writer protection and cart-completion handling.                                                               |

Start with each route's middleware/validator and workflow. Mutations belong in
workflows; routes are HTTP adapters. Frontends use their existing SDK and the
generated contracts exported by [the API package](../../package.json).

Before changing native behavior, inspect its installed route, workflow and hooks.
Medusa permits only one handler per workflow hook; preserve native checks and
compensation when composing local behavior.

Finance currently operates within TEST/USD restrictions. Existing guards do not
certify complete integrity: see F04 (order edits) and the other open findings in
the [development audit](../../../../docs/develpment/development-completion-audit.md).
