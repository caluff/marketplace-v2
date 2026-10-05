import { z } from "@medusajs/framework/zod";
import {
  AdminNotificationEventSchema,
  AdminOrderCountResponseSchema,
  AdminNotificationsResponseSchema,
} from "../../../lib/admin-notifications/contracts";

export const VendorOrderNotificationsResponseSchema = z.strictObject({
  has_pending_orders: z.boolean(),
});

export type VendorOrderNotificationsResponse = z.infer<
  typeof VendorOrderNotificationsResponseSchema
>;

export type AdminNotificationEvent = z.infer<typeof AdminNotificationEventSchema>;
export type AdminOrderCountResponse = z.infer<typeof AdminOrderCountResponseSchema>;
export type AdminNotificationsResponse = z.infer<
  typeof AdminNotificationsResponseSchema
>;
