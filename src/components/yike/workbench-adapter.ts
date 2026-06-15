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
  YikeProjectFocus,
  YikeWorkbench,
} from "@/components/yike/types";

interface NameMaps {
  areas: Map<string, string>;
  areaColors: Map<string, string | null>;
  projects: Map<string, string>;
  people: Map<string, string>;
}

const EMPTY_NAME_MAPS: NameMaps = {
  areas: new Map(),
  areaColors: new Map(),
  projects: new Map(),
  people: new Map(),
};

export function mapCardToItem(card: YikeWorkbenchCard, names: NameMaps = EMPTY_NAME_MAPS): YikeItem {
  return {
    id: card.id,
    itemType: card.itemType,
    status: card.status,
    title: card.title,
    note: card.note,
    rawInput: card.rawInput,
    areaId: card.areaId,
    areaName: card.areaId ? names.areas.get(card.areaId) ?? null : null,
    areaColor: card.areaId ? names.areaColors.get(card.areaId) ?? null : null,
    projectId: card.projectId,
    projectName: card.projectId ? names.projects.get(card.projectId) ?? null : null,
    complexity: card.complexity,
    timeBucket: card.timeBucket,
    dueDate: card.dueDate,
    isUrgent: card.isUrgent,
    memoGranularity: card.memoGranularity,
    assigneePersonId: card.assigneePersonId,
    assigneeName: card.assigneePersonId ? names.people.get(card.assigneePersonId) ?? null : null,
    delegatedNote: card.delegatedNote,
    followUpBucket: card.followUpBucket,
    sourceMemoId: card.sourceMemoId,
    completedAt: card.completedAt,
    createdAt: card.createdAt,
    requiresConfirmation: card.requiresConfirmation,
  };
}

export function mapAreaDtoToArea(dto: YikeAreaDTO): YikeArea {
  return {
    id: dto.id,
    name: dto.name,
    sortOrder: dto.sortOrder,
    color: (dto as { color?: string | null }).color ?? null,
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
    workspace: { id: "", name: "此刻" },
    today,
    execution: {
      primaryTaskId: null,
      candidateTaskIds: [],
      recommendedTasks: [],
      projectFocus: null,
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
  const names: NameMaps = {
    areas: new Map(payload.drawerData.areas.map((a) => [a.id, a.name])),
    areaColors: new Map(
      payload.drawerData.areas.map((a) => [a.id, (a as { color?: string | null }).color ?? null]),
    ),
    projects: new Map(payload.drawerData.projects.map((p) => [p.id, p.name])),
    people: new Map(payload.drawerData.people.map((p) => [p.id, p.name])),
  };

  const toItem = (c: YikeWorkbenchCard) => mapCardToItem(c, names);

  const lanes = {
    planned: {
      items: payload.lanes.planned.items.map(toItem),
      hiddenCount: payload.lanes.planned.hiddenCount,
    },
    doing: {
      items: payload.lanes.doing.items.map(toItem),
      hiddenCount: payload.lanes.doing.hiddenCount,
    },
    delegated: {
      items: payload.lanes.delegated.items.map(toItem),
      hiddenCount: payload.lanes.delegated.hiddenCount,
    },
    done: {
      items: payload.lanes.done.items.map(toItem),
      hiddenCount: payload.lanes.done.hiddenCount,
    },
  };

  const projectFocus: YikeProjectFocus | null = payload.execution.projectFocus
    ? {
        projectId: payload.execution.projectFocus.project.id,
        projectName: payload.execution.projectFocus.project.name,
        nextTaskId: payload.execution.projectFocus.nextTask?.id ?? null,
        nextTaskTitle: payload.execution.projectFocus.nextTask?.title ?? null,
      }
    : null;

  // 执行区是状态栏的「镜头」：1+2+1 用 id 标记溶进栏内，任务仍属于原栏，不复制成第二套数据。
  return {
    workspace: payload.workspace,
    today: payload.today,
    execution: {
      primaryTaskId: payload.execution.primaryTask?.id ?? null,
      candidateTaskIds: payload.execution.candidateTasks.map((c) => c.id),
      recommendedTasks: payload.execution.recommendedTasks.map(toItem),
      projectFocus,
    },
    lanes,
    reminders: {
      urgent: payload.reminders.urgent.map(toItem),
      dueSoon: payload.reminders.dueSoon.map(toItem),
      projectsMissingNextTask: payload.reminders.projectsMissingNextTask.map(mapProjectDtoToProject),
      memosSuggestSplit: payload.reminders.memosSuggestSplit.map(toItem),
    },
    drawerData: {
      areas: payload.drawerData.areas.map(mapAreaDtoToArea),
      projects: payload.drawerData.projects.map(mapProjectDtoToProject),
      people: payload.drawerData.people.map(mapPersonDtoToPerson),
    },
  };
}
