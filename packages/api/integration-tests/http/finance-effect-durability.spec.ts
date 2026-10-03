/**
 * Opt-in PG/native workflow regression, with ALL Stripe IO explicitly simulated.
 * Requires the isolated TLS PostgreSQL/Redis importer and exclusive Redis DB15.
 * FINANCE_EFFECT_DURABILITY_TESTS=disposable-local. Never run beside financial QA.
 * Checkout is bypassed by native module/link fixtures. No real provider evidence
 * or OS process crash is claimed: injected boundary failures leave real PG rows.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";
import type { IAuthModuleService } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  MathBN,
  Modules,
} from "@medusajs/framework/utils";
import { z } from "@medusajs/framework/zod";
import { COMMERCE_AUTOMATION_MODULE } from "../../src/modules/commerce-automation";
import type CommerceAutomationService from "../../src/modules/commerce-automation/service";
import { readFinanceExecutionWriters } from "../../src/modules/commerce-automation/service";
import {
  financeAmount,
  financeOperationSchema,
} from "../../src/lib/order-finance/policy";
import { readOrderFinance } from "../../src/lib/order-finance/read";
import { inspectFinanceRecovery } from "../../src/lib/order-finance/recovery-plan";
import { providerFinanceFactSchema } from "../../src/lib/order-finance/provider-facts";
import { operateOrderFinanceWorkflow } from "../../src/workflows/operate-order-finance";
import { recoverOrderFinanceWorkflow } from "../../src/workflows/recover-order-finance";
import {
  inspectOrderFinanceProviderFacts,
  refreshOrderFinanceProviderFactsWorkflow,
} from "../../src/workflows/refresh-order-finance-provider-facts";
import { createFinanceDurabilityFixture } from "./fixtures/finance-durability-fixture";
import { installFinanceDurabilityStripe } from "./fixtures/finance-durability-stripe";
import { assertNativeFinanceRedis } from "../helpers/native-finance-redis-guard";
import { useNativeEsmPayoutProvider } from "../helpers/native-esm-provider-loader";
import { configureNativeFinanceDatabaseTls } from "../helpers/native-finance-database-tls";

const enabled =
  process.env.FINANCE_EFFECT_DURABILITY_TESTS === "disposable-local";

if (!enabled) {
  describe.skip("Finance effect durability (requires exclusive disposable-local infrastructure)", () => {
    it("requires explicit opt-in; see file header", () => {});
  });
} else {
  // Validate before registering the runner: its failure cleanup also touches DB.
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.DB_HOST !== "localhost" ||
    process.env.DB_PORT !== "55432" ||
    process.env.DB_USERNAME !== "closure_test" ||
    !process.env.DB_PASSWORD ||
    process.env.PGSSLMODE !== "require" ||
    !process.env.NODE_EXTRA_CA_CERTS ||
    !existsSync(process.env.NODE_EXTRA_CA_CERTS) ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
    process.env.DB_TEMP_NAME ||
    process.env.MEDUSA_DB_SCHEMA
  )
    throw new Error(
      "Import the isolated TLS closure environment without database overrides.",
    );
  const redis = new URL(process.env.REDIS_URL || "invalid:");
  if (
    redis.protocol !== "rediss:" ||
    redis.hostname !== "localhost" ||
    redis.port !== "56379" ||
    redis.pathname !== "/15" ||
    !redis.username ||
    !redis.password ||
    redis.search ||
    redis.hash
  )
    throw new Error(
      "Reserve the isolated TLS Redis DB15 exclusively before running this suite.",
    );
  assertNativeFinanceRedis(process.env);
  const dbName = `closure_finance_durability_${randomUUID().replaceAll("-", "")}`;
  process.env.DATABASE_URL = `postgres://${encodeURIComponent(process.env.DB_USERNAME)}:${encodeURIComponent(process.env.DB_PASSWORD)}@localhost:55432/${dbName}`;
  // These deliberately invalid credentials can only reach the installed simulator.
  process.env.STRIPE_API_KEY = "sk_test_durabilityfixture";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_durabilityfixture";
  process.env.STRIPE_PAYOUT_WEBHOOK_SECRET = "whsec_durabilityfixture";
  process.env.STRIPE_AUTOMATIC_JOBS_ENABLED = "false";
  process.env.FINANCE_CHECKOUT_DATA_KIND = "qa_fixture";
  process.env.AUTH_EMAIL_ENABLED = "false";
  process.env.MEDUSA_WORKER_MODE = "shared";
  jest.setTimeout(120_000);
  let stripe = installFinanceDurabilityStripe();

  medusaIntegrationTestRunner({
    inApp: true,
    dbName,
    hooks: {
      beforeServerStart: async (container) => {
        const config = container.resolve(
          ContainerRegistrationKeys.CONFIG_MODULE,
        );
        assertNativeFinanceRedis(process.env, config);
        const target = new URL(config.projectConfig.databaseUrl!);
        if (
          target.hostname !== "localhost" ||
          target.port !== "55432" ||
          target.pathname !== `/${dbName}`
        )
          throw new Error(
            "Application and runner must use the same disposable database.",
          );
        for (const module of Object.values(config.modules ?? {})) {
          if (!module || typeof module !== "object") continue;
          const providers =
            "options" in module ? module.options?.providers : undefined;
          if (
            [module, ...(Array.isArray(providers) ? providers : [])].some(
              (adapter: { resolve?: unknown }) =>
                typeof adapter.resolve === "string" &&
                /resend|algolia|file-s3|google/i.test(adapter.resolve),
            )
          )
            throw new Error(
              "Disable all external adapters except the transport-simulated Stripe fixture.",
            );
        }
        await useNativeEsmPayoutProvider(config);
        configureNativeFinanceDatabaseTls(config, dbName);
      },
    },
    testSuite: ({ api, getContainer, dbConnection }) => {
      type Fixture = Awaited<ReturnType<typeof createFinanceDurabilityFixture>>;
      const journal = () =>
        getContainer().resolve<CommerceAutomationService>(
          COMMERCE_AUTOMATION_MODULE,
        );
      const read = (fixture: Fixture, orderId = fixture.orderId) =>
        readOrderFinance(getContainer(), orderId, {
          actor_id: fixture.actorId,
        });
      const input = (fixture: Fixture) => ({
        action: "refund" as const,
        amount: 20,
        confirm: true as const,
        note: "Durability regression with simulated Stripe IO",
        request_id: randomUUID(),
        order_id: fixture.orderId,
        actor_id: fixture.actorId,
      });
      type Input = ReturnType<typeof input>;
      const operationId = (request: Input) =>
        `refund:${request.order_id}:${request.request_id}`;
      const operate = (request: Input) =>
        operateOrderFinanceWorkflow(getContainer()).run({ input: request });
      const recoveryInput = (request: Input) => ({
        order_id: request.order_id,
        actor_id: request.actor_id,
        operation_id: operationId(request),
        reason: "Recover verified simulated effect from real PG journal",
      });
      async function persistedOperation(request: Input) {
        // A separate SQL read verifies durable state instead of retaining a JS DTO.
        const result = await dbConnection.raw(
          "select id, state, token, result from commerce_operation where id = ? and deleted_at is null",
          [operationId(request)],
        );
        return z
          .object({
            id: z.string(),
            state: z.string(),
            token: z.string(),
            result: financeOperationSchema,
          })
          .parse(result.rows[0]);
      }
      async function fixture(withPayout = false) {
        const value = await createFinanceDurabilityFixture(getContainer(), {
          withPayout,
        });
        if (withPayout) stripe.seedTransfer(value.orderId, value.sellerId);
        const current = await read(value);
        expect(current.originalProblem).toBeNull();
        expect(current.view.finance).toMatchObject({
          captured_total: 70,
          refunded_total: 0,
          refund: { allowed: true },
        });
        expect(
          (await read(value, value.siblingOrderId)).view.finance,
        ).toMatchObject({ captured_total: 30, refunded_total: 0 });
        return value;
      }
      async function recover(request: Input) {
        const inspection = await inspectFinanceRecovery(
          getContainer(),
          recoveryInput(request),
        );
        const result = await recoverOrderFinanceWorkflow(getContainer()).run({
          input: {
            ...recoveryInput(request),
            plan_hash: inspection.plan_hash,
            release_stopped_writer: false,
          },
        });
        expect(result.result).toMatchObject({
          state: "complete",
          fence_released: true,
        });
        return inspection;
      }
      async function verifyCompleted(
        value: Fixture,
        request: Input,
        withPayout = false,
      ) {
        const persisted = await persistedOperation(request);
        expect(persisted.state).toBe("complete");
        expect(persisted.result.refund_ids).toHaveLength(1);
        expect(persisted.result.provider_refund_id).toBe(stripe.refunds[0].id);
        const current = await read(value);
        expect(current.state?.active_token).toBeNull();
        expect(current.state?.review_required).toBe(false);
        expect(current.view.finance).toMatchObject({
          captured_total: 70,
          refunded_total: 20,
          refundable_total: 50,
        });
        const target = current.group.orders.find(
          (row) => row.id === value.orderId,
        )!;
        const payment = target.cart.payment_collection.payments[0];
        expect(payment.refunds).toHaveLength(1);
        expect(payment.refunds[0]).toMatchObject({
          id: persisted.result.refund_ids[0],
          amount: 20,
          metadata: {
            finance_operation_id: operationId(request),
            order_id: value.orderId,
          },
        });
        expect(
          target.transactions
            .filter((row) => row.reference === "refund")
            .map((row) => {
              const exactMinor = MathBN.mult(row.amount, 100);
              const amountMinor = exactMinor.toNumber();
              expect(Number.isSafeInteger(amountMinor)).toBe(true);
              expect(MathBN.eq(exactMinor, amountMinor)).toBe(true);
              return {
                amount_minor: amountMinor,
                reference_id: row.reference_id,
              };
            }),
        ).toEqual([
          { amount_minor: -2000, reference_id: payment.refunds[0].id },
        ]);
        expect(
          target.credit_lines
            ?.filter((row) => row.reference === "refund")
            .map((row) => ({
              amount: financeAmount(row.amount),
              reference_id: row.reference_id,
            })),
        ).toEqual([{ amount: 20, reference_id: payment.refunds[0].id }]);
        expect(stripe.state.refundCreates).toBe(1);
        expect(stripe.state.reversalCreates).toBe(withPayout ? 1 : 0);
        expect(persisted.result.settlement).toMatchObject({
          seller_entitlement_reduced: 18.4,
          commission_returned: 1.6,
        });
        if (withPayout)
          expect(persisted.result.settlement).toMatchObject({
            reversal_id: stripe.reversals[0].id,
            seller_reversed: 18.4,
          });
        const sibling = await read(value, value.siblingOrderId);
        expect(sibling.view.finance).toMatchObject({
          captured_total: 30,
          refunded_total: 0,
          refundable_total: 30,
        });
        expect(
          sibling.group.orders
            .find((row) => row.id === value.siblingOrderId)!
            .transactions.filter((row) => row.reference === "refund"),
        ).toHaveLength(0);
        // Same request after recovery is a journal replay, with no provider POST.
        const posts = stripe.requests.filter(
          (row) => row.method === "POST",
        ).length;
        await operate(request);
        expect(
          stripe.requests.filter((row) => row.method === "POST"),
        ).toHaveLength(posts);
        expect(await persistedOperation(request)).toEqual(persisted);
      }
      function failJournalAfterEffect(kind: "refund" | "reversal") {
        const service = journal();
        const shouldFail = () =>
          kind === "refund"
            ? stripe.state.refundCreates > 0
            : stripe.state.reversalCreates > 0;
        const update = service.updateCommerceOperations.bind(service);
        const finish = service.finishOperation.bind(service);
        const updateSpy = jest
          .spyOn(service, "updateCommerceOperations")
          .mockImplementation(async (...args) => {
            if (shouldFail())
              throw new Error(
                "Injected unavailable journal after provider effect",
              );
            return update(...args);
          });
        const finishSpy = jest
          .spyOn(service, "finishOperation")
          .mockImplementation(async (...args) => {
            if (shouldFail())
              throw new Error(
                "Injected unavailable journal after provider effect",
              );
            return finish(...args);
          });
        return () => {
          updateSpy.mockRestore();
          finishSpy.mockRestore();
        };
      }

      beforeEach(async () => {
        stripe.restore();
        stripe = installFinanceDurabilityStripe();
        const result = await dbConnection.raw(
          "select ssl from pg_stat_ssl where pid = pg_backend_pid()",
        );
        expect(result.rows).toEqual([{ ssl: true }]);
      });
      afterEach(() => {
        // No unexpected endpoint may be swallowed by a provider-fact read.
        expect(stripe.rejected).toEqual([]);
      });
      afterAll(() => stripe.restore());

      it("inspects without IO and refreshes persisted provider facts twice without changing economic effects", async () => {
        const value = await fixture();
        const before = await read(value);
        const request = {
          order_id: value.orderId,
          group_id: value.groupId,
          cart_id: value.cartId,
          actor_id: value.actorId,
          reason: "Refresh captured fixture observations without money writes",
        };
        const persistedFacts = async () => {
          const result = await dbConnection.raw(
            "select id, fact from finance_provider_fact where group_id = ? and deleted_at is null order by id",
            [value.groupId],
          );
          return z
            .array(
              z.object({ id: z.string(), fact: providerFinanceFactSchema }),
            )
            .parse(result.rows);
        };
        const audit = async () => {
          const result = await dbConnection.raw(
            "select id, state, actor_id, reason, plan, final_result, finished_at from finance_recovery_attempt where group_id = ? and deleted_at is null order by id",
            [value.groupId],
          );
          return result.rows;
        };
        const operations = async () => {
          const result = await dbConnection.raw(
            "select id, state, token, result from commerce_operation where group_id = ? and deleted_at is null order by id",
            [value.groupId],
          );
          return result.rows;
        };
        expect(before.operations).toEqual([]);
        expect(await operations()).toEqual([]);
        expect(await persistedFacts()).toEqual([]);
        expect(await audit()).toEqual([]);
        const requestStart = stripe.requests.length;
        const inspection = await inspectOrderFinanceProviderFacts(
          getContainer(),
          request,
        );
        expect(inspection).toMatchObject({
          executed: false,
          provider_money_writes: false,
        });
        expect(inspection.sources.facts).toEqual([]);
        expect(stripe.requests).toHaveLength(requestStart);
        expect(await persistedFacts()).toEqual([]);
        expect(await audit()).toEqual([]);
        expect((await read(value)).state).toEqual(before.state);

        const providerPosts = stripe.requests.filter(
          (row) => row.method === "POST",
        ).length;
        const factIds: string[][] = [];
        const attemptIds: string[] = [];
        for (const run of [1, 2]) {
          const { result } = await refreshOrderFinanceProviderFactsWorkflow(
            getContainer(),
          ).run({ input: request });
          expect(result).toMatchObject({
            executed: true,
            provider_money_writes: false,
          });
          attemptIds.push(result.attempt_id);
          expect(new Set(attemptIds).size).toBe(run);
          expect(result.sources.facts).toHaveLength(1);
          expect(result.sources.facts[0]).toMatchObject({
            kind: "capture",
            group_id: value.groupId,
            provider_id: value.chargeId,
            payment_intent_id: value.paymentIntentId,
            amount_minor: 10_000,
            balance_transaction_id: null,
          });
          expect(result.sources.costs).toEqual([]);
          expect(result.sources.coverage.complete).toBe(false);
          expect(result.sources.coverage.issues).toContainEqual({
            resource: result.sources.facts[0].key,
            reason: "cost_reference_missing",
          });
          const stored = await persistedFacts();
          expect(stored).toEqual(
            result.sources.facts.map((fact) => ({ id: fact.key, fact })),
          );
          factIds.push(stored.map((fact) => fact.id));
          expect(factIds[run - 1]).toEqual(factIds[0]);
          const attempts = await audit();
          expect(attempts).toHaveLength(run);
          expect(attempts).toEqual(
            expect.arrayContaining(
              attemptIds.map((id) =>
                expect.objectContaining({
                  id,
                  state: "complete",
                  actor_id: value.actorId,
                  reason: request.reason,
                  finished_at: expect.any(Date),
                  plan: expect.objectContaining({
                    action: "refresh_provider_observation",
                    provider_money_writes: false,
                  }),
                  final_result: expect.objectContaining({
                    executed: true,
                    provider_money_writes: false,
                  }),
                }),
              ),
            ),
          );
          expect(await operations()).toEqual([]);
          const after = await read(value);
          expect(after.originals).toEqual(before.originals);
          expect(after.group).toEqual(before.group);
          expect(after.operations).toEqual(before.operations);
          const fence = await dbConnection.raw(
            "select active_token, review_required, observation from commerce_group_state where id = ? and deleted_at is null",
            [value.groupId],
          );
          expect(fence.rows).toHaveLength(1);
          expect(fence.rows[0]).toMatchObject({
            active_token: null,
            review_required: false,
          });
          expect(
            readFinanceExecutionWriters(fence.rows[0].observation),
          ).toEqual([]);
          expect(
            stripe.requests.filter((row) => row.method === "POST"),
          ).toHaveLength(providerPosts);
          expect(stripe.state).toMatchObject({
            captureCalls: 1,
            refundCreates: 0,
            reversalCreates: 0,
          });
        }
        expect(stripe.requests.slice(requestStart).length).toBeGreaterThan(0);
        expect(
          stripe.requests
            .slice(requestStart)
            .every((row) => row.method === "GET"),
        ).toBe(true);
      });

      it("rejects capture over HTTP when Stripe reports an expired authorization after native fulfillment", async () => {
        const value = await createFinanceDurabilityFixture(getContainer(), {
          paymentState: "authorized",
        });
        const before = await read(value);
        expect(before.view.finance.capture).toMatchObject({
          allowed: true,
          amount: 100,
        });
        expect(
          before.group.orders.every((order) => order.fulfillments.length > 0),
        ).toBe(true);
        expect(before.operations).toEqual([]);
        const auth = getContainer().resolve<IAuthModuleService>(Modules.AUTH);
        const identity = await auth.createAuthIdentities({
          app_metadata: { user_id: value.actorId },
          provider_identities: [
            {
              provider: "emailpass",
              entity_id: `finance-expired-${randomUUID()}@example.invalid`,
            },
          ],
        });
        const { http } = getContainer().resolve(
          ContainerRegistrationKeys.CONFIG_MODULE,
        ).projectConfig;
        const token = generateJwtToken(
          {
            actor_id: value.actorId,
            actor_type: "user",
            auth_identity_id: identity.id,
            auth_provider: "emailpass",
            app_metadata: { user_id: value.actorId },
          },
          {
            secret: http.jwtSecret,
            expiresIn: "10m",
            jwtOptions: http.jwtOptions,
          },
        );

        // This models Stripe's observed expiration outcome, not elapsed real
        // authorization time. A fake clock alone cannot exercise this guard.
        expect(stripe.expireAuthorization()).toEqual({
          status: "canceled",
          amount_capturable: 0,
          amount_received: 0,
        });
        const requestStart = stripe.requests.length;
        const requestId = randomUUID();
        await expect(
          api.post(
            `/admin/orders/${value.orderId}/finance`,
            {
              action: "capture",
              request_id: requestId,
              note: "Observed expired authorization after fulfillment",
              confirm: true,
            },
            { headers: { authorization: `Bearer ${token}` } },
          ),
        ).rejects.toMatchObject({
          response: {
            status: 400,
            data: { message: "La autorización no permite esta captura final." },
          },
        });
        const requests = stripe.requests.slice(requestStart);
        expect(requests).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              method: "GET",
              path: "/v1/payment_intents/pi_durability",
            }),
          ]),
        );
        expect(requests.filter((request) => request.method === "POST")).toEqual(
          [],
        );
        expect(stripe.state).toMatchObject({
          captureCalls: 0,
          refundCreates: 0,
          reversalCreates: 0,
        });
        const after = await read(value);
        expect(after.originals).toEqual(before.originals);
        expect(after.operations).toEqual([]);
        expect(after.state?.active_token).toBeNull();
        expect(after.state?.review_required).toBe(false);
        expect(after.view.finance.captured_total).toBe(0);
        for (const order of after.group.orders) {
          expect(order.transactions).toEqual([]);
          expect(order.cart.payment_collection.payments[0].captures).toEqual(
            [],
          );
          expect(order.cart.payment_collection.payments[0].refunds).toEqual([]);
        }
        const operations = await dbConnection.raw(
          "select id from commerce_operation where group_id = ? and deleted_at is null",
          [value.groupId],
        );
        expect(operations.rows).toEqual([]);
        const payouts = await dbConnection.raw(
          "select id from payout where deleted_at is null",
        );
        expect(payouts.rows).toEqual([]);
      });

      it("adopts a confirmed refund after its lost provider response removed the provisional native refund", async () => {
        const value = await fixture();
        const request = input(value);
        stripe.state.loseRefundResponse = true;
        await expect(operate(request)).rejects.toMatchObject({
          message: expect.any(String),
        });
        stripe.state.loseRefundResponse = false;
        const persisted = await persistedOperation(request);
        expect(persisted).toMatchObject({
          state: "uncertain",
          result: { refund_attempted: true, refund_ids: [] },
        });
        expect(
          (await read(value)).group.orders[0].cart.payment_collection
            .payments[0].refunds,
        ).toHaveLength(0);
        expect(stripe.refunds).toHaveLength(1);
        await expect(operate(request)).rejects.toMatchObject({
          message: expect.any(String),
        });
        const inspection = await recover(request);
        expect(inspection.plan.actions).toContain("adopt_refund");
        await verifyCompleted(value, request);
      });

      it.each(["refund", "reversal"] as const)(
        "recovers the %s effect before the journal checkpoint without repeating it",
        async (kind) => {
          const value = await fixture(kind === "reversal");
          const request = input(value);
          const restore = failJournalAfterEffect(kind);
          try {
            await expect(operate(request)).rejects.toMatchObject({
              message: expect.any(String),
            });
          } finally {
            restore();
          }
          const persisted = await persistedOperation(request);
          expect(persisted.state).toBe("processing");
          expect(persisted.result.refund_ids).toEqual([]);
          expect(persisted.result.settlement?.reversal_id).toBeUndefined();
          expect((await read(value)).state?.active_token).toBe(persisted.token);
          expect(stripe.state.refundCreates).toBe(kind === "refund" ? 1 : 0);
          expect(stripe.state.reversalCreates).toBe(
            kind === "reversal" ? 1 : 0,
          );
          await expect(operate(request)).rejects.toMatchObject({
            message: expect.any(String),
          });
          const inspection = await recover(request);
          expect(inspection.plan.actions).toContain(
            kind === "refund" ? "record_refund_transaction" : "create_refund",
          );
          if (kind === "refund")
            expect(inspection.plan.actions).not.toContain("adopt_refund");
          await verifyCompleted(value, request, kind === "reversal");
        },
      );

      it.each(["refund", "reversal"] as const)(
        "keeps the fence and refuses recovery when the attempted %s is absent from observation",
        async (kind) => {
          const value = await fixture(kind === "reversal");
          const request = input(value);
          if (kind === "refund") stripe.state.loseRefundResponse = true;
          else stripe.state.loseReversalResponse = true;
          await expect(operate(request)).rejects.toMatchObject({
            message: expect.any(String),
          });
          stripe.state.loseRefundResponse = false;
          stripe.state.loseReversalResponse = false;
          stripe.state.hideRefunds = kind === "refund";
          stripe.state.hideReversals = kind === "reversal";
          const before = await persistedOperation(request);
          expect(before.state).toBe("uncertain");
          const posts = stripe.requests.filter(
            (row) => row.method === "POST",
          ).length;
          await expect(
            inspectFinanceRecovery(getContainer(), recoveryInput(request)),
          ).rejects.toMatchObject({ message: expect.any(String) });
          await expect(
            recoverOrderFinanceWorkflow(getContainer()).run({
              input: {
                ...recoveryInput(request),
                plan_hash: "0".repeat(64),
                release_stopped_writer: false,
              },
            }),
          ).rejects.toMatchObject({ message: expect.any(String) });
          await expect(operate(request)).rejects.toMatchObject({
            message: expect.any(String),
          });
          expect(
            stripe.requests.filter((row) => row.method === "POST"),
          ).toHaveLength(posts);
          expect(await persistedOperation(request)).toEqual(before);
          const current = await read(value);
          expect(current.state).toMatchObject({
            active_token: before.token,
            review_required: true,
          });
          expect(current.view.finance.refund.allowed).toBe(false);
          expect(
            await journal().listFinanceRecoveryAttempts({
              operation_id: operationId(request),
            }),
          ).toEqual([]);
        },
      );

      it.each([false, true])(
        "replays a persisted success after response loss (fence already released: %s)",
        async (released) => {
          const value = await fixture();
          const request = input(value);
          const service = journal();
          const release = service.releaseGroup.bind(service);
          const spy = jest
            .spyOn(service, "releaseGroup")
            .mockImplementation(async (...args) => {
              if (released) await release(...args);
              throw new Error(
                "Injected response loss after durable complete operation",
              );
            });
          try {
            await expect(operate(request)).rejects.toMatchObject({
              message: expect.any(String),
            });
          } finally {
            spy.mockRestore();
          }
          const before = await persistedOperation(request);
          expect(before.state).toBe("complete");
          expect(stripe.state.refundCreates).toBe(1);
          if (!released) {
            expect((await read(value)).state?.active_token).toBe(before.token);
            const inspection = await recover(request);
            expect(inspection.plan.actions).toEqual([]);
            expect((await persistedOperation(request)).result).toEqual(
              before.result,
            );
          }
          await verifyCompleted(value, request);
        },
      );
    },
  });
}
