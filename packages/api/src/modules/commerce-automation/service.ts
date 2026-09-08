import { randomUUID } from "node:crypto";
import {
  InjectManager,
  MedusaContext,
  MedusaService,
  MedusaError,
} from "@medusajs/framework/utils";
import type { Context, DAL, InferTypeOf } from "@medusajs/framework/types";
import type { EntityManager } from "@medusajs/framework/mikro-orm/knex";
import { CommerceGroupState } from "./models/commerce-group-state";
import { CommerceOperation } from "./models/commerce-operation";
import { CommerceScan } from "./models/commerce-scan";

export type CommerceGroupRecord = InferTypeOf<typeof CommerceGroupState>;
export type CommerceOperationRecord = InferTypeOf<typeof CommerceOperation>;

class CommerceAutomationService extends MedusaService({
  CommerceGroupState,
  CommerceOperation,
  CommerceScan,
}) {
  protected baseRepository_: DAL.RepositoryService;
  constructor(container: { baseRepository: DAL.RepositoryService }) {
    super(container);
    this.baseRepository_ = container.baseRepository;
  }

  private async committed<T>(
    work: (manager: EntityManager) => Promise<T>,
    hasParentTransaction: boolean,
  ): Promise<T> {
    // A fence rolled back by an enclosing workflow transaction cannot guard an external effect.
    if (hasParentTransaction)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Commerce fencing requires its own committed transaction.",
      );
    return this.baseRepository_.transaction(work);
  }

  @InjectManager()
  async claimGroup(
    groupId: string,
    cartId: string,
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<CommerceGroupRecord | null> {
    return this.committed(async (manager) => {
      const table = () =>
        manager
          .getKnex()("commerce_group_state")
          .transacting(manager.getTransactionContext()!);
      const now = new Date();
      await table()
        .insert({
          id: groupId,
          cart_id: cartId,
          review_required: false,
          created_at: now,
          updated_at: now,
        })
        .onConflict("id")
        .ignore();
      const [claim]: CommerceGroupRecord[] = await table()
        .where({ id: groupId, cart_id: cartId })
        .whereNull("deleted_at")
        .whereNull("active_token")
        .update({ active_token: randomUUID(), updated_at: now })
        .returning("*");
      // No lease expiry: a crash or uncertain provider response requires operator reconciliation.
      return claim ?? null;
    }, Boolean(context?.transactionManager));
  }

  @InjectManager()
  async observeGroup(
    groupId: string,
    token: string,
    observation: Record<string, unknown>,
    requiresReview: boolean,
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<void> {
    await this.committed(async (manager) => {
      const table = () =>
        manager
          .getKnex()("commerce_group_state")
          .transacting(manager.getTransactionContext()!);
      const row: CommerceGroupRecord | undefined = await table()
        .where({ id: groupId, active_token: token })
        .whereNull("deleted_at")
        .forUpdate()
        .first();
      if (!row)
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Commerce group ownership changed.",
        );
      const priorHolds = row.observation?.held_order_ids;
      const nextHolds = observation.held_order_ids;
      const heldOrderIds = [
        ...new Set(
          [
            ...(Array.isArray(priorHolds) ? priorHolds : []),
            ...(Array.isArray(nextHolds) ? nextHolds : []),
          ].filter((id): id is string => typeof id === "string"),
        ),
      ];
      await table()
        .where({ id: groupId, active_token: token })
        .update({
          observation: JSON.stringify({
            ...row.observation,
            ...observation,
            held_order_ids: heldOrderIds,
          }),
          review_required: row.review_required || requiresReview,
          updated_at: new Date(),
        });
    }, Boolean(context?.transactionManager));
  }

  @InjectManager()
  async releaseGroup(
    groupId: string,
    token: string,
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<void> {
    await this.committed(async (manager) => {
      const changed = await manager
        .getKnex()("commerce_group_state")
        .transacting(manager.getTransactionContext()!)
        .where({ id: groupId, active_token: token })
        .whereNull("deleted_at")
        .update({ active_token: null, updated_at: new Date() });
      if (changed !== 1)
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Commerce group ownership changed.",
        );
    }, Boolean(context?.transactionManager));
  }

  @InjectManager()
  async claimOperation(
    input: {
      groupId: string;
      token: string;
      kind: CommerceOperationRecord["kind"];
      targetId: string;
    },
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<CommerceOperationRecord | null> {
    return this.committed(async (manager) => {
      const table = (name: string) =>
        manager.getKnex()(name).transacting(manager.getTransactionContext()!);
      const owner = await table("commerce_group_state")
        .where({ id: input.groupId, active_token: input.token })
        .whereNull("deleted_at")
        .forUpdate()
        .first();
      if (!owner)
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Commerce group ownership changed.",
        );
      if (owner.review_required && input.kind !== "cancel") return null;
      const now = new Date();
      const [operation]: CommerceOperationRecord[] = await table(
        "commerce_operation",
      )
        .insert({
          id: `${input.kind}:${input.targetId}`,
          group_id: input.groupId,
          token: input.token,
          target_id: input.targetId,
          kind: input.kind,
          state: "processing",
          created_at: now,
          updated_at: now,
        })
        .onConflict("id")
        .ignore()
        .returning("*");
      return operation ?? null;
    }, Boolean(context?.transactionManager));
  }

  @InjectManager()
  async finishOperation(
    id: string,
    token: string,
    state: "complete" | "uncertain",
    result: Record<string, unknown>,
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<void> {
    await this.committed(async (manager) => {
      const changed = await manager
        .getKnex()("commerce_operation")
        .transacting(manager.getTransactionContext()!)
        .where({ id, token, state: "processing" })
        .whereNull("deleted_at")
        .update({
          state,
          result: JSON.stringify(result),
          updated_at: new Date(),
        });
      if (changed !== 1)
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Commerce operation ownership changed.",
        );
    }, Boolean(context?.transactionManager));
  }

  @InjectManager()
  async advanceScan(
    expected: string | null,
    position: string | null,
    @MedusaContext() context?: Context<EntityManager>,
  ): Promise<void> {
    await this.committed(async (manager) => {
      const table = () =>
        manager
          .getKnex()("commerce_scan")
          .transacting(manager.getTransactionContext()!);
      const now = new Date();
      await table()
        .insert({
          id: "groups",
          position: null,
          created_at: now,
          updated_at: now,
        })
        .onConflict("id")
        .ignore();
      await table()
        .where({ id: "groups", position: expected })
        .whereNull("deleted_at")
        .update({ position, updated_at: now });
    }, Boolean(context?.transactionManager));
  }
}

export default CommerceAutomationService;
