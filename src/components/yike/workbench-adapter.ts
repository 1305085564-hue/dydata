import type {
  YikeAreaDTO,
  YikePersonDTO,
  YikeProjectDTO,
  YikeWorkbenchCard,
  YikeWorkbenchPayload,
} from "@/lib/yike/types";
import type {
  YikeArea,
  YikeItem,
  YikePerson,
  YikeProject,
  YikeWorkbench,
  ExecutionSlot,
  ExecutionSlotKey,
  YikeItemStatus,
} from "@/components/yike/types";

export function mapCardToItem(card: YikeWorkbenchCard): YikeItem {
  return {
    id: card.id,
    itemType: card.itemType,
    status: card.status,
    title: card.title,
    note: card.note,
    rawInput: card.rawInput,
    areaId: card.areaId,
    projectId: card.projectId,
    complexity: card.complexity,
    timeBucket: card.timeBucket,
    dueDate: card.dueDate,
    isUrgent: card.isUrgent,
    memoGranularity: card.memoGranularity,
    assigneePersonId: card.assigneePersonId,
    delegatedNote: card.delegatedNote,
    followUpBucket: card.followUpBucket,
    sourceMemoId: card.sourceMemoId,
    completedAt: card.completedAt,
    createdAt: card.createdAt,
  };
}

export function mapAreaDtoToArea(dto: YikeAreaDTO): YikeArea {
  return {
    id: dto.id,
    name: dto.name,
    sortOrder: dto.sortOrder,
  };
}

export function mapProjectDtoToProject(dto: YikeProjectDTO & { nextTaskTitle?: string | null }): YikeProject {
  return {
    id: dto.id,
    name: dto.name,
    nextTaskId: dto.nextTaskId,
    nextTaskTitle: dto.nextTaskTitle ?? null,
    areaId: dto.areaId,
  };
}

export function mapPersonDtoToPerson(dto: YikePersonDTO): YikePerson {
  return {
    id: dto.id,
    name: dto.name,
  };
}

export function mapWorkbenchPayloadToWorkbench(payload: YikeWorkbenchPayload): YikeWorkbench {
  const card = (c: YikeWorkbenchCard): YikeItem & { requiresConfirmation: boolean } => ({
    ...mapCardToItem(c),
    requiresConfirmation: c.requiresConfirmation,
  });

  const toSlot = (
    slotKey: ExecutionSlotKey,
    item: (YikeItem & { requiresConfirmation?: boolean }) | null,
    project: YikeProject | null,
    filledReason: "auto" | "manual" = "auto",
  ): ExecutionSlot => ({
    slotKey,
    itemId: item?.id ?? (project?.id ? null : null),
    projectId: project?.id ?? null,
    filledReason,
    item: item
      ? {
          ...item,
          requiresConfirmation:
            "requiresConfirmation" in item ? Boolean(item.requiresConfirmation) : false,
        }
      : null,
    project,
    requiresConfirmation:
      item && "requiresConfirmation" in item
        ? Boolean(item.requiresConfirmation)
        : false,
  });

  const primaryTask = payload.execution.primaryTask
    ? toSlot("primary_task", card(payload.execution.primaryTask), null, "manual")
    : null;

  const candidateTasks: ExecutionSlot[] = payload.execution.candidateTasks.map((c, idx) =>
    toSlot(
      idx === 0 ? "candidate_1" : "candidate_2",
      card(c),
      null,
      c.requiresConfirmation ? "auto" : "manual",
    ),
  );

  const projectFocus = payload.execution.projectFocus
    ? toSlot(
        "project_focus",
        null,
        {
          id: payload.execution.projectFocus.project.id,
          name: payload.execution.projectFocus.project.name,
          nextTaskId: payload.execution.projectFocus.project.nextTaskId,
          nextTaskTitle: payload.execution.projectFocus.nextTask?.title ?? null,
          areaId: payload.execution.projectFocus.project.areaId,
        },
        "auto",
      )
    : null;

  const lanes = {
    planned: {
      items: payload.lanes.planned.items.map(mapCardToItem),
      hiddenCount: payload.lanes.planned.hiddenCount,
    },
    doing: {
      items: payload.lanes.doing.items.map(mapCardToItem),
      hiddenCount: payload.lanes.doing.hiddenCount,
    },
    delegated: {
      items: payload.lanes.delegated.items.map(mapCardToItem),
      hiddenCount: payload.lanes.delegated.hiddenCount,
    },
    done: {
      items: payload.lanes.done.items.map(mapCardToItem),
      hiddenCount: payload.lanes.done.hiddenCount,
    },
  };

  // 确保状态栏里没有重复显示当前执行槽中的任务
  const slotItemIds = new Set<string>();
  if (primaryTask?.itemId) slotItemIds.add(primaryTask.itemId);
  candidateTasks.forEach((s) => {
    if (s.itemId) slotItemIds.add(s.itemId);
  });

  (Object.keys(lanes) as YikeItemStatus[]).forEach((status) => {
    lanes[status].items = lanes[status].items.filter((i) => !slotItemIds.has(i.id));
  });

  return {
    workspace: payload.workspace,
    today: payload.today,
    execution: {
      primaryTask,
      candidateTasks,
      recommendedTasks: payload.execution.recommendedTasks.map(mapCardToItem),
      projectFocus,
      emptySlots: payload.execution.emptySlots as ExecutionSlotKey[],
    },
    lanes,
    reminders: {
      urgent: payload.reminders.urgent.map(mapCardToItem),
      dueSoon: payload.reminders.dueSoon.map(mapCardToItem),
      projectsMissingNextTask: payload.reminders.projectsMissingNextTask.map(mapProjectDtoToProject),
      memosSuggestSplit: payload.reminders.memosSuggestSplit.map(mapCardToItem),
    },
    drawerData: {
      areas: payload.drawerData.areas.map(mapAreaDtoToArea),
      projects: payload.drawerData.projects.map(mapProjectDtoToProject),
      people: payload.drawerData.people.map(mapPersonDtoToPerson),
    },
  };
}
