import type { MedusaContainer } from "@medusajs/framework/types";
import { StoreSearchProductsSchema } from "../../api/store/products/search/validators";
import { buildSearchParams, searchProducts } from "../algolia/search-products";
import { projectSearchProducts } from "../algolia/product-projection";
import type { AlgoliaProduct, SearchSort } from "../../modules/algolia/types";
import type { SearchParamsObject } from "algoliasearch";

const input = () => ({
  ...StoreSearchProductsSchema.parse({ region_id: "reg_us" }),
  sales_channel_ids: ["sc_store"],
});

function scope(
  graph: jest.Mock,
  search = jest.fn(),
  calculatePrices = jest.fn(),
): MedusaContainer {
  return {
    resolve: (key: string) => {
      if (key === "query") return { graph };
      if (key === "pricing") return { calculatePrices };
      if (key === "algolia") return { search };
      throw new Error(`Unexpected dependency ${key}`);
    },
  } as unknown as MedusaContainer;
}

describe("store search validation and global query", () => {
  test("rejects raw Algolia filters and impersonated price contexts", () => {
    for (const extra of [
      { filters: "status:draft" },
      { customer_id: "cus_other" },
      { customer_group_id: ["group_private"] },
      { sales_channel_ids: ["sc_private"] },
    ]) {
      expect(
        StoreSearchProductsSchema.safeParse({ region_id: "reg_us", ...extra })
          .success,
      ).toBe(false);
    }
  });
  test("validates bounds and accepts up to twenty selected stores", () => {
    expect(
      StoreSearchProductsSchema.safeParse({
        region_id: "reg_us",
        seller_ids: ["sel_one", "sel_two"],
      }).success,
    ).toBe(true);
    expect(
      StoreSearchProductsSchema.safeParse({
        region_id: "reg_us",
        seller_ids: Array.from({ length: 21 }, (_, i) => `sel_${i}`),
      }).success,
    ).toBe(false);
    expect(
      StoreSearchProductsSchema.safeParse({
        region_id: "reg_us",
        min_price: 20,
        max_price: 10,
      }).success,
    ).toBe(false);
    expect(
      StoreSearchProductsSchema.safeParse({
        region_id: "reg_us",
        hitsPerPage: 1000,
      }).success,
    ).toBe(false);
    expect(
      StoreSearchProductsSchema.safeParse({
        region_id: "reg_us",
        category_ids: ["cat OR status:draft"],
      }).success,
    ).toBe(false);
  });
  test("applies region, authorized channels, visible sellers and prices before pagination", () => {
    expect(
      buildSearchParams(
        {
          ...input(),
          query: "chair",
          category_ids: ["cat_a", "cat_b"],
          seller_ids: ["sel_open"],
          min_price: 0,
          max_price: 250,
          page: 2,
        },
        ["sel_open"],
      ),
    ).toMatchObject({
      query: "chair",
      page: 2,
      hitsPerPage: 24,
      facetFilters: [
        "region_id:reg_us",
        ["seller_scope:sel_open"],
        ["sales_channel_ids:sc_store", "sales_channel_ids:__shared_catalog__"],
        ["seller_ids:sel_open"],
        ["category_ids:cat_a", "category_ids:cat_b"],
      ],
      numericFilters: ["price>=0", "price<=250"],
    });
  });
});

