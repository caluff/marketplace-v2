import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import Medusa from "@medusajs/js-sdk";
import type { SellerMemberDTO } from "@mercurjs/types";
import {
  beginStripeOnboarding,
  refreshStripeAccount,
  stripeOnboardingUrl,
} from "./operations";

function harness(
  options: {
    account?: boolean;
    count?: number;
    active?: boolean;
    rejectCreate?: boolean;
  } = {},
) {
  const { account = true, active = true, rejectCreate = false } = options;
  const count = options.count ?? (account ? 1 : 0);
  const sdk = new Medusa({
    baseUrl: "https://api.example.invalid",
    auth: { type: "jwt", jwtTokenStorageMethod: "nostore" },
  });
  const calls: {
    path: string;
    init?: Parameters<Medusa["client"]["fetch"]>[1];
  }[] = [];
  sdk.client.fetch = async <T>(
    path: Parameters<Medusa["client"]["fetch"]>[0],
    init?: Parameters<Medusa["client"]["fetch"]>[1],
  ): Promise<T> => {
    calls.push({ path: String(path), init });
    if (String(path).endsWith("onboarding"))
      return {
        onboarding: {
          data: { url: "https://connect.stripe.com/setup/c/test" },
        },
      } as T;
    if (init?.method === "POST") {
      if (rejectCreate) throw new Error("Uncertain network failure");
      return { payout_account: { id: "payacc_own", status: "pending" } } as T;
    }
    return {
      payout_accounts: account ? [{ id: "payacc_own", status: "pending" }] : [],
      count,
    } as T;
  };
  const membership = {
    seller: { id: "seller_own", status: "open" },
    member: { id: "member_own", is_active: active },
  } as SellerMemberDTO;
  return {
    calls,
    run: () => beginStripeOnboarding(async () => ({ sdk, membership })),
    refresh: () => refreshStripeAccount(async () => ({ sdk, membership })),
  };
}

describe("native Stripe onboarding", () => {
  it("resumes an existing native account and leaves redirect ownership to the API", async () => {
    const h = harness();
    assert.equal(await h.run(), "https://connect.stripe.com/setup/c/test");
    assert.equal(h.calls.length, 2);
    assert.deepEqual(h.calls[1].init?.body, {});
    assert.match(h.calls[1].path, /payacc_own\/onboarding$/);
    for (const call of h.calls) {
      assert.deepEqual(call.init?.headers, { "x-seller-id": "seller_own" });
      assert.equal(call.init?.cache, "no-store");
    }
  });
  it("creates only when the native list is empty, using the US country contract", async () => {
    const h = harness({ account: false });
    await h.run();
    assert.equal(h.calls.length, 3);
    assert.deepEqual(h.calls[1].init?.body, { data: { country: "US" } });
  });
  it("does not automatically retry uncertain account creation", async () => {
    const h = harness({ account: false, rejectCreate: true });
    await assert.rejects(h.run(), /Uncertain network failure/);
    assert.equal(h.calls.length, 2);
  });
  it("refuses conflicting native accounts before writing", async () => {
    const h = harness({ count: 2 });
    await assert.rejects(h.run(), /más de una/);
    assert.equal(h.calls.length, 1);
  });
  it("rejects inactive memberships before any backend call", async () => {
    const h = harness({ active: false });
    await assert.rejects(h.run(), /inactiva/);
    assert.equal(h.calls.length, 0);
  });
  for (const url of [
    "http://connect.stripe.com/setup",
    "https://connect.stripe.com.evil.test/setup",
    "javascript:alert(1)",
    "https://user:password@connect.stripe.com/setup",
    "https://example.test/setup",
    null,
  ]) {
    it(`rejects untrusted onboarding redirect ${String(url)}`, () => {
      assert.throws(() => stripeOnboardingUrl(url));
    });
  }
});

