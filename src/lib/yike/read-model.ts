import { createAdminClient } from "@/lib/supabase/admin";

import { compareYikeCards } from "./sort";
import { getOrCreateYikeWorkspace, toYikeItemDTO, type YikeDbClient } from "./service";
import type {
  YikeActor,
  YikeAreaDTO,
  YikeAreaRow,
  YikeExecutionSlotKey,
  YikeExecutionSlotRow,
  YikeItemDTO,
  YikeItemRow,
  YikeItemStatus,
  YikeNature,
  YikePersonDTO,
  YikePersonRow,
  YikeProjectDTO,
  YikeProjectRow,
  YikeWorkbenchCard,
  YikeWorkbenchPayload,
} from "./types";

type YikeWorkspaceRow = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

type BuildWorkbenchInput = {
  workspace: YikeWorkspaceRow;
  today: string;
  areas: YikeAreaRow[];
  projects: YikeProjectRow[];
  people: YikePersonRow[];
  items: YikeItemRow[];
  slots: YikeExecutionSlotRow[];
};

const LANE_LIMIT = 10;
const SLOT_ORDER: YikeExecutionSlotKey[] = ["primary_task", "candidate_1", "candidate_2", "project_focus"];
const PRODUCT_WORKSPACE_NAME = "此刻";

function getClient(client?: YikeDbClient): YikeDbClient {
  return client ?? (createAdminClient() as unknown as YikeDbClient);
}

