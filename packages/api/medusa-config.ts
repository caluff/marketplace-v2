import { existsSync } from "node:fs";
import path from "path";
import { loadEnv, MedusaError } from "@medusajs/framework/utils";
import { withMercur } from "@mercurjs/core";

const findWorkspaceRoot = (start: string): string | undefined => {
  let current = path.resolve(start);

  while (true) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
};

const repositoryRoot =
  findWorkspaceRoot(process.cwd()) ?? findWorkspaceRoot(__dirname) ?? process.cwd();

// Medusa's loader accepts a directory and chooses the environment-specific file.
// Walking to the workspace root works from source and from .medusa/server builds.
loadEnv(process.env.NODE_ENV || "development", repositoryRoot);

const requireUrl = (
  name: "DATABASE_URL" | "REDIS_URL",
  protocols: readonly string[],
): string => {
  const value = process.env[name];

  if (!value) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `[configuration] ${name} is required`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `[configuration] ${name} must be a valid URL`,
    );
  }

  if (!protocols.includes(parsed.protocol) || !parsed.hostname) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `[configuration] ${name} must use ${protocols.join(" or ")} and include a host`,
    );
  }

  if (!parsed.username || !parsed.password) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `[configuration] ${name} must include credentials`,
    );
  }

  if (name === "DATABASE_URL" && parsed.pathname === "/") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `[configuration] ${name} must include a database name`,
    );
  }

  return value;
};

const requireSecret = (name: "JWT_SECRET" | "COOKIE_SECRET"): string => {
  const value = process.env[name];
  const normalized = value?.trim().toLowerCase() ?? "";
  const insecurePlaceholders = new Set([
    "secret",
    "supersecret",
    "change-me",
    "changeme",
  ]);

  if (!value?.trim()) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `[configuration] ${name} is required`,
    );
  }

  if (value.trim().length < 32 || insecurePlaceholders.has(normalized)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `[configuration] ${name} must be a non-placeholder value of at least 32 characters`,
    );
  }

  return value;
};

const databaseUrl = requireUrl("DATABASE_URL", ["postgres:", "postgresql:"]);
const redisUrl = requireUrl("REDIS_URL", ["rediss:"]);
const jwtSecret = requireSecret("JWT_SECRET");
const cookieSecret = requireSecret("COOKIE_SECRET");
const requestedWorkerMode = process.env.MEDUSA_WORKER_MODE || "shared";

if (
  !(["server", "worker", "shared"] as const).includes(
    requestedWorkerMode as "server" | "worker" | "shared",
  )
) {
  throw new MedusaError(
    MedusaError.Types.INVALID_DATA,
    "[configuration] MEDUSA_WORKER_MODE must be server, worker, or shared",
  );
}

const workerMode = requestedWorkerMode as "server" | "worker" | "shared";

if (jwtSecret === cookieSecret) {
  throw new MedusaError(
    MedusaError.Types.INVALID_DATA,
    "[configuration] JWT_SECRET and COOKIE_SECRET must be different values",
  );
}

module.exports = withMercur({
  projectConfig: {
    databaseUrl,
    // Supabase's current certificate chain requires its downloaded CA for
    // strict verification. This still forces encrypted transport; see the
    // Railway guide for the manual verify-full hardening step.
    databaseDriverOptions: {
      connection: {
        ssl: { rejectUnauthorized: false },
      },
    },
    redisUrl,
    workerMode,
    http: {
      storeCors: process.env.STORE_CORS || "http://localhost:3000",
      adminCors: process.env.ADMIN_CORS || "http://localhost:7000",
      vendorCors: process.env.VENDOR_CORS || "http://localhost:7001",
      authCors:
        process.env.AUTH_CORS ||
        "http://localhost:3000,http://localhost:7000,http://localhost:7001",
      jwtSecret,
      cookieSecret,
    },
  },
  admin: {
    disable: true,
  },
  featureFlags: {
    rbac: true,
    seller_registration: false,
  },
  modules: [
    {
      resolve: "@medusajs/medusa/caching",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/caching-redis",
            id: "caching-redis",
            is_default: true,
            options: { redisUrl },
          },
        ],
      },
    },
    {
      resolve: "@medusajs/medusa/event-bus-redis",
      options: { redisUrl },
    },
    {
      resolve: "@medusajs/medusa/workflow-engine-redis",
      options: {
        redis: { redisUrl },
      },
    },
    {
      resolve: "@medusajs/medusa/locking",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/locking-redis",
            id: "locking-redis",
            is_default: true,
            options: { redisUrl },
          },
        ],
      },
    },
    {
      resolve: "@mercurjs/core/modules/admin-ui",
      options: {
        // apps/admin is an independent Next.js service, not a Mercur Vite app.
        disable: true,
      },
    },
    {
      resolve: "@mercurjs/core/modules/vendor-ui",
      options: {
        // apps/vendor is an independent Next.js service, not a Mercur Vite app.
        disable: true,
      },
    },
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/file-local",
            id: "local",
            options: {
              backend_url:
                process.env.FILE_BACKEND_URL || "http://localhost:9000/static",
            },
          },
        ],
      },
    },
  ],
});