describe("Stripe refresh SDK request", () => {
  it("uses the authenticated seller scope with an empty body and no cache", async () => {
    const h = harness();
    await h.refresh();
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].path, "/vendor/stripe-account-refresh");
    assert.equal(h.calls[0].init?.method, "POST");
    assert.deepEqual(h.calls[0].init?.body, {});
    assert.deepEqual(h.calls[0].init?.headers, { "x-seller-id": "seller_own" });
    assert.equal(h.calls[0].init?.cache, "no-store");
  });
  it("refuses inactive memberships before sending refresh", async () => {
    const h = harness({ active: false });
    await assert.rejects(h.refresh(), /inactiva/);
    assert.equal(h.calls.length, 0);
  });
});

// Exercise the component's event/effect callbacks without a browser or server action runtime.
function refreshHarness(
  resultStatus: "success" | "warning" | "error",
  returned = true,
) {
  const effects: (() => void)[] = [];
  const requests: Promise<unknown>[] = [];
  const notifications: unknown[] = [];
  let requestCount = 0;
  let refreshCount = 0;
  let href = `https://vendor.example.test/seller/settings/payments?keep=1${returned ? "&returned=1" : ""}`;
  let dispatch!: () => Promise<unknown>;
  const exports: {
    StripeAccountRefresh?: (props: { returned: boolean }) => unknown;
  } = {};
  const nativeRequire = createRequire(import.meta.url);
  const source = ts.transpileModule(
    readFileSync(new URL("./account-refresh.tsx", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  runInNewContext(source, {
    exports,
    URL,
    FormData,
    window: {
      location: {
        get href() {
          return href;
        },
      },
      history: {
        replaceState: (_state: unknown, _unused: string, url: string) => {
          href = new URL(url, href).href;
        },
      },
    },
    require: (id: string) => {
      if (id === "react")
        return {
          useRef: () => ({ current: false }),
          useEffect: (effect: () => void) => effects.push(effect),
          startTransition: (callback: () => void) => callback(),
          useActionState: (callback: () => Promise<unknown>) => {
            dispatch = () => {
              const request = callback();
              requests.push(request);
              return request;
            };
            return [{ status: "idle" }, dispatch, false];
          },
        };
      if (id === "next/navigation")
        return { useRouter: () => ({ refresh: () => refreshCount++ }) };
      if (id === "./actions")
        return {
          refreshStripeAccountAction: async () => {
            requestCount++;
            assert.equal(new URL(href).searchParams.has("returned"), false);
            return { status: resultStatus, message: "Verified result" };
          },
        };
      if (id === "@/lib/feedback")
        return {
          notifyFeedback: (feedback: unknown) => notifications.push(feedback),
        };
      if (id === "@/components/ui/button") return { Button: "button" };
      return nativeRequire(id);
    },
  });
  assert.ok(exports.StripeAccountRefresh);
  exports.StripeAccountRefresh({ returned });
  return {
    effects,
    requests,
    notifications,
    manual: () => dispatch(),
    get requestCount() {
      return requestCount;
    },
    get refreshCount() {
      return refreshCount;
    },
    get href() {
      return href;
    },
  };
}

describe("Stripe return refresh behavior", () => {
  for (const status of ["success", "warning", "error"] as const) {
    it(`consumes the return once and reports ${status} without retrying`, async () => {
      const h = refreshHarness(status);
      h.effects.forEach((effect) => {
        effect();
        effect();
      });
      await Promise.all(h.requests);
      assert.equal(h.requestCount, 1);
      assert.equal(new URL(h.href).searchParams.get("keep"), "1");
      assert.equal(h.notifications.length, 1);
      assert.equal(h.refreshCount, 0, "the action already returns the revalidated page; do not fetch it twice");
      h.effects.forEach((effect) => effect());
      assert.equal(h.requestCount, 1);
      await h.manual();
      assert.equal(h.requestCount, 2);
    });
  }
  it("does not refresh on ordinary visits until the manual action", async () => {
    const h = refreshHarness("success", false);
    h.effects.forEach((effect) => effect());
    assert.equal(h.requestCount, 0);
    await h.manual();
    assert.equal(h.requestCount, 1);
  });
});
