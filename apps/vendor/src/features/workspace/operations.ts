import type Medusa from "@medusajs/js-sdk";
import type { InventoryLevelDTO, HttpTypes as MedusaHttpTypes } from "@medusajs/types";
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
import { createCatalogBody, selectedCategories, submittedImages } from "../catalog/validation";
import { createMasterSku } from "../catalog/master-sku";

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

export function vendorOperations(authorize: AuthorizeVendor) {
  return {
    async createLocation(_form: FormData) {
      scopedClient(await authorize());
      void _form;
      throw new Error(
        "El almacén se administra desde la solicitud aprobada. Consulta al operador para corregir su configuración.",
      );
    },
    async createProduct(form: FormData) {
      const client = scopedClient(await authorize());
      const body = createCatalogBody(form, (variant, index) =>
        createMasterSku(
          `${variant.title}-${Object.values(variant.options).join("-")}-${index + 1}`,
        ),
      );
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
        ...(form.has("categories_present") ? { categories: selectedCategories(form) } : {}),
        ...(form.has("images") ? { images: submittedImages(form) } : {}),
      } satisfies Pick<CreateProductDTO, "title" | "subtitle" | "description"> & Pick<MedusaHttpTypes.AdminUpdateProduct, "categories">;
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