describe("native regional price projection", () => {
  test("indexes separate aggregate and seller minimum prices without exposing price rules", async () => {
    const graph = jest.fn(async ({ entity }: { entity: string }) => {
      if (entity === "region")
        return { data: [{ id: "reg_us", currency_code: "usd" }] };
      if (entity === "seller")
        return { data: [{ id: "sel_a" }, { id: "sel_b" }] };
      if (entity === "offer")
        return {
          data: [
            {
              id: "offer_a",
              product_id: "prod_a",
              seller_id: "sel_a",
              product_variant: { price_set: { id: "ps_a" } },
            },
            {
              id: "offer_b",
              product_id: "prod_a",
              seller_id: "sel_b",
              product_variant: { price_set: { id: "ps_a" } },
            },
          ],
        };
      return {
        data: [
          {
            id: "prod_a",
            title: "Chair",
            subtitle: null,
            description: null,
            created_at: new Date("2026-09-10T00:00:00Z"),
            tags: [],
            categories: [
              {
                id: "cat_public",
                name: "Furniture",
                is_active: true,
                is_internal: false,
              },
              {
                id: "cat_private",
                name: "Internal",
                is_active: true,
                is_internal: true,
              },
            ],
            sales_channels: [],
          },
        ],
      };
    });
    const calculatePrices = jest.fn(async (_selector, { context }) => [
      { calculated_amount: context.offer_id === "offer_a" ? 49.99 : 75 },
    ]);
    const records = await projectSearchProducts(
      scope(graph, undefined, calculatePrices),
      ["prod_a"],
    );
    expect(
      records.map(({ objectID, seller_scope, price }) => ({
        objectID,
        seller_scope,
        price,
      })),
    ).toEqual([
      { objectID: "prod_a:all", seller_scope: "all", price: 49.99 },
      { objectID: "prod_a:sel_a", seller_scope: "sel_a", price: 49.99 },
      { objectID: "prod_a:sel_b", seller_scope: "sel_b", price: 75 },
    ]);
    expect(calculatePrices).toHaveBeenCalledWith(
      { id: ["ps_a"] },
      {
        context: {
          region_id: "reg_us",
          currency_code: "usd",
          country_code: "us",
          quantity: 1,
          offer_id: "offer_a",
        },
      },
    );
    expect(records[0].category_ids).toEqual(["cat_public"]);
    expect(records[0].sales_channel_ids).toEqual(["__shared_catalog__"]);
    expect(records[0]).not.toHaveProperty("prices");
    expect(records[0]).not.toHaveProperty("seller");
    expect(graph).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: "offer",
        filters: { product_id: ["prod_a"], seller_id: ["sel_a", "sel_b"] },
      }),
    );
  });
  test("does not fall back to an unpriced product or a suspended seller", async () => {
    const graph = jest.fn(async ({ entity }: { entity: string }) => ({
      data:
        entity === "region"
          ? [{ id: "reg_us", currency_code: "usd" }]
          : entity === "seller"
            ? []
            : [{ id: "prod_a" }],
    }));
    expect(await projectSearchProducts(scope(graph), ["prod_a"])).toEqual([]);
  });
});

