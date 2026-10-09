import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { COMMERCE_AUTOMATION_MODULE } from "../../../modules/commerce-automation";
import { readOrderFinance } from "../read";
import { financeGroup, originalSales } from "./fixtures";

jest.mock("@mercurjs/core/api/vendor/orders/helpers", () => ({
  validateSellerOrder: jest.fn(),
}));

const graph = jest.fn();
const container = { resolve: () => ({ graph }) } as unknown as MedusaContainer;
const actor = { actor_id: "cus_owner", customer_id: "cus_owner" };

beforeEach(() => jest.clearAllMocks());

it("does not read purchase financial data for another customer's order", async () => {
  graph.mockResolvedValue({ data: [] });
  await expect(
    readOrderFinance(container, "order_private", actor),
  ).rejects.toThrow("No encontramos este pedido en tu cuenta.");
  expect(graph).toHaveBeenCalledTimes(1);
  expect(graph.mock.calls[0][0]).toEqual({
    entity: "order",
    fields: ["id", "customer_id"],
    filters: { id: "order_private", customer_id: "cus_owner" },
  });
});

it("requires actual ownership even if a query unexpectedly returns a foreign row", async () => {
  graph.mockResolvedValue({
    data: [{ id: "order_1", customer_id: "cus_other" }],
  });
  await expect(readOrderFinance(container, "order_1", actor)).rejects.toThrow(
    "No encontramos este pedido en tu cuenta.",
  );
  expect(graph).toHaveBeenCalledTimes(1);
});

it("rechecks customer ownership in the fresh group projection", async () => {
  const group = financeGroup();
  group.orders[0].customer_id = "cus_other";
  graph.mockResolvedValueOnce({
    data: [{ id: "order_1", customer_id: "cus_owner" }],
  });
  graph.mockResolvedValueOnce({ data: [{ order_group_id: group.id }] });
  graph.mockResolvedValueOnce({ data: [group] });
  await expect(readOrderFinance(container, "order_1", actor)).rejects.toThrow(
    "No encontramos este pedido en tu cuenta.",
  );
  expect(graph).toHaveBeenCalledTimes(3);
});

it("does not accept an empty or mismatched customer identity", async () => {
  for (const customer_id of ["", "cus_other"]) {
    await expect(
      readOrderFinance(container, "order_1", {
        actor_id: "cus_owner",
        customer_id,
      }),
    ).rejects.toThrow("El acceso al pedido no es válido.");
  }
  expect(graph).not.toHaveBeenCalled();
});

it.each([false, true])(
  "requires a physical return to finish before a separate refund, without treating it as financial corruption (active=%s)",
  async (active) => {
    const group = financeGroup();
    const localGraph = jest.fn(async (input: { entity: string }) => ({
      data:
        input.entity === "order_group_order"
          ? [{ order_group_id: group.id }]
          : input.entity === "order_group"
            ? [group]
            : input.entity === "return" && active
              ? [{ id: "return_active" }]
              : [],
    }));
    const journal = {
      listCommerceGroupStates: jest.fn().mockResolvedValue([]),
      listCommerceOperations: jest.fn().mockResolvedValue([]),
      listFinanceSaleSnapshots: jest
        .fn()
        .mockResolvedValue(
          originalSales(group).map((original) => ({ original })),
        ),
    };
    const localContainer = {
      resolve: (key: string) =>
        key === COMMERCE_AUTOMATION_MODULE
          ? journal
          : key === ContainerRegistrationKeys.QUERY
            ? { graph: localGraph }
            : { warn: jest.fn() },
    } as unknown as MedusaContainer;
    const current = await readOrderFinance(localContainer, "order_1", {
      actor_id: "admin_operator",
    });
    expect(current.financialProblem).toBeNull();
    expect(current.view.finance.refund.allowed).toBe(!active);
    expect(current.view.finance.cancellation.allowed).toBe(!active);
    if (active)
      expect(current.view.finance.refund.reason).toBe(
        "Recibe o cancela la devolución física antes de reembolsar o cancelar este pedido.",
      );
    expect(localGraph).toHaveBeenCalledWith(
      {
        entity: "return",
        fields: ["id"],
        filters: {
          order_id: "order_1",
          status: ["open", "requested", "partially_received"],
          canceled_at: null,
        },
        pagination: { take: 1 },
      },
      { cache: { enable: false } },
    );
  },
);
