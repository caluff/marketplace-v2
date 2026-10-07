import assert from "node:assert/strict";
import { test } from "node:test";
import { savePresentationAndStock } from "./save-presentation-stock";

const inventory = {
  id: "iitem_owner",
  locationId: "sloc_owner",
  expected: 10,
  reserved: 3,
};

function form(quantity = "12") {
  const data = new FormData();
  data.set("id", "prod_owner");
  data.set("change_stock", "true");
  data.set("stocked_quantity", quantity);
  return data;
}

test("variant stock updates use their inventory identity and expected saved quantity", async () => {
  const result = await savePresentationAndStock(
    form(),
    {
      presentation: async () => ({
        status: "success",
        message: "No hay cambios para guardar.",
      }),
      stock: async (data) => {
        assert.deepEqual(Object.fromEntries(data), {
          id: "iitem_owner",
          location_id: "sloc_owner",
          expected_quantity: "10",
          stocked_quantity: "12",
        });
        return { status: "success", message: "Existencias actualizadas." };
      },
    },
    inventory,
  );
  assert.equal(result.savedStock, true);
  assert.equal(result.message, "Existencias actualizadas.");
});

test("invalid or reserved stock cannot commit accompanying price changes", async () => {
  for (const quantity of ["2", "-1", "4.5", "NaN", ""]) {
    let mutated = false;
    const result = await savePresentationAndStock(
      form(quantity),
      {
        presentation: async () => {
          mutated = true;
          return { status: "success" };
        },
        stock: async () => {
          mutated = true;
          return { status: "success" };
        },
      },
      inventory,
    );
    assert.equal(result.status, "error");
    assert.equal(mutated, false);
  }
});

test("missing verified inventory never invents an editable quantity", async () => {
  let mutated = false;
  const result = await savePresentationAndStock(form(), {
    presentation: async () => {
      mutated = true;
      return { status: "success" };
    },
    stock: async () => {
      mutated = true;
      return { status: "success" };
    },
  });
  assert.equal(result.status, "error");
  assert.equal(mutated, false);
});

test("failed price changes do not update stock and keep a previously saved variant flag", async () => {
  let updatedStock = false;
  const result = await savePresentationAndStock(
    form(),
    {
      presentation: async () => ({
        status: "error",
        savedVariant: true,
        message: "El precio cambió.",
      }),
      stock: async () => {
        updatedStock = true;
        return { status: "success" };
      },
    },
    inventory,
  );
  assert.equal(result.savedVariant, true);
  assert.equal(updatedStock, false);
});

test("stock concurrency failures preserve the already saved price for retry", async () => {
  const result = await savePresentationAndStock(
    form(),
    {
      presentation: async () => ({
        status: "success",
        savedOffer: true,
        message: "Precio guardado.",
      }),
      stock: async () => ({
        status: "error",
        message: "Las existencias cambiaron. Recarga.",
      }),
    },
    inventory,
  );
  assert.equal(result.status, "error");
  assert.equal(result.savedOffer, true);
  assert.equal(result.savedStock, false);
  assert.match(
    result.message ?? "",
    /Precio guardado.*Las existencias no se guardaron/,
  );
});

test("transport failures after saving a price preserve partial progress", async () => {
  const result = await savePresentationAndStock(
    form(),
    {
      presentation: async () => ({
        status: "success",
        savedOffer: true,
        message: "Precio guardado.",
      }),
      stock: async () => {
        throw new Error("Sin conexión.");
      },
    },
    inventory,
  );
  assert.equal(result.status, "error");
  assert.equal(result.savedOffer, true);
  assert.match(result.message ?? "", /Precio guardado.*Sin conexión/);
});

test("unchanged stock leaves inventory untouched", async () => {
  let updatedStock = false;
  const data = form();
  data.set("change_stock", "false");
  const result = await savePresentationAndStock(
    data,
    {
      presentation: async () => ({ status: "success", savedOffer: true }),
      stock: async () => {
        updatedStock = true;
        return { status: "success" };
      },
    },
    inventory,
  );
  assert.equal(result.savedOffer, true);
  assert.equal(result.savedStock, undefined);
  assert.equal(updatedStock, false);
});
