import type Medusa from "@medusajs/js-sdk";
import type { InventoryLevelDTO } from "@medusajs/types";
import type {
  CreateProductDTO,
  HttpTypes,
  ProductChangeDTO,
  SellerMemberDTO,
  UpdateSellerAddressDTO,
  UpdateProfessionalDetailsDTO,
} from "@mercurjs/types";
import {
  emailField,
  resourceId,
  stockQuantity,
  textField,
  websiteField,
} from "./validation";

export type AuthorizedVendor = { sdk: Medusa; membership: SellerMemberDTO };
export type AuthorizeVendor = () => Promise<AuthorizedVendor>;

export function assertActiveVendor(membership: SellerMemberDTO) {
  if (!membership.member?.is_active)
    throw new Error(
      "Tu membresía está inactiva. Inicia sesión nuevamente o consulta al administrador.",
    );
  if (membership.seller.status !== "open")
    throw new Error(
      "La tienda no está activa. No se permiten cambios en este estado.",
    );
}

export function scopedClient({ sdk, membership }: AuthorizedVendor) {
  assertActiveVendor(membership);
  return {
    get: <T>(path: string, query?: Record<string, unknown>) =>
      sdk.client.fetch<T>(path, {
        query,
        headers: { "x-seller-id": membership.seller.id },
        cache: "no-store",
      }),
    post: <T>(path: string, body: object) =>
      sdk.client.fetch<T>(path, {
        method: "POST",
        body,
        headers: { "x-seller-id": membership.seller.id },
        cache: "no-store",
      }),
  };
}

export async function visibleProduct(
  client: ReturnType<typeof scopedClient>,
  id: string,
) {
  resourceId(id);
  const { products } = await client.get<HttpTypes.VendorProductListResponse>(
    "/vendor/products",
    { id, limit: 1, fields: "id" },
  );
  if (!products.some((product) => product.id === id))
    throw new Error("El producto no está disponible para esta tienda.");
}

export function vendorOperations(authorize: AuthorizeVendor) {
  return {
    async createLocation(form: FormData) {
      const client = scopedClient(await authorize());
      const country = textField(form, "country_code", true, 2).toLowerCase();
      if (country !== "us")
        throw new Error(
          "Las direcciones de la tienda deben estar en Estados Unidos.",
        );
      return client.post<HttpTypes.VendorStockLocationResponse>(
        "/vendor/stock-locations",
        {
          name: textField(form, "name", true, 200),
          address: {
            address_1: textField(form, "address_1", true),
            city: textField(form, "city", true),
            postal_code: textField(form, "postal_code", true, 30),
            country_code: country,
          },
        },
      );
    },
    async createProduct(form: FormData) {
      const client = scopedClient(await authorize());
      const status = textField(form, "status", true);
      if (status !== "proposed")
        throw new Error("Los nuevos productos deben enviarse a aprobación.");
      const body = {
        title: textField(form, "title", true, 200),
        subtitle: textField(form, "subtitle", false, 200),
        description: textField(form, "description", false, 10000),
        status,
      } satisfies CreateProductDTO;
      return client.post<HttpTypes.VendorProductResponse>(
        "/vendor/products",
        body,
      );
    },
    async editProduct(form: FormData) {
      const client = scopedClient(await authorize());
      const id = resourceId(textField(form, "id", true));
      const body = {
        title: textField(form, "title", true, 200),
        subtitle: textField(form, "subtitle", false, 200),
        description: textField(form, "description", false, 10000),
      } satisfies Pick<CreateProductDTO, "title" | "subtitle" | "description">;
      await visibleProduct(client, id);
      return client.post<{ product_change: ProductChangeDTO }>(
        `/vendor/products/${id}`,
        body,
      );
    },
    async updateStock(form: FormData) {
      const client = scopedClient(await authorize());
      const id = resourceId(textField(form, "id", true));
      const locationId = resourceId(textField(form, "location_id", true));
      const quantity = stockQuantity(textField(form, "stocked_quantity", true));
      const expected = stockQuantity(
        textField(form, "expected_quantity", true),
      );
      return client.post<{ inventory_level: InventoryLevelDTO }>(
        "/vendor/inventory-adjustments",
        {
          inventory_item_id: id,
          location_id: locationId,
          expected_quantity: expected,
          stocked_quantity: quantity,
        },
      );
    },
    async updateProfile(form: FormData) {
      const client = scopedClient(await authorize());
      return client.post<HttpTypes.VendorSellerResponse>("/vendor/sellers/me", {
        name: textField(form, "name", true, 200),
        email: emailField(form),
        phone: textField(form, "phone", false, 50) || null,
        description: textField(form, "description", false, 5000) || null,
        website_url: websiteField(form),
      });
    },
    async updateAddress(form: FormData) {
      const authorized = await authorize();
      const client = scopedClient(authorized);
      const country = textField(form, "country_code", true, 2).toLowerCase();
      if (country !== "us")
        throw new Error(
          "Las direcciones de la tienda deben estar en Estados Unidos.",
        );
      const body = {
        company: textField(form, "company") || null,
        address_1: textField(form, "address_1", true),
        address_2: textField(form, "address_2") || null,
        city: textField(form, "city", true),
        province: textField(form, "province") || null,
        postal_code: textField(form, "postal_code", true, 30),
        country_code: country,
      } satisfies UpdateSellerAddressDTO;
      return client.post<HttpTypes.VendorSellerResponse>(
        `/vendor/sellers/${authorized.membership.seller.id}/address`,
        body,
      );
    },
    async updateCompany(form: FormData) {
      const authorized = await authorize();
      const client = scopedClient(authorized);
      const body = {
        corporate_name: textField(form, "corporate_name", true),
      } satisfies UpdateProfessionalDetailsDTO;
      return client.post<HttpTypes.VendorSellerResponse>(
        `/vendor/sellers/${authorized.membership.seller.id}/professional-details`,
        body,
      );
    },
  };
}
