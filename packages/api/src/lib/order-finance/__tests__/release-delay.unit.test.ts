import { randomUUID } from "node:crypto";
import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  assertAutomaticSettlementEligible,
  orderCompletionSchema,
} from "../automatic-settlement";
import { recordOrderCompletions } from "../../../workflows/record-order-completions";
import { COMMERCE_AUTOMATION_MODULE } from "../../../modules/commerce-automation";
import type { readOrderFinance } from "../read";
import { financeGroup, originalSales } from "./fixtures";
import { readCompletedOrderDeliveryReady } from "../../vendor-orders/completion";

jest.mock("../../vendor-orders/completion", () => ({
  readCompletedOrderDeliveryReady: jest.fn(),
}));

const savedEnvironment = { ...process.env };
const graph = jest.fn();
const listStores = jest.fn();
const record = jest.fn();
const acquire = jest.fn();
const release = jest.fn();
const revision = randomUUID();
const container = {
  resolve(name: string) {
    if (name === Modules.STORE) return { listStores };
    if (name === Modules.LOCKING) return { acquire, release };
    if (name === ContainerRegistrationKeys.QUERY) return { graph };
    if (name === COMMERCE_AUTOMATION_MODULE)
      return { recordOrderCompletions: record };
    throw new Error(`Unexpected dependency: ${name}`);
  },
} as unknown as MedusaContainer;

function settings(delayDays: number, mode = "automatic") {
  return [
    {
      id: "store_test",
      metadata: {
        usapeek_payment_release: {
          mode,
          delay_days: delayDays,
          revision,
          actor_id: "user_operator",
        },
      },
    },
  ];
}

function clock(delayDays: number) {
  // The offset straddles a DST transition: a day still means 24 elapsed hours.
  const completedAt = new Date("2026-11-01T00:30:00-04:00");
  return {
    id: "order_1",
    group_id: "group_shared",
    cart_id: "cart_shared",
    seller_id: "seller_1",
    registration_token: randomUUID(),
    release_delay_days: delayDays,
    completed_at: completedAt,
    eligible_at: new Date(completedAt.getTime() + delayDays * 86_400_000),
    observed_order_updated_at: completedAt,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(readCompletedOrderDeliveryReady).mockResolvedValue(false);
  process.env.STRIPE_API_KEY = "sk_test_disposable";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_disposable";
  process.env.STRIPE_PAYOUT_WEBHOOK_SECRET = "whsec_disposable";
  process.env.STRIPE_AUTOMATIC_JOBS_ENABLED = "false";
  process.env.STRIPE_AUTOMATIC_SETTLEMENT_ENABLED = "false";
  process.env.VENDOR_PUBLIC_URL = "http://localhost:7001";
  process.env.NODE_ENV = "test";
  listStores.mockResolvedValue(settings(3));
  acquire.mockResolvedValue(undefined);
  release.mockResolvedValue(true);
  record.mockResolvedValue([]);
});
afterAll(() => {
  process.env = savedEnvironment;
});

it("accepts a completed pickup only with the same verified delivery proof used by vendor completion", async () => {
  const completion = orderCompletionSchema.parse(clock(0));
  listStores.mockResolvedValue(settings(0));
  const group = financeGroup();
  group.orders[0].status = "completed";
  const current = { group, original: originalSales(group)[0] } as Awaited<
    ReturnType<typeof readOrderFinance>
  >;
  const nativeOrder = {
    id: "order_1",
    status: "completed",
    updated_at: completion.observed_order_updated_at,
    items: [
      {
        quantity: 1,
        requires_shipping: true,
        detail: {
          fulfilled_quantity: 1,
          shipped_quantity: 0,
          delivered_quantity: 0,
        },
      },
    ],
  };
  graph.mockImplementation(async ({ entity }) => ({
    data:
      entity === "seller"
        ? [{ id: "seller_1", status: "open" }]
        : [nativeOrder],
  }));
  await expect(
    assertAutomaticSettlementEligible(
      container,
      current,
      completion,
      completion.eligible_at.getTime(),
    ),
  ).rejects.toThrow("preparación y el envío");
  jest.mocked(readCompletedOrderDeliveryReady).mockResolvedValue(true);
  await expect(
    assertAutomaticSettlementEligible(
      container,
      current,
      completion,
      completion.eligible_at.getTime(),
    ),
  ).resolves.toBeUndefined();
  expect(readCompletedOrderDeliveryReady).toHaveBeenCalledWith(
    container,
    "seller_1",
    "order_1",
  );
  expect(nativeOrder.items[0].detail).toEqual({
    fulfilled_quantity: 1,
    shipped_quantity: 0,
    delivered_quantity: 0,
  });
  nativeOrder.items[0].detail.fulfilled_quantity = 0;
  await expect(
    assertAutomaticSettlementEligible(
      container,
      current,
      completion,
      completion.eligible_at.getTime(),
    ),
  ).rejects.toThrow("preparación y el envío");
});