describe("multiple stores with correlated minimum prices", () => {
  const offers = [
    { product_id: "prod_shared", seller_id: "sel_a", amount: 10 },
    { product_id: "prod_shared", seller_id: "sel_b", amount: 100 },
    { product_id: "prod_tie", seller_id: "sel_b", amount: 30 },
    { product_id: "prod_tie", seller_id: "sel_a", amount: 30 },
    { product_id: "prod_other", seller_id: "sel_c", amount: 1 },
    { product_id: "prod_other", seller_id: "sel_b", amount: 50 },
  ].map((offer, index) => ({
    ...offer,
    id: `offer_${index}`,
    product_variant: { price_set: { id: "ps" } },
  }));
  const products = ["prod_shared", "prod_tie", "prod_other"].map((id) => ({
    id,
    title: id,
    created_at: new Date("2026-09-10T00:00:00Z"),
    categories: [],
    tags: [],
    sales_channels: [],
  }));
  const graph = jest.fn(async ({ entity }: { entity: string }) => ({
    data:
      entity === "region"
        ? [{ id: "reg_us", currency_code: "usd" }]
        : entity === "seller"
          ? ["sel_a", "sel_b", "sel_c"].map((id) => ({ id, name: id }))
          : entity === "offer"
            ? offers
            : entity === "product"
              ? products
              : [],
  }));
  let records: AlgoliaProduct[];
  beforeAll(async () => {
    records = await projectSearchProducts(
      scope(
        graph,
        undefined,
        jest.fn(async (_selector, { context }) => [
          {
            calculated_amount: offers.find(
              (offer) => offer.id === context.offer_id,
            )?.amount,
          },
        ]),
      ),
      products.map((product) => product.id),
    );
  });

  function matching(params: SearchParamsObject) {
    const matches = (record: AlgoliaProduct, filter: string): boolean => {
      const [attribute, value] = filter.split(":");
      const actual = record[attribute as keyof AlgoliaProduct];
      const negative = value.startsWith("-");
      const expected = negative ? value.slice(1) : value;
      const found = Array.isArray(actual)
        ? actual.includes(expected)
        : actual === expected;
      return negative ? !found : found;
    };
    return records.filter(
      (record) =>
        (params.facetFilters as Array<string | string[]>).every((filter) =>
          Array.isArray(filter)
            ? filter.some((item) => matches(record, item))
            : matches(record, filter),
        ) &&
        (params.numericFilters as string[]).every((filter) =>
          filter.startsWith("price>=")
            ? record.price >= Number(filter.slice(7))
            : record.price <= Number(filter.slice(7)),
        ),
    );
  }

  test("selects one minimum per product, resolves ties, and ignores cheaper unselected or invisible stores", () => {
    const request = { ...input(), seller_ids: ["sel_a", "sel_b"] };
    expect(
      matching(buildSearchParams(request, ["sel_a", "sel_b", "sel_c"])).map(
        ({ id, price }) => ({ id, price }),
      ),
    ).toEqual([
      { id: "prod_shared", price: 10 },
      { id: "prod_tie", price: 30 },
      { id: "prod_other", price: 50 },
    ]);
    expect(
      matching(
        buildSearchParams(
          { ...request, seller_ids: ["sel_a", "sel_b", "sel_closed"] },
          ["sel_b"],
        ),
      ).map(({ price }) => price),
    ).toEqual([100, 30, 50]);
    expect(
      matching(
        buildSearchParams({ ...request, min_price: 20, max_price: 60 }, [
          "sel_a",
          "sel_b",
          "sel_c",
        ]),
      ).map(({ id }) => id),
    ).toEqual(["prod_tie", "prod_other"]);
  });

  test.each<SearchSort>(["price_asc", "price_desc"])(
    "keeps unique global counts, pagination and selected minimum ordering for %s",
    async (sort) => {
    const search = jest.fn(async (params: SearchParamsObject) => {
        const matches = matching(params).sort((a, b) =>
          sort === "price_asc" ? a.price - b.price : b.price - a.price,
        );
        const page = params.page ?? 0;
        const size = params.hitsPerPage ?? 24;
        const sellerCounts: Record<string, number> = {};
        for (const record of matches)
          for (const id of record.seller_ids)
            sellerCounts[id] = (sellerCounts[id] ?? 0) + 1;
        return {
          hits: matches.slice(page * size, (page + 1) * size),
          nbHits: matches.length,
          nbPages: size ? Math.ceil(matches.length / size) : 0,
          page,
          hitsPerPage: size,
          facets: { seller_ids: sellerCounts },
        };
      });
      const response = await searchProducts(
        {
          ...input(),
          seller_ids: ["sel_a", "sel_b"],
          sort,
          hitsPerPage: 1,
          page: 0,
        },
        scope(graph, search),
      );
      expect(response.nbHits).toBe(3);
      expect(response.nbPages).toBe(3);
      expect(response.products.map(({ id }) => id)).toEqual([
        sort === "price_asc" ? "prod_shared" : "prod_other",
      ]);
      expect(response.facets.sellers).toContainEqual({
        id: "sel_c",
        label: "sel_c",
        count: 1,
      });
    },
  );
});

