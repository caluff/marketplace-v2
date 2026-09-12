import { MathBN, MedusaError } from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { decimal, financeAmount, type FinanceOperation } from "./policy";
import { financeStripeClient } from "./provider";

export const financePayoutSchema = z.object({
  id: z.string(),
  amount: decimal,
  currency_code: z.literal("usd"),
  status: z.literal("paid"),
  account_id: z.string(),
  account: z.object({
    id: z.string(),
    data: z.object({ id: z.string().startsWith("acct_") }),
  }),
  data: z.object({
    id: z.string().startsWith("tr_"),
    transfer_group: z.string(),
    destination: z.string().startsWith("acct_"),
    livemode: z.literal(false),
    metadata: z.object({ seller_id: z.string() }),
  }),
});
export type FinancePayout = z.infer<typeof financePayoutSchema>;
export type FinanceSettlement = NonNullable<FinanceOperation["settlement"]>;

// Round cumulative commission, not individual refunds: the last refund exactly
// exhausts both the seller's transfer and the platform's retained commission.
export function proportionalSettlement(
  gross: number,
  sellerNet: number,
  refunded: number,
  amount: number,
) {
  const g = BigInt(MathBN.mult(financeAmount(gross), 100).toNumber());
  const n = BigInt(MathBN.mult(financeAmount(sellerNet), 100).toNumber());
  const r = BigInt(MathBN.mult(financeAmount(refunded), 100).toNumber());
  const a = BigInt(MathBN.mult(financeAmount(amount), 100).toNumber());
  if (g <= 0n || n > g || r + a > g)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "El reparto de la liquidación requiere revisión.",
    );
  const commissionAt = (value: bigint) => ((g - n) * value + g / 2n) / g;
  const commission = commissionAt(r + a) - commissionAt(r);
  return {
    seller_reversed: Number(a - commission) / 100,
    commission_returned: Number(commission) / 100,
  };
}

export async function prepareSettlement(input: {
  payout?: FinancePayout;
  orderId: string;
  sellerId: string;
  gross: number;
  refunded: number;
  amount: number;
  prior: FinanceSettlement[];
}): Promise<FinanceSettlement | undefined> {
  const stripe = financeStripeClient();
  const transfers = await stripe.transfers.list({
    transfer_group: input.orderId,
    limit: 100,
  });
  if (transfers.has_more || (!input.payout && transfers.data.length))
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Hay una transferencia sin conciliar con este pedido.",
    );
  if (!input.payout) return;
  const payout = input.payout;
  const transfer = transfers.data[0];
  const net = financeAmount(payout.amount);
  const priorReversed = input.prior.reduce(
    (sum, part) => MathBN.add(sum, part.seller_reversed).toNumber(),
    0,
  );
  const priorCommission = input.prior.reduce(
    (sum, part) => MathBN.add(sum, part.commission_returned).toNumber(),
    0,
  );
  if (
    transfers.data.length !== 1 ||
    !transfer ||
    transfer.livemode ||
    transfer.id !== payout.data.id ||
    transfer.currency !== "usd" ||
    transfer.destination !== payout.account.data.id ||
    payout.data.destination !== payout.account.data.id ||
    payout.account_id !== payout.account.id ||
    transfer.transfer_group !== input.orderId ||
    transfer.metadata.seller_id !== input.sellerId ||
    payout.data.metadata.seller_id !== input.sellerId ||
    !MathBN.eq(transfer.amount, MathBN.mult(net, 100)) ||
    !MathBN.eq(transfer.amount_reversed, MathBN.mult(priorReversed, 100)) ||
    !MathBN.eq(MathBN.add(priorReversed, priorCommission), input.refunded) ||
    input.prior.some(
      (part) =>
        part.payout_id !== payout.id ||
        part.transfer_id !== transfer.id ||
        !MathBN.eq(part.gross, input.gross) ||
        !MathBN.eq(part.seller_net, net),
    )
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "La transferencia de esta tienda no coincide con su contabilidad.",
    );
  }
  const reversals = await stripe.transfers.listReversals(transfer.id, {
    limit: 100,
  });
  const knownIds = input.prior.flatMap((part) =>
    part.reversal_id ? [part.reversal_id] : [],
  );
  if (
    reversals.has_more ||
    reversals.data.length !== knownIds.length ||
    reversals.data.some((part) => !knownIds.includes(part.id))
  )
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Hay reversiones externas pendientes de conciliación.",
    );
  return {
    payout_id: payout.id,
    transfer_id: transfer.id,
    destination: payout.account.data.id,
    gross: input.gross,
    seller_net: net,
    ...proportionalSettlement(input.gross, net, input.refunded, input.amount),
  };
}

export async function reverseSettlement(
  settlement: FinanceSettlement,
  operationId: string,
  orderId: string,
) {
  if (!financeAmount(settlement.seller_reversed)) return settlement;
  const stripe = financeStripeClient();
  const amount = MathBN.mult(settlement.seller_reversed, 100).toNumber();
  const reversal = await stripe.transfers.createReversal(
    settlement.transfer_id,
    {
      amount,
      metadata: { finance_operation_id: operationId, order_id: orderId },
    },
    { idempotencyKey: `order-finance:${operationId}:reversal` },
  );
  if (
    reversal.amount !== amount ||
    reversal.transfer !== settlement.transfer_id ||
    reversal.metadata?.finance_operation_id !== operationId ||
    reversal.currency !== "usd"
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "La reversión requiere conciliación del operador.",
    );
  }
  return { ...settlement, reversal_id: reversal.id };
}
