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

function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createEmptyYikeWorkbench(today = getLocalDateString()): YikeWorkbench {
  return {
    workspace: { id: "", name: "一刻" },
    today,
    execution: {
      primaryTask: null,
      candidateTasks: [],
      recommendedTasks: [],
      projectFocus: null,
      emptySlots: ["primary_task", "candidate_1", "candidate_2", "project_focus"],
    },
    lanes: {
      planned: { items: [], hiddenCount: 0 },
      doing: { items: [], hiddenCount: 0 },
      delegated: { items: [], hiddenCount: 0 },
      done: { items: [], hiddenCount: 0 },
    },
    reminders: {
      urgent: [],
      dueSoon: [],
      projectsMissingNextTask: [],
      memosSuggestSplit: [],
    },
    drawerData: {
      areas: [],
      projects: [],
      people: [],
    },
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

  // 执行区是状态栏的「镜头」，任务仍属于原状态栏，不再过滤。
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
