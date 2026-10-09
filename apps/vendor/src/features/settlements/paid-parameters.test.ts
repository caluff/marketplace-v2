import assert from "node:assert/strict";
import test from "node:test";
import {
  paidSettlementListHref,
  paidSettlementListInput,
} from "./paid-parameters";
import { financePeriodHref } from "../finance-reporting/periods";

test("paid orders preserve the earnings period across pagination", () => {
  const input = paidSettlementListInput({ period: "current_month", page: "3" });
  assert.deepEqual(input.query, {
    period: "current_month",
    mode: "test",
    currency_code: "usd",
    data_kind: "ordinary",
    limit: 10,
    offset: 20,
  });
  assert.equal(
    paidSettlementListHref(input, 4),
    "/seller/settlements/paid?period=current_month&page=4",
  );
});

test("malformed route filters fall back to a bounded ordinary TEST query", () => {
  for (const page of [
    "-1",
    "2.3",
    "Infinity",
    "9007199254740992",
    ["2", "3"],
  ]) {
    const input = paidSettlementListInput({
      page,
      period: ["today", "last_7_days"],
    });
    assert.equal(input.query.offset, 0);
    assert.equal(input.query.period, "last_30_days");
    assert.equal(input.query.data_kind, "ordinary");
  }
});

test("changing a period resets pagination and keeps the selected destination", () => {
  assert.equal(
    financePeriodHref("today", 1, "/seller/settlements/paid"),
    "/seller/settlements/paid?period=today&page=1",
  );
  assert.equal(financePeriodHref("today"), "/seller?period=today&page=1");
});
