import { createAdminClient } from "@/lib/supabase/admin";

import type {
  YikeActor,
  YikeExecutionSlotKey,
  YikeItemRow,
  YikeProjectRow,
  YikeWorkbenchPayload,
} from "./types";
import { yikeError } from "./errors";
import {
  buildStatusTransitionUpdate,
  getOrCreateYikeWorkspace,
  type YikeDbClient,
  type YikeResult,
} from "./service";
import { loadYikeWorkbench } from "./read-model";
import { validateFocusCompleteInput, validateFocusReplaceInput } from "./validation";

type FocusItemUpdate = {
  itemId: string;
  update: ReturnType<typeof buildStatusTransitionUpdate>;
};

type FocusSlotUpdate = {
  slotKey: Extract<YikeExecutionSlotKey, "primary_task" | "candidate_1" | "candidate_2">;
  itemId: string;
  filledReason: "manual" | "auto";
};

type FocusCompletePlan = {
  itemUpdates: FocusItemUpdate[];
  slotUpdate: FocusSlotUpdate | null;
};

function getClient(client?: YikeDbClient): YikeDbClient {
  return client ?? (createAdminClient() as unknown as YikeDbClient);
}

export function buildFocusCompletePlan(input: {
  currentItem: YikeItemRow;
  continueWithItem: YikeItemRow | null;
  now: string;
}): FocusCompletePlan {
  const itemUpdates: FocusItemUpdate[] = [
    {
      itemId: input.currentItem.id,
      update: buildStatusTransitionUpdate("done", input.now),
    },
  ];

  if (!input.continueWithItem) {
    return { itemUpdates, slotUpdate: null };
  }

  itemUpdates.push({
    itemId: input.continueWithItem.id,
    update: buildStatusTransitionUpdate("doing", input.now),
  });

  return {
    itemUpdates,
    slotUpdate: {
      slotKey: "primary_task",
      itemId: input.continueWithItem.id,
      filledReason: "manual",
    },
  };
}

export function buildReplaceSlotPlan(
  slotKey: Extract<YikeExecutionSlotKey, "primary_task" | "candidate_1" | "candidate_2">,
  item: YikeItemRow,
) {
  return {
    slotUpdate: {
      slotKey,
      itemId: item.id,
      filledReason: "manual" as const,
    },
    itemUpdate: item.status === "planned"
      ? {
          itemId: item.id,
          update: buildStatusTransitionUpdate("doing"),
        }
      : null,
  };
}

export function selectNextProjectTaskId(project: YikeProjectRow, projectItems: YikeItemRow[]) {
  const candidates = projectItems
    .filter((item) => item.project_id === project.id && item.status !== "done" && !item.archived_at)
    .filter((item) => item.id !== project.next_task_id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));

  return candidates[0]?.id ?? null;
}

async function selectItem(client: YikeDbClient, actor: YikeActor, itemId: string) {
  const result = await client
    .from("yike_items")
    .select("*")
    .eq("id", itemId)
    .eq("user_id", actor.userId)
    .is("archived_at", null)
    .maybeSingle();

  if (result.error) {
    return { ok: false as const, error: yikeError("INTERNAL_ERROR", result.error.message ?? "读取事项失败") };
  }
  if (!result.data) {
    return { ok: false as const, error: yikeError("NOT_FOUND", "事项不存在") };
  }
  return { ok: true as const, data: result.data as YikeItemRow };
}