export function toYikeAreaDTO(row: YikeAreaRow): YikeAreaDTO {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    color: row.color,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toYikeProjectDTO(row: YikeProjectRow): YikeProjectDTO {
  return {
    id: row.id,
    areaId: row.area_id,
    name: row.name,
    goalNote: row.goal_note,
    acceptanceCriteria: row.acceptance_criteria,
    nextTaskId: row.next_task_id,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toYikePersonDTO(row: YikePersonRow): YikePersonDTO {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getYikeDueState(
  dueDate: string | null,
  today: string,
): YikeWorkbenchCard["reminder"]["dueState"] {
  if (!dueDate) return "none";
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "due_today";
  return "upcoming";
}

function getNature(item: YikeItemDTO): YikeNature {
  if (item.itemType === "memo") return "memo";
  if (item.projectId) return "project";
  return "task";
}

export function toWorkbenchCard(
  item: YikeItemRow,
  areasById: Map<string, YikeAreaRow>,
  today: string,
  requiresConfirmation = false,
): YikeWorkbenchCard {
  const dto = toYikeItemDTO(item);
  const nature = getNature(dto);
  const areaSortOrder = dto.areaId ? areasById.get(dto.areaId)?.sort_order ?? null : null;

  return {
    ...dto,
    nature,
    areaSortOrder,
    visualWeight: dto.itemType === "memo" ? "light" : "normal",
    requiresConfirmation,
    reminder: {
      isUrgent: dto.isUrgent,
      dueState: getYikeDueState(dto.dueDate, today),
    },
    suggestSplit: dto.itemType === "memo" && dto.memoGranularity === "multiple",
  };
}

function sortCards(cards: YikeWorkbenchCard[]) {
  return [...cards].sort(compareYikeCards);
}

function normalizeWorkspaceName(name: string) {
  return name === "一刻" ? PRODUCT_WORKSPACE_NAME : name;
}

function buildLane(cards: YikeWorkbenchCard[]) {
  const sorted = sortCards(cards);
  return {
    items: sorted.slice(0, LANE_LIMIT),
    hiddenCount: Math.max(0, sorted.length - LANE_LIMIT),
  };
}

function pickFirstOpenProject(projects: YikeProjectRow[], itemsById: Map<string, YikeWorkbenchCard>) {
  return projects.find((project) => project.next_task_id && itemsById.has(project.next_task_id)) ?? null;
}

export function buildYikeWorkbenchPayload(input: BuildWorkbenchInput): YikeWorkbenchPayload {
  const activeAreas = input.areas.filter((row) => !row.archived_at);
  const activeProjects = input.projects.filter((row) => !row.archived_at);
  const activePeople = input.people.filter((row) => !row.archived_at);
  const activeItems = input.items.filter((row) => !row.archived_at);

  const areasById = new Map(activeAreas.map((row) => [row.id, row]));
  const projectsById = new Map(activeProjects.map((row) => [row.id, row]));
  const cards = activeItems.map((row) => toWorkbenchCard(row, areasById, input.today));
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const slotsByKey = new Map(input.slots.map((slotRow) => [slotRow.slot_key, slotRow]));

  const lanes = {
    planned: buildLane(cards.filter((card) => card.status === "planned")),
    doing: buildLane(cards.filter((card) => card.status === "doing")),
    delegated: buildLane(cards.filter((card) => card.status === "delegated")),
    done: buildLane(cards.filter((card) => card.status === "done")),
  } satisfies Record<YikeItemStatus, { items: YikeWorkbenchCard[]; hiddenCount: number }>;

  const primarySlotItemId = slotsByKey.get("primary_task")?.item_id ?? null;
  const primaryTask = primarySlotItemId
    ? cardsById.get(primarySlotItemId) ?? null
    : lanes.doing.items[0] ?? null;

  const candidateSlotIds = [
    slotsByKey.get("candidate_1")?.item_id ?? null,
    slotsByKey.get("candidate_2")?.item_id ?? null,
  ];
  const candidateTasks = candidateSlotIds
    .map((id) => (id ? cardsById.get(id) ?? null : null))
    .filter((card): card is YikeWorkbenchCard => Boolean(card));

  const blockedRecommendationIds = new Set([
    primaryTask?.id,
    ...candidateTasks.map((card) => card.id),
  ].filter((id): id is string => Boolean(id)));
  const recommendedTasks = sortCards(
    cards
      .filter((card) => card.status === "planned" && !blockedRecommendationIds.has(card.id))
      .map((card) => ({ ...card, requiresConfirmation: true })),
  ).slice(0, Math.max(0, 2 - candidateTasks.length));

  const projectSlotProjectId = slotsByKey.get("project_focus")?.project_id ?? null;
  const focusProject = projectSlotProjectId
    ? projectsById.get(projectSlotProjectId) ?? null
    : pickFirstOpenProject(activeProjects, cardsById);
  const projectNextTask = focusProject?.next_task_id ? cardsById.get(focusProject.next_task_id) ?? null : null;
  const projectFocus = focusProject && projectNextTask
    ? {
        project: toYikeProjectDTO(focusProject),
        nextTask: projectNextTask,
        requiresConfirmation: projectNextTask.status === "planned",
        needsNextTask: false,
      }
    : null;

  const emptySlots = SLOT_ORDER.filter((slotKey) => {
    if (slotKey === "primary_task") return !primaryTask;
    if (slotKey === "candidate_1") return candidateTasks.length < 1;
    if (slotKey === "candidate_2") return candidateTasks.length < 2;
    return !projectFocus;
  });

  const dueSoon = cards.filter((card) => card.reminder.dueState === "overdue" || card.reminder.dueState === "due_today");

  return {
    workspace: {
      id: input.workspace.id,
      name: normalizeWorkspaceName(input.workspace.name),
    },
    today: input.today,
    execution: {
      primaryTask,
      candidateTasks,
      recommendedTasks,
      projectFocus,
      emptySlots,
    },
    lanes,
    reminders: {
      urgent: cards.filter((card) => card.isUrgent),
      dueSoon,
      projectsMissingNextTask: activeProjects
        .filter((project) => !project.next_task_id)
        .map(toYikeProjectDTO),
      memosSuggestSplit: cards.filter((card) => card.suggestSplit),
    },
    drawerData: {
      areas: activeAreas.sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)).map(toYikeAreaDTO),
      projects: activeProjects.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).map(toYikeProjectDTO),
      people: activePeople.sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id)).map(toYikePersonDTO),
    },
  };
}

export async function loadYikeWorkbench(
  actor: YikeActor,
  options: { client?: YikeDbClient; today?: string } = {},
): Promise<YikeWorkbenchPayload> {
  const client = getClient(options.client);
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const workspace = await getOrCreateYikeWorkspace(actor, { client });

  const [areas, projects, people, items, slots] = await Promise.all([
    client.from("yike_areas").select("*").eq("user_id", actor.userId),
    client.from("yike_projects").select("*").eq("user_id", actor.userId),
    client.from("yike_people").select("*").eq("user_id", actor.userId),
    client.from("yike_items").select("*").eq("user_id", actor.userId).is("archived_at", null),
    client.from("yike_execution_slots").select("*").eq("user_id", actor.userId),
  ]);

  const firstError = areas.error ?? projects.error ?? people.error ?? items.error ?? slots.error;
  if (firstError) {
    throw new Error(firstError.message ?? "读取此刻工作台失败");
  }

  return buildYikeWorkbenchPayload({
    workspace,
    today,
    areas: (areas.data ?? []) as YikeAreaRow[],
    projects: (projects.data ?? []) as YikeProjectRow[],
    people: (people.data ?? []) as YikePersonRow[],
    items: (items.data ?? []) as YikeItemRow[],
    slots: (slots.data ?? []) as YikeExecutionSlotRow[],
  });
}
