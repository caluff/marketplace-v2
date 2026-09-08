import { OrderGroupRepository } from "@mercurjs/core/modules/seller/repositories";

it.each(["cart_customer_a", "cart_customer_b", "cart_missing", "cart_' OR 1=1 --"])("binds %s to both order-group rows and count queries", async (cartId) => {
  const raw = jest.fn(async (sql: string, _bindings: unknown[]) => ({
    rows: sql.includes("SELECT COUNT") ? [{ count: "0" }] : [],
  }));
  // Exercise the native repository's SQL generation without booting the ORM.
  const repository = Object.assign(Object.create(OrderGroupRepository.prototype) as OrderGroupRepository, {
    getActiveManager: () => ({ getKnex: () => ({ raw }) }),
  });

  const result = await repository.findAndCount({ where: { cart_id: cartId } });

  expect(result).toEqual([[], 0]);
  expect(raw).toHaveBeenCalledTimes(2);
  for (const [sql, bindings] of raw.mock.calls) {
    expect(sql).toContain("og.cart_id = ?");
    expect(sql).not.toContain(cartId);
    expect(bindings[0]).toBe(cartId);
  }
});