async function writeItemUpdate(
  client: YikeDbClient,
  actor: YikeActor,
  itemUpdate: FocusItemUpdate,
) {
  return client
    .from("yike_items")
    .update(itemUpdate.update)
    .eq("id", itemUpdate.itemId)
    .eq("user_id", actor.userId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
}

async function writeSlotUpdate(
  client: YikeDbClient,
  context: { userId: string; workspaceId: string },
  slotUpdate: FocusSlotUpdate,
) {
  return client.from("yike_execution_slots").upsert(
    {
      workspace_id: context.workspaceId,
      user_id: context.userId,
      slot_key: slotUpdate.slotKey,
      item_id: slotUpdate.itemId,
      project_id: null,
      filled_reason: slotUpdate.filledReason,
      filled_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,slot_key" },
  );
}

async function writeFocusEvent(
  client: YikeDbClient,
  context: { userId: string; workspaceId: string },
  event: {
    itemId: string | null;
    eventType: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  },
) {
  await client.from("yike_item_events").insert({
    workspace_id: context.workspaceId,
    user_id: context.userId,
    item_id: event.itemId,
    project_id: null,
    event_type: event.eventType,
    before_json: event.before,
    after_json: event.after,
  });
}

export async function completeYikeFocusItem(
  actor: YikeActor,
  body: unknown,
  options: { client?: YikeDbClient; now?: string; today?: string } = {},
): Promise<YikeResult<YikeWorkbenchPayload>> {
  const input = validateFocusCompleteInput(body);
  if (!input.ok) return { ok: false, error: input.error };

  const client = getClient(options.client);
  const workspace = await getOrCreateYikeWorkspace(actor, { client });
  const current = await selectItem(client, actor, input.data.itemId);
  if (!current.ok) return { ok: false, error: current.error };
  if (current.data.status !== "doing") {
    return { ok: false, error: yikeError("CONFLICT", "只能完成正在做的事项") };
  }

  let continueWithItem: YikeItemRow | null = null;
  if (input.data.continueWithItemId) {
    const next = await selectItem(client, actor, input.data.continueWithItemId);
    if (!next.ok) return { ok: false, error: next.error };
    if (next.data.status !== "planned") {
      return { ok: false, error: yikeError("CONFLICT", "只能继续计划做的事项") };
    }
    continueWithItem = next.data;
  }

  const plan = buildFocusCompletePlan({
    currentItem: current.data,
    continueWithItem,
    now: options.now ?? new Date().toISOString(),
  });

  for (const itemUpdate of plan.itemUpdates) {
    const updated = await writeItemUpdate(client, actor, itemUpdate);
    if (updated.error) {
      return { ok: false, error: yikeError("INTERNAL_ERROR", updated.error.message ?? "更新事项失败") };
    }
  }

  if (plan.slotUpdate) {
    const slotResult = await writeSlotUpdate(
      client,
      { userId: actor.userId, workspaceId: workspace.id },
      plan.slotUpdate,
    );
    if (slotResult.error) {
      return { ok: false, error: yikeError("INTERNAL_ERROR", slotResult.error.message ?? "更新执行槽失败") };
    }
  }

  await writeFocusEvent(client, { userId: actor.userId, workspaceId: workspace.id }, {
    itemId: current.data.id,
    eventType: "completed",
    before: { status: current.data.status },
    after: { status: "done", continueWithItemId: input.data.continueWithItemId },
  });

  const workbench = await loadYikeWorkbench(actor, { client, today: options.today });
  return { ok: true, data: workbench };
}

export async function replaceYikeFocusSlot(
  actor: YikeActor,
  body: unknown,
  options: { client?: YikeDbClient; today?: string } = {},
): Promise<YikeResult<YikeWorkbenchPayload>> {
  const input = validateFocusReplaceInput(body);
  if (!input.ok) return { ok: false, error: input.error };

  const client = getClient(options.client);
  const workspace = await getOrCreateYikeWorkspace(actor, { client });
  const selected = await selectItem(client, actor, input.data.itemId);
  if (!selected.ok) return { ok: false, error: selected.error };
  if (selected.data.status === "done") {
    return { ok: false, error: yikeError("CONFLICT", "做完了的事项不能放入执行槽") };
  }

  const plan = buildReplaceSlotPlan(input.data.slotKey, selected.data);
  if (plan.itemUpdate) {
    const updated = await writeItemUpdate(client, actor, plan.itemUpdate);
    if (updated.error) {
      return { ok: false, error: yikeError("INTERNAL_ERROR", updated.error.message ?? "更新事项失败") };
    }
  }

  const slotResult = await writeSlotUpdate(client, { userId: actor.userId, workspaceId: workspace.id }, plan.slotUpdate);
  if (slotResult.error) {
    return { ok: false, error: yikeError("INTERNAL_ERROR", slotResult.error.message ?? "更新执行槽失败") };
  }

  await writeFocusEvent(client, { userId: actor.userId, workspaceId: workspace.id }, {
    itemId: selected.data.id,
    eventType: "slot_user_confirmed",
    before: { status: selected.data.status },
    after: { slotKey: input.data.slotKey, status: plan.itemUpdate ? "doing" : selected.data.status },
  });

  const workbench = await loadYikeWorkbench(actor, { client, today: options.today });
  return { ok: true, data: workbench };
}
