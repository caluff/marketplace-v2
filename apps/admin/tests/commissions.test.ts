import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Medusa, { FetchError } from "@medusajs/js-sdk";
import type { CommissionRateDTO } from "@mercurjs/types";
import {
  canEditCommission,
  commissionBaseDescription,
  commissionErrorMessage,
  parseCommissionPercentage,
} from "../src/features/commissions/helpers";
import {
  readDefaultCommission,
  saveDefaultCommission,
} from "../src/features/commissions/operations";

const rate: CommissionRateDTO = {
  id: "comrate_default",
  name: "Default",
  code: "default",
  type: "percentage" as CommissionRateDTO["type"],
  value: 8,
  currency_code: null,
  include_tax: false,
  include_shipping: false,
  is_default: true,
  is_enabled: true,
  rules: [],
  values: [],
  created_at: new Date(0),
  updated_at: new Date(0),
  deleted_at: null,
};

function form(value = "12.5") {
  const data = new FormData();
  data.set("percentage", value);
  data.set("expected_value", "8");
  data.set("rate_id", rate.id);
  return data;
}

function fakeClient(rates = [rate], count = rates.length) {
  const calls: { url: string; options: unknown }[] = [];
  const client: Pick<Medusa["client"], "fetch"> = {
    async fetch<T>(
      url: Parameters<Medusa["client"]["fetch"]>[0],
      options?: Parameters<Medusa["client"]["fetch"]>[1],
    ): Promise<T> {
      calls.push({ url: String(url), options });
      return (
        options?.method === "POST"
          ? { commission_rate: rate }
          : { commission_rates: rates, count, limit: 2, offset: 0 }
      ) as T;
    },
  };
  return { client, calls };
}

test("percentages reject forged, non-finite, blank, and out-of-range values", async () => {
  for (const value of [
    null,
    undefined,
    8,
    NaN,
    Infinity,
    {},
    [],
    new Blob(),
    "",
    " ",
    "NaN",
    "Infinity",
    "-1",
    "100.001",
    "1e2",
    "0x10",
    "8%",
    "8,5",
    "8oops",
  ]) {
    assert.equal(parseCommissionPercentage(value), null, String(value));
  }
  for (const value of ["0", "100", "8", "12.345", " 8.5 "])
    assert.equal(parseCommissionPercentage(value), Number(value));
  for (const value of ["", "NaN", "Infinity", "-1", "101", "1e2"]) {
    const { client, calls } = fakeClient();
    assert.equal(
      (await saveDefaultCommission(client, form(value))).status,
      "error",
    );
    assert.equal(calls.length, 0);
  }
  const { client, calls } = fakeClient();
  const duplicate = form();
  duplicate.append("percentage", "90");
  assert.equal(
    (await saveDefaultCommission(client, duplicate)).status,
    "error",
  );
  const file = form();
  file.set("percentage", new Blob(["8"]));
  assert.equal((await saveDefaultCommission(client, file)).status, "error");
  assert.equal(calls.length, 0);
});

test("only updates the existing default scalar, ignoring forged entity properties", async () => {
  const { client, calls } = fakeClient();
  const data = form();
  for (const key of [
    "include_tax",
    "include_shipping",
    "is_enabled",
    "is_default",
    "rules",
    "values",
    "type",
    "name",
    "code",
    "currency_code",
    "id",
  ])
    data.set(key, "forged");
  assert.equal((await saveDefaultCommission(client, data)).status, "success");
  assert.deepEqual(calls, [
    {
      url: "/admin/commission-rates",
      options: { query: { is_default: true, limit: 2 }, cache: "no-store" },
    },
    {
      url: "/admin/commission-rates/comrate_default",
      options: { method: "POST", body: { value: 12.5 } },
    },
  ]);
});

test("empty, ambiguous, disabled, scoped, or replaced defaults cannot be overwritten", async () => {
  assert.equal(await readDefaultCommission(fakeClient([]).client), null);
  await assert.rejects(readDefaultCommission(fakeClient([rate, rate]).client));
  await assert.rejects(
    readDefaultCommission(fakeClient([{ ...rate, is_default: false }]).client),
  );
  for (const change of [
    { is_enabled: false },
    { type: "fixed" },
    { currency_code: "usd" },
    { rules: [{ id: "rule_other" }] },
    { rules: undefined },
    { value: 9 },
    { id: "comrate_replaced" },
  ]) {
    const { client, calls } = fakeClient([
      { ...rate, ...change } as CommissionRateDTO,
    ]);
    assert.equal((await saveDefaultCommission(client, form())).status, "error");
    assert.equal(calls.length, 1);
  }
  const { client, calls } = fakeClient();
  const data = form();
  data.set("rate_id", "comrate_other");
  assert.equal((await saveDefaultCommission(client, data)).status, "error");
  assert.equal(calls.length, 1);
});

