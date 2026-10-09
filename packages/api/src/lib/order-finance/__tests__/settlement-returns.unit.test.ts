import type { MedusaContainer } from "@medusajs/framework/types";
import { prepareOrderSettlement } from "../settlement-plan";
import { readOrderFinance } from "../read";
import { readFinanceProvider } from "../provider";
import { financeGroup, originalSales } from "./fixtures";

jest.mock("../read", () => ({ readOrderFinance: jest.fn() }));
jest.mock("../provider", () => ({ readFinanceProvider: jest.fn() }));
jest.mock("../settlement-authorization", () => ({
  requireSettlementAuthority: jest.fn().mockResolvedValue(undefined),
}));

it.each([
  { pending: true, balance: 0 },
  { pending: false, balance: -20 },
])("holds settlement before contacting Stripe while return accounting is unresolved: %p", async ({ pending, balance }) => {
  const group = financeGroup();
  group.orders[0].status = "completed";
  group.orders[0].summary!.pending_difference = balance;
  jest.mocked(readOrderFinance).mockResolvedValue({
    group,
    original: originalSales(group)[0],
    hasPendingChanges: pending,
    financialProblem: null,
    operations: [],
  } as unknown as Awaited<ReturnType<typeof readOrderFinance>>);
  await expect(
    prepareOrderSettlement({} as MedusaContainer, {
      order_id: group.orders[0].id,
      actor_id: "user_operator",
    }),
  ).rejects.toThrow("La liquidación requiere conciliación previa.");
  expect(readFinanceProvider).not.toHaveBeenCalled();
});
