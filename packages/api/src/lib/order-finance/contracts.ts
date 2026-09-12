import { z } from "@medusajs/framework/zod";

export const orderFinanceInputSchema = z
  .object({
    action: z.enum(["cancel", "refund", "capture"]),
    amount: z.number().finite().positive().optional(),
    note: z.string().trim().min(3).max(500),
    request_id: z.uuid(),
    confirm: z.literal(true),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.action === "refund" && input.amount === undefined) {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Indica el importe del reembolso.",
      });
    }
    if (input.action !== "refund" && input.amount !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message: "El importe de esta operación lo calcula el servidor.",
      });
    }
  });

export type OrderFinanceInput = z.infer<typeof orderFinanceInputSchema>;

export type OrderFinanceResponse = {
  finance: {
    order_id: string;
    currency_code: string;
    allocated_total: number;
    refunded_total: number;
    refundable_total: number;
    captured_total: number;
    capture: { allowed: boolean; reason: string | null; amount: number };
    cancellation: {
      allowed: boolean;
      reason: string | null;
      refund_amount: number;
    };
    refund: { allowed: boolean; reason: string | null };
    history: Array<{
      id: string;
      kind: "cancel" | "refund" | "capture";
      amount: number;
      status: "processing" | "complete" | "uncertain";
      note: string;
      created_at: string;
      seller_reversed?: number;
      commission_returned?: number;
    }>;
  };
};