test("base wording follows backend flags and edit does not require rewriting flags", () => {
  assert.equal(canEditCommission(rate), true);
  assert.match(
    commissionBaseDescription(rate),
    /antes de descuentos, sin impuestos/,
  );
  assert.match(commissionBaseDescription(rate), /envío no genera comisión/);
  assert.match(
    commissionBaseDescription({ include_tax: true, include_shipping: true }),
    /con impuestos.*envío también genera comisión/,
  );
  assert.equal(
    canEditCommission({ ...rate, include_tax: true, include_shipping: true }),
    true,
  );
});

test("actual SDK serializes the native contract and preserves authenticated headers", async (t) => {
  const requests: { url: URL; init: RequestInit | undefined }[] = [];
  t.mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: new URL(String(input)), init });
      return Response.json(
        init?.method === "POST"
          ? { commission_rate: { ...rate, value: 12.5 } }
          : { commission_rates: [rate], count: 1, limit: 2, offset: 0 },
      );
    },
  );
  const sdk = new Medusa({
    baseUrl: "https://backend.invalid",
    auth: { type: "jwt", jwtTokenStorageMethod: "nostore" },
    globalHeaders: { Authorization: "Bearer test-only" },
  });
  assert.equal(
    (await saveDefaultCommission(sdk.client, form())).status,
    "success",
  );
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url.searchParams.get("is_default"), "true");
  assert.equal(requests[0].init?.cache, "no-store");
  assert.equal(
    requests[1].url.pathname,
    "/admin/commission-rates/comrate_default",
  );
  assert.equal(
    new Headers(requests[1].init?.headers).get("authorization"),
    "Bearer test-only",
  );
  assert.deepEqual(JSON.parse(String(requests[1].init?.body)), { value: 12.5 });
});

test("backend denial and outage propagate without reporting a successful save", async () => {
  for (const status of [401, 403, 404, 500]) {
    const denied: Pick<Medusa["client"], "fetch"> = {
      async fetch() {
        throw new FetchError("private backend details", "Error", status);
      },
    };
    await assert.rejects(
      saveDefaultCommission(denied, form()),
      (error: unknown) =>
        error instanceof FetchError && error.status === status,
    );
    assert.doesNotMatch(
      commissionErrorMessage(status),
      /private backend details/,
    );
  }
  assert.match(commissionErrorMessage(401), /sesión/);
  assert.match(commissionErrorMessage(403), /permisos/);
  assert.match(commissionErrorMessage(500), /comprueba la tasa vigente/);
});

test("POST denial after an allowed read never becomes a success or a retry", async () => {
  const readable = fakeClient();
  let writes = 0;
  const client: Pick<Medusa["client"], "fetch"> = {
    async fetch<T>(
      url: Parameters<Medusa["client"]["fetch"]>[0],
      options?: Parameters<Medusa["client"]["fetch"]>[1],
    ): Promise<T> {
      if (options?.method === "POST") {
        writes++;
        throw new FetchError("Denied", "Forbidden", 403);
      }
      return readable.client.fetch<T>(url, options);
    },
  };
  await assert.rejects(
    saveDefaultCommission(client, form()),
    (error: unknown) => error instanceof FetchError && error.status === 403,
  );
  assert.equal(writes, 1);
});

test("zero and one hundred are accepted without changing the native units", async () => {
  for (const value of ["0", "100"]) {
    const { client, calls } = fakeClient();
    assert.equal(
      (await saveDefaultCommission(client, form(value))).status,
      "success",
    );
    assert.deepEqual(calls[1].options, {
      method: "POST",
      body: { value: Number(value) },
    });
  }
});

test("server action authenticates and local Suspense keeps the static heading independent", async () => {
  const read = (path: string) =>
    readFile(new URL(`../src/${path}`, import.meta.url), "utf8");
  const action = await read("features/commissions/actions.ts");
  assert.match(
    action,
    /await requireAdminSdk\(\)[\s\S]*await saveDefaultCommission/,
  );
  assert.match(action, /unstable_rethrow\(error\)/);
  assert.match(action, /commissionErrorMessage/);
  const page = await read("app/dashboard/commissions/page.tsx");
  assert.doesNotMatch(page, /await /);
  assert.match(page, /<h1[\s\S]*<Suspense/);
  const panel = await read(
    "features/commissions/components/commission-panel.tsx",
  );
  assert.match(panel, /FeedbackToast status="error"/);
  assert.match(panel, /cambios posteriores en un pedido/);
  assert.match(panel, /Sin comisión global configurada/);
});
