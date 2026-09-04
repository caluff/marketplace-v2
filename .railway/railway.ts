import { defineRailway, github, project, service } from "railway/iac";

const source = () =>
  github("caluff/marketplace-v2", {
    branch: "main",
  });

export default defineRailway((ctx) => {
  const api = service("api", {
    source: source(),
    rootDirectory: "/",
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm build:api:deploy",
      watchPatterns: [
        "/packages/api/**",
        "/.railway/**",
        "/blocks.json",
        "/.npmrc",
        "/package.json",
        "/pnpm-lock.yaml",
        "/pnpm-workspace.yaml",
        "/tsconfig.base.json",
      ],
    },
    deploy: {
      preDeployCommand: ["pnpm db:migrate"],
      startCommand: "pnpm start:api",
      healthcheckPath: "/health",
    },
    env: {
      NODE_ENV: "production",
      DATABASE_URL: ctx.shared.DATABASE_URL,
      REDIS_URL: ctx.shared.REDIS_URL,
      JWT_SECRET: ctx.shared.JWT_SECRET,
      COOKIE_SECRET: ctx.shared.COOKIE_SECRET,
      STORE_CORS: ctx.shared.STORE_CORS,
      ADMIN_CORS: ctx.shared.ADMIN_CORS,
      VENDOR_CORS: ctx.shared.VENDOR_CORS,
      AUTH_CORS: ctx.shared.AUTH_CORS,
    },
  });

  const worker = service("worker", {
    source: source(),
    rootDirectory: "/",
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm build:worker:deploy",
      watchPatterns: [
        "/packages/api/**",
        "/.railway/**",
        "/blocks.json",
        "/.npmrc",
        "/package.json",
        "/pnpm-lock.yaml",
        "/pnpm-workspace.yaml",
        "/tsconfig.base.json",
      ],
    },
    deploy: {
      startCommand: "pnpm start:worker",
    },
    env: {
      NODE_ENV: "production",
      DATABASE_URL: ctx.shared.DATABASE_URL,
      REDIS_URL: ctx.shared.REDIS_URL,
      JWT_SECRET: ctx.shared.JWT_SECRET,
      COOKIE_SECRET: ctx.shared.COOKIE_SECRET,
      STORE_CORS: ctx.shared.STORE_CORS,
      ADMIN_CORS: ctx.shared.ADMIN_CORS,
      VENDOR_CORS: ctx.shared.VENDOR_CORS,
      AUTH_CORS: ctx.shared.AUTH_CORS,
    },
  });

  const web = service("@marketplace-v2/web", {
    source: source(),
    rootDirectory: "/",
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm build:web",
      watchPatterns: [
        "/apps/web/**",
        "/.railway/**",
        "/.npmrc",
        "/package.json",
        "/pnpm-lock.yaml",
        "/pnpm-workspace.yaml",
        "/tsconfig.base.json",
      ],
    },
    deploy: {
      startCommand: "pnpm start:web",
      healthcheckPath: "/",
    },
    networking: {
      privateNetworkEndpoint: "marketplace-v2web",
      serviceDomains: {
        "marketplace-v2web-production.up.railway.app": {},
      },
    },
    env: {
      NODE_ENV: "production",
      NEXT_PUBLIC_MEDUSA_BACKEND_URL:
        "https://api-production-ed23.up.railway.app",
      NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY:
        ctx.shared.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
    },
  });

  const admin = service("@marketplace-v2/admin", {
    source: source(),
    rootDirectory: "/",
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm build:admin",
      watchPatterns: [
        "/apps/admin/**",
        "/.railway/**",
        "/.npmrc",
        "/package.json",
        "/pnpm-lock.yaml",
        "/pnpm-workspace.yaml",
        "/tsconfig.base.json",
      ],
    },
    deploy: {
      startCommand: "pnpm start:admin",
      healthcheckPath: "/login",
    },
    networking: {
      privateNetworkEndpoint: "marketplace-v2admin",
      serviceDomains: {
        "marketplace-v2admin-production.up.railway.app": {},
      },
    },
    env: {
      NODE_ENV: "production",
      NEXT_PUBLIC_MEDUSA_BACKEND_URL:
        "https://api-production-ed23.up.railway.app",
    },
  });

  const vendor = service("@marketplace-v2/vendor", {
    source: source(),
    rootDirectory: "/",
    build: {
      builder: "RAILPACK",
      buildCommand: "pnpm build:vendor",
      watchPatterns: [
        "/apps/vendor/**",
        "/.railway/**",
        "/.npmrc",
        "/package.json",
        "/pnpm-lock.yaml",
        "/pnpm-workspace.yaml",
        "/tsconfig.base.json",
      ],
    },
    deploy: {
      startCommand: "pnpm start:vendor",
      healthcheckPath: "/seller/login",
    },
    networking: {
      privateNetworkEndpoint: "marketplace-v2vendor",
      serviceDomains: {
        "marketplace-v2vendor-production.up.railway.app": {},
      },
    },
    env: {
      NODE_ENV: "production",
      NEXT_PUBLIC_MEDUSA_BACKEND_URL:
        "https://api-production-ed23.up.railway.app",
    },
  });

  return project("grateful-presence", {
    resources: [web, admin, vendor, api, worker],
  });
});
