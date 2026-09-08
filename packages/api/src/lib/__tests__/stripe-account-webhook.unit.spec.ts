import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";

const sourcePath = ".medusa/server/src/subscribers/payout-webhook.js";
const installedPath = path.join(path.dirname(require.resolve("@mercurjs/core/package.json")), sourcePath);
const patchPath = path.resolve(__dirname, "../../../../..", "patches/@mercurjs__core@2.3.3.patch");
let directory: string;
let handler: (input: { event: { data: object }; container: { resolve: (key: string) => unknown } }) => Promise<void>;

beforeAll(() => {
  directory = mkdtempSync(path.join(tmpdir(), "stripe-account-subscriber-"));
  const target = path.join(directory, sourcePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(installedPath));
  const apply = (...args: string[]) => execFileSync("git", ["apply", `--include=${sourcePath}`, ...args, patchPath], { cwd: directory, stdio: "pipe" });
  try { apply("--check"); } catch { apply("--reverse"); }
  apply();
  const exports: { default?: typeof handler } = {};
  const nativeRequire = createRequire(installedPath);
  runInNewContext(readFileSync(target, "utf8"), {
    exports, Buffer,
    require: (id: string) => id === "../workflows/payout"
      ? { processPayoutForWebhookWorkflowId: "process-payout-for-webhook" }
      : nativeRequire(id),
  });
  if (!exports.default) throw new Error("Missing native payout webhook subscriber");
  handler = exports.default;
});

afterAll(() => {
  if (directory && path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) && path.basename(directory).startsWith("stripe-account-subscriber-")) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(action: string) {
  const run = jest.fn(async () => undefined);
  const getWebhookActionAndData = jest.fn(async () => ({ action, data: { id: "pacc_verified" } }));
  const container = { resolve: (key: string) => key === "payout" ? { getWebhookActionAndData } : { run } };
  return { run, getWebhookActionAndData, container };
}

it.each(["account.activated", "account.restricted", "account.rejected"])("reconciles %s under the shared fresh-state workflow", async action => {
  const f = fixture(action);
  await handler({ event: { data: { rawData: "signed payload" } }, container: f.container });
  expect(f.getWebhookActionAndData).toHaveBeenCalledTimes(1);
  expect(f.run).toHaveBeenCalledTimes(1);
  expect(f.run).toHaveBeenCalledWith("reconcile-stripe-account", { input: { payout_account_id: "pacc_verified" } });
});

it("retains native processing for payout notifications", async () => {
  const f = fixture("payout.paid");
  await handler({ event: { data: {} }, container: f.container });
  expect(f.run).toHaveBeenCalledWith("process-payout-for-webhook", { input: { action: "payout.paid", data: { id: "pacc_verified" } } });
});

it("never reconciles notifications rejected by provider signature validation", async () => {
  const f = fixture("account.activated");
  f.getWebhookActionAndData.mockRejectedValueOnce(new Error("Invalid signature"));
  await expect(handler({ event: { data: {} }, container: f.container })).rejects.toThrow("Invalid signature");
  expect(f.run).not.toHaveBeenCalled();
});