describe("search hydration security", () => {
  test.each([0, 1])(
    "keeps the full price range with %i filtered hits and preserves facet and visibility restrictions",
    async (nbHits) => {
      const graph = jest.fn(async ({ entity }: { entity: string }) => ({
        data:
          entity === "region"
            ? [{ id: "reg_us", currency_code: "usd" }]
            : entity === "seller"
              ? [{ id: "sel_open", name: "Public shop" }]
              : [],
      }));
      const search = jest
        .fn()
        .mockResolvedValueOnce({
          hits: [],
          nbHits,
          facets_stats: nbHits ? { price: { min: 50, max: 50 } } : {},
        })
        .mockResolvedValueOnce({
          hits: [],
          nbHits: 10,
          facets_stats: { price: { min: 10.99, max: 250.5 } },
        })
        .mockResolvedValueOnce({
          hits: [],
          facets: { seller_ids: { sel_open: 1 } },
        });
      const request = {
        ...input(),
        query: "chair",
        category_ids: ["cat_a"],
        seller_ids: ["sel_open"],
        min_price: 45,
        max_price: 55,
        page: 2,
      };
      const result = await searchProducts(request, scope(graph, search));

      expect(result.nbHits).toBe(nbHits);
      expect(result.price_range).toEqual({ min: 10.99, max: 250.5 });
      expect(search).toHaveBeenNthCalledWith(
        1,
        buildSearchParams(request, ["sel_open"]),
        request.sort,
      );
      expect(search).toHaveBeenNthCalledWith(
        2,
        {
          ...buildSearchParams(request, ["sel_open"]),
          numericFilters: [],
          facets: ["price"],
          page: 0,
          hitsPerPage: 0,
        },
        request.sort,
      );
    },
  );

  test("preserves shared Mercur products and rank but drops obsolete offers and foreign-channel products", async () => {
    const graph = jest.fn(async ({ entity }: { entity: string }) => {
      if (entity === "region")
        return { data: [{ id: "reg_us", currency_code: "usd" }] };
      if (entity === "seller")
        return { data: [{ id: "sel_open", name: "Public shop" }] };
      if (entity === "product_category")
        return { data: [{ id: "cat_a", name: "Furniture" }] };
      if (entity === "offer")
        return {
          data: [
            { product_id: "prod_a" },
            { product_id: "prod_b" },
            { product_id: "prod_foreign" },
          ],
        };
      return {
        data: [
          { id: "prod_a", sales_channels: [{ id: "sc_store" }] },
          { id: "prod_b", sales_channels: [] },
          { id: "prod_foreign", sales_channels: [{ id: "sc_private" }] },
          { id: "prod_without_offer", sales_channels: [{ id: "sc_store" }] },
        ],
      };
    });
    const search = jest.fn().mockResolvedValue({
      hits: [
        { id: "prod_b" },
        { id: "prod_foreign" },
        { id: "prod_without_offer" },
        { id: "prod_a" },
      ],
      nbHits: 4,
      page: 0,
      nbPages: 1,
      hitsPerPage: 24,
      facets: {
        category_ids: { cat_a: 4 },
        seller_ids: { sel_open: 4, sel_closed: 2 },
      },
      facets_stats: { price: { min: 49.99, max: 75 } },
    });
    const result = await searchProducts(input(), scope(graph, search));
    expect(result.products.map((product) => product.id)).toEqual([
      "prod_b",
      "prod_a",
    ]);
    expect(result.products[0]).not.toHaveProperty("sales_channels");
    expect(graph).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: "product",
        filters: {
          id: ["prod_b", "prod_foreign", "prod_without_offer", "prod_a"],
          status: "published",
        },
      }),
    );
    expect(graph).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: "seller",
        fields: ["id", "name"],
        filters: { id: ["sel_open"] },
      }),
    );
    expect(result.price_range).toEqual({ min: 49.99, max: 75 });
    expect(search).toHaveBeenCalledTimes(1);
  });
  test("never searches when the key has no authorized channel", async () => {
    const graph = jest.fn(async ({ entity }: { entity: string }) => ({
      data: entity === "region" ? [{ id: "reg_us" }] : [{ id: "sel_open" }],
    }));
    const search = jest.fn();
    expect(
      (
        await searchProducts(
          { ...input(), sales_channel_ids: [] },
          scope(graph, search),
        )
      ).nbHits,
    ).toBe(0);
    expect(search).not.toHaveBeenCalled();
  });
  test("a closed seller request cannot widen to all visible sellers", async () => {
    const graph = jest.fn(async ({ entity }: { entity: string }) => ({
      data: entity === "region" ? [{ id: "reg_us" }] : [{ id: "sel_open" }],
    }));
    const search = jest.fn();
    expect(
      (
        await searchProducts(
          { ...input(), seller_ids: ["sel_closed"] },
          scope(graph, search),
        )
      ).products,
    ).toEqual([]);
    expect(search).not.toHaveBeenCalled();
  });
});
