import type { CreateNotificationDTO, MedusaContainer, NotificationDTO } from "@medusajs/framework/types";
import notificationModule from "@medusajs/medusa/notification";
import { authNotificationKey, deliverEmailNotification } from "../deliver-email-notification";

const input = { to: "person@example.com", channel: "email", template: "auth-password-reset", idempotency_key: "event-one", data: { reset_url: "https://example.com/reset?token=one" } };

// Exercise the installed Medusa 2.18 implementation with in-memory persistence;
// no database, Redis connection, or external email request is made.
class TestNotificationModuleService extends notificationModule.service {
  static implementation() { return this.prototype.createNotifications_; }
}
type PersistedNotification = Partial<NotificationDTO & Pick<CreateNotificationDTO, "idempotency_key">>;

function fixture(initial: PersistedNotification[] = []) {
  const rows = new Map(initial.map((row) => [row.id!, { ...row }]));
  const send = jest.fn().mockResolvedValue({ id: "resend-one" });
  const list = jest.fn(async ({ idempotency_key }: { idempotency_key: string | string[] }) => [...rows.values()].filter((row) => [idempotency_key].flat().includes(row.idempotency_key!)).map((row) => ({ ...row })));
  const internal = {
    notificationService_: {
      list,
      create: jest.fn(async (entries: PersistedNotification[]) => entries.map((entry) => {
        const row = { ...entry, status: "pending" as const };
        rows.set(row.id!, row);
        return row;
      })),
      update: jest.fn(async (entries: PersistedNotification[]) => entries.map((entry) => {
        if (!rows.has(entry.id!)) throw new Error("Cannot update missing notification");
        rows.set(entry.id!, { ...rows.get(entry.id!), ...entry });
        return rows.get(entry.id!);
      })),
    },
    notificationProviderService_: {
      getProviderForChannels: jest.fn(async () => [{ id: "resend", is_enabled: true, channels: ["email"] }]),
      send,
    },
    baseRepository_: { getFreshManager: () => ({}), transaction: async (job: (manager: object) => Promise<unknown>) => job({}) },
  };
  const implementation = TestNotificationModuleService.implementation();
  const createNotifications = jest.fn(async (request) => (await implementation.call(internal, [request], {}))[0]);
  let tail = Promise.resolve();
  const execute = jest.fn((_key: string, job: () => Promise<unknown>) => {
    const result = tail.then(job);
    tail = result.then(() => undefined, () => undefined);
    return result;
  });
  const container = { resolve: (module: string) => module === "locking" ? { execute } : { listNotifications: list, createNotifications } } as unknown as MedusaContainer;
  return { container, rows, send, createNotifications, execute };
}

describe("Medusa email delivery retry adapter", () => {
  it("keeps successful replays from creating or sending a second notification", async () => {
    const state = fixture();
    const first = await deliverEmailNotification(state.container, input);
    expect(first.status).toBe("success");
    expect(await deliverEmailNotification(state.container, input)).toEqual(first);
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.rows.size).toBe(1);
  });
  it("propagates provider failure then retries the original failed record successfully", async () => {
    const state = fixture();
    state.send.mockRejectedValueOnce(new Error("Provider rejected request"));
    await expect(deliverEmailNotification(state.container, input)).rejects.toThrow();
    const [failed] = [...state.rows.values()];
    expect(failed.status).toBe("failure");
    const retried = await deliverEmailNotification(state.container, input);
    expect(retried).toMatchObject({ id: failed.id, status: "success", external_id: "resend-one" });
    expect(state.rows.size).toBe(1);
    expect(state.send.mock.calls[0][1].idempotency_key).toBe(state.send.mock.calls[1][1].idempotency_key);
  });
  it("serializes concurrent replays using the existing distributed locking module", async () => {
    const state = fixture();
    const [first, second] = await Promise.all([deliverEmailNotification(state.container, input), deliverEmailNotification(state.container, input)]);
    expect(first).toEqual(second);
    expect(state.send).toHaveBeenCalledTimes(1);
    expect(state.execute.mock.calls[0][0]).toBe(state.execute.mock.calls[1][0]);
  });
  it("does not acknowledge a pending record or send around it", async () => {
    const state = fixture([{ id: "noti-pending", ...input, status: "pending" }]);
    await expect(deliverEmailNotification(state.container, input)).rejects.toThrow("not confirmed sent");
    expect(state.send).not.toHaveBeenCalled();
  });
  it("does not leak the recipient or secret in auth idempotency keys", () => {
    const key = authNotificationKey("password-reset", "customer", "private@example.com", "secret-token");
    expect(key).toMatch(/^auth-email\/[a-f0-9]{64}$/);
    expect(key).toBe(authNotificationKey("password-reset", "customer", "private@example.com", "secret-token"));
    expect(key).not.toBe(authNotificationKey("password-reset", "customer", "private@example.com", "new-token"));
    expect(key).not.toBe(authNotificationKey("password-reset", "member", "private@example.com", "secret-token"));
  });
});
