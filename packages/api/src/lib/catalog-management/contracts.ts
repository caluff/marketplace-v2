import { z } from "@medusajs/framework/zod";

const expectedUpdatedAt = z.iso.datetime({ offset: true });
const content = z.strictObject({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(200).nullable(),
  description: z.string().trim().max(20_000).nullable(),
});

export const AdminCatalogProductManageSchema = z.discriminatedUnion("action", [
  z.strictObject({
    expected_updated_at: expectedUpdatedAt,
    action: z.literal("update-content"),
    content,
  }),
  z.strictObject({
    expected_updated_at: expectedUpdatedAt,
    action: z.literal("withdraw"),
  }),
  z.strictObject({
    expected_updated_at: expectedUpdatedAt,
    action: z.literal("publish"),
  }),
]);

export const AdminCatalogManagementConflictCodeSchema = z.enum([
  "catalog_pending_change",
  "catalog_product_changed",
  "catalog_status_changed",
]);

export type AdminCatalogProductManageInput = z.infer<
  typeof AdminCatalogProductManageSchema
>;
export type AdminCatalogManagementConflictCode = z.infer<
  typeof AdminCatalogManagementConflictCodeSchema
>;