it("checks the immutable version before allowing the pickup exception", async () => {
  const completion = orderCompletionSchema.parse(clock(0));
  const group = financeGroup();
  group.orders[0].status = "completed";
  const current = { group, original: originalSales(group)[0] } as Awaited<
    ReturnType<typeof readOrderFinance>
  >;
  graph.mockImplementation(async ({ entity }) => ({
    data:
      entity === "seller"
        ? [{ id: "seller_1", status: "open" }]
        : [
            {
              id: "order_1",
              status: "completed",
              updated_at: new Date(
                completion.observed_order_updated_at.getTime() + 1,
              ),
              items: [
                {
                  quantity: 1,
                  requires_shipping: true,
                  detail: {
                    fulfilled_quantity: 1,
                    shipped_quantity: 0,
                    delivered_quantity: 0,
                  },
                },
              ],
            },
          ],
  }));
  jest.mocked(readCompletedOrderDeliveryReady).mockResolvedValue(true);
  await expect(
    assertAutomaticSettlementEligible(
      container,
      current,
      completion,
      completion.eligible_at.getTime(),
    ),
  ).rejects.toThrow("pedido cambió");
  expect(readCompletedOrderDeliveryReady).not.toHaveBeenCalled();
});

it.each([0, 1, 2, 3, 365])(
  "uses the saved %i-day delay for new completion even in Manual mode",
  async (days) => {
    listStores.mockResolvedValue(settings(days, "manual"));
    const updatedAt = "2026-10-06T10:30:00-03:00";
    graph.mockResolvedValue({
      data: [
        { id: "order_1", status: "completed", updated_at: updatedAt },
        { id: "order_2", status: "pending", updated_at: updatedAt },
      ],
    });
    record.mockImplementation(async () => {
      expect(acquire).toHaveBeenCalledTimes(1);
      expect(release).not.toHaveBeenCalled();
      return [];
    });
    await recordOrderCompletions(container, {
      order_ids: ["order_1", "order_1", "order_2"],
    });
    expect(record).toHaveBeenCalledWith([
      {
        id: "order_1",
        observed_order_updated_at: "2026-10-06T13:30:00.000Z",
        release_delay_days: days,
      },
    ]);
    expect(release).toHaveBeenCalledTimes(1);
  },
);

it("cannot record a clock concurrently with a settings change or settlement", async () => {
  graph.mockResolvedValue({
    data: [{ id: "order_1", status: "completed", updated_at: new Date() }],
  });
  acquire.mockRejectedValueOnce(new Error("Occupied"));
  await expect(
    recordOrderCompletions(container, { order_ids: ["order_1"] }),
  ).rejects.toThrow("operación de pagos en curso");
  expect(record).not.toHaveBeenCalled();
  expect(release).not.toHaveBeenCalled();
});

it.each([0, 1, 2, 3])(
  "enforces the immutable %i-day clock at the exact boundary despite a changed current setting",
  async (days) => {
    const completion = orderCompletionSchema.parse(clock(days));
    // A later global change cannot shorten an earlier clock or extend a zero-day clock.
    listStores.mockResolvedValue(settings(days === 0 ? 3 : 0));
    const group = financeGroup();
    group.orders[0].status = "completed";
    const current = { group, original: originalSales(group)[0] } as Awaited<
      ReturnType<typeof readOrderFinance>
    >;
    graph.mockImplementation(async ({ entity }) => ({
      data:
        entity === "seller"
          ? [{ id: "seller_1", status: "open" }]
          : [
              {
                id: "order_1",
                status: "completed",
                updated_at: completion.observed_order_updated_at,
                items: [
                  {
                    quantity: 1,
                    requires_shipping: true,
                    detail: {
                      fulfilled_quantity: 1,
                      shipped_quantity: 1,
                      delivered_quantity: 0,
                    },
                  },
                ],
              },
            ],
    }));
    const due = completion.eligible_at.getTime();
    await expect(
      assertAutomaticSettlementEligible(
        container,
        current,
        completion,
        due - 1,
      ),
    ).rejects.toThrow("plazo registrado");
    expect(graph).not.toHaveBeenCalled();
    await expect(
      assertAutomaticSettlementEligible(container, current, completion, due),
    ).resolves.toBeUndefined();
    expect(graph).toHaveBeenCalledTimes(2);
  },
);

it.each([-1, 0.5, 366, Infinity, NaN])(
  "rejects an invalid per-order snapshot %s",
  (days) => {
    expect(() => orderCompletionSchema.parse(clock(days))).toThrow();
  },
);

it("rejects shortened or extended clocks and nonfinite instants", () => {
  const completion = clock(1);
  for (const difference of [-1, 1]) {
    expect(() =>
      orderCompletionSchema.parse({
        ...completion,
        eligible_at: new Date(completion.eligible_at.getTime() + difference),
      }),
    ).toThrow("recorded elapsed days");
  }
  expect(() =>
    orderCompletionSchema.parse({ ...completion, completed_at: new Date(NaN) }),
  ).toThrow();
});
