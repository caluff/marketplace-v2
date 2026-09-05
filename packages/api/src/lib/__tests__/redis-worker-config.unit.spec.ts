jest.mock("@mercurjs/core", () => ({ withMercur: (config: unknown) => config }));
jest.mock("@medusajs/framework/utils", () => ({
  ...jest.requireActual("@medusajs/framework/utils"),
  loadEnv: jest.fn(),
}));

type Config = {
  projectConfig: { workerMode: string };
  modules: { resolve: string; options?: { workerOptions?: unknown; redis?: { workerOptions?: unknown }; jobOptions?: unknown } }[];
};

describe("Redis worker configuration", () => {
  const previousEnvironment = process.env;
  afterEach(() => { process.env = previousEnvironment; });

  it.each(["shared", "server", "worker"])("reduces empty polling without disabling reliability in %s mode", (mode) => {
    process.env = {
      ...previousEnvironment,
      DATABASE_URL: "postgres://test:test@localhost/offline_config",
      REDIS_URL: "rediss://test:test@localhost:6379",
      JWT_SECRET: "offline-jwt-config-test-0123456789012345",
      COOKIE_SECRET: "offline-cookie-config-test-012345678901",
      AUTH_EMAIL_ENABLED: "false",
      MEDUSA_WORKER_MODE: mode,
    };
    jest.isolateModules(() => {
      const config = jest.requireActual<Config>("../../../medusa-config");
      expect(config.projectConfig.workerMode).toBe(mode);
      const events = config.modules.find(entry => entry.resolve === "@medusajs/medusa/event-bus-redis");
      const workflows = config.modules.find(entry => entry.resolve === "@medusajs/medusa/workflow-engine-redis");
      // Exact options ensure lock renewal and stalled-job recovery stay enabled.
      expect(events?.options?.workerOptions).toEqual({ drainDelay: 60 });
      expect(workflows?.options?.redis?.workerOptions).toEqual({ drainDelay: 60 });
      expect(events?.options?.jobOptions).toEqual({ attempts: 5, backoff: { type: "exponential", delay: 5000 } });
    });
  });
});
