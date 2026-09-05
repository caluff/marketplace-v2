import { validateAndTransformBody } from "@medusajs/framework/http";
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { StoreUpdateCustomerAddress } from "@medusajs/medusa/api/store/customers/validators";
import {
  StoreCreateUsCustomer,
  StoreCreateUsCustomerAddress,
  StoreUpdateUsCustomer,
  StoreUpdateUsCustomerAddress,
} from "../../api/store/customer-account/validators";

const address = {
  first_name: "Daniel",
  last_name: "Example",
  address_1: "123 Main Street",
  city: "Los Angeles",
  country_code: "us",
  province: "ca",
  postal_code: "90012",
  phone: "+12133734253",
};

describe("customer account contact validation", () => {
  it("normalizes a valid US phone number without changing other profile fields", () => {
    const profile = {
      first_name: "Daniel",
      company_name: "Example",
      phone: "+1 (213) 373-4253",
      metadata: { preferences: { newsletter: true } },
    };

    expect(StoreUpdateUsCustomer.parse(profile)).toEqual({
      ...profile,
      phone: "+12133734253",
    });
  });

  it.each([
    "+14165550123", // Canada also uses +1.
    "+12423651234", // The Bahamas also uses +1.
    "+442079460018",
    "+11234567890",
    "Call +12133734253",
    "2133734253",
    "+12133734253 ext. 123",
  ])("rejects non-US or malformed phone %s", (phone) => {
    expect(StoreCreateUsCustomer.safeParse({ phone }).success).toBe(false);
    expect(StoreUpdateUsCustomer.safeParse({ phone }).success).toBe(false);
    expect(
      StoreCreateUsCustomerAddress.safeParse({ ...address, phone }).success,
    ).toBe(false);
    expect(StoreUpdateUsCustomerAddress.safeParse({ phone }).success).toBe(false);
  });

  it.each([undefined, null, ""])(
    "allows optional profile phone or clearing it with %s",
    (phone) => {
      expect(StoreCreateUsCustomer.parse({ email: "person@example.com", phone }))
        .toEqual({ email: "person@example.com", phone });
      expect(StoreUpdateUsCustomer.parse({ first_name: "Daniel", phone }))
        .toEqual({ first_name: "Daniel", phone });
    },
  );

  it("accepts US addresses and ZIP+4 while preserving supported address fields", () => {
    const body = {
      ...address,
      country_code: "US",
      province: "CA",
      postal_code: "90012-1234",
      address_name: "Home",
      address_2: "Apartment 2",
      company: "Example",
      metadata: { delivery: "Ring the bell" },
      is_default_shipping: true,
      is_default_billing: false,
    };

    expect(StoreCreateUsCustomerAddress.parse(body)).toEqual({
      ...body,
      country_code: "us",
      province: "ca",
    });
  });

  it.each([
    { country_code: "ca" },
    { country_code: null },
    { province: "on" },
    { province: "pr" },
    { postal_code: "M5V 3A8" },
    { postal_code: "1234" },
    { postal_code: "123456" },
    { phone: "" },
    { address_1: "   " },
  ])("rejects invalid address input %j", (fields) => {
    expect(
      StoreCreateUsCustomerAddress.safeParse({ ...address, ...fields }).success,
    ).toBe(false);
    expect(StoreUpdateUsCustomerAddress.safeParse(fields).success).toBe(false);
  });

  it("requires a complete address on creation", () => {
    expect(
      StoreCreateUsCustomerAddress.safeParse({ is_default_shipping: true }).success,
    ).toBe(false);
  });

  it("accepts a default-only update without filling or clearing address fields", () => {
    expect(
      StoreUpdateUsCustomerAddress.parse({ is_default_shipping: true }),
    ).toEqual({ is_default_shipping: true });
  });

  it("preserves unrelated validated fields when composed after Medusa validation", async () => {
    const body = {
      address_name: "Office",
      company: "Example",
      address_2: null,
      phone: "+1 (202) 555-0123",
      metadata: { delivery: "Reception" },
      is_default_shipping: true,
      is_default_billing: true,
    };
    const request = { body } as MedusaRequest;
    const response = {} as MedusaResponse;
    const next = jest.fn();

    await validateAndTransformBody(StoreUpdateCustomerAddress)(request, response, next);
    await validateAndTransformBody(StoreUpdateUsCustomerAddress)(request, response, next);

    expect(next.mock.calls).toEqual([[], []]);
    expect(request.validatedBody).toEqual({ ...body, phone: "+12025550123" });
    expect(request.body).toEqual(body);
  });
});
