# Marketplace admin

Independent Next.js admin shell for marketplace operators. It currently renders
only static, explicitly labelled demonstration fixtures; authentication, API
calls, mutations, seller registration, checkout, payouts, and other operational
actions are intentionally not connected.

After the workspace dependency installation has completed:

```bash
pnpm --filter @marketplace-v2/admin dev
```

Open `http://localhost:7000/dashboard` for the dashboard or
`http://localhost:7000/login` for the non-functional login shell.

The UI follows Mercur/Medusa information hierarchy as a visual reference while
remaining a standalone App Router application. shadcn/ui primitives live in
`src/components/ui`, so they can be edited locally.
