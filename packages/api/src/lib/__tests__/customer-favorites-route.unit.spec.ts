import { POST } from "../../api/store/customers/me/favorites/route";
import { updateCustomerFavoriteWorkflow } from "../../workflows/update-customer-favorite";

jest.mock("../../workflows/update-customer-favorite", () => ({
  updateCustomerFavoriteWorkflow: jest.fn(),
}));

describe("customer favorites route", () => {
  it("scopes both mutation and response to the authenticated customer", async () => {
    const run = jest.fn().mockResolvedValue({});
    jest.mocked(updateCustomerFavoriteWorkflow).mockReturnValue({ run } as never);
    const graph = jest.fn().mockResolvedValue({
      data: [{
        id: "cus_current",
        email: "customer@example.com",
        metadata: { account_favorite_product_ids: ["prod_one"] },
        addresses: [],
      }],
    });
    const json = jest.fn();
    const scope = { resolve: jest.fn(() => ({ graph })) };

    await POST({
      auth_context: { actor_id: "cus_current" },
      validatedBody: { product_id: "prod_one", saved: true, customer_id: "cus_other" },
      scope,
    } as never, { json } as never);

    expect(run).toHaveBeenCalledWith({
      input: { customer_id: "cus_current", product_id: "prod_one", saved: true },
    });
    expect(graph).toHaveBeenCalledWith(expect.objectContaining({
      entity: "customer",
      filters: { id: "cus_current" },
    }));
    expect(json).toHaveBeenCalledWith({ customer: expect.objectContaining({
      id: "cus_current",
      default_shipping_address_id: null,
      default_billing_address_id: null,
    }) });
  });

  it("does not return stale customer data when the mutation fails", async () => {
    const run = jest.fn().mockRejectedValue(new Error("Product is unavailable"));
    jest.mocked(updateCustomerFavoriteWorkflow).mockReturnValue({ run } as never);
    const resolve = jest.fn();
    const json = jest.fn();

    await expect(POST({
      auth_context: { actor_id: "cus_current" },
      validatedBody: { product_id: "prod_one", saved: true },
      scope: { resolve },
    } as never, { json } as never)).rejects.toThrow("Product is unavailable");
    expect(resolve).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });
});
