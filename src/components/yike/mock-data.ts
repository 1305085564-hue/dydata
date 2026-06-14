import type { YikeWorkbench, YikeItem, YikeProject, YikeArea, YikePerson } from "./types";

const workspace = { id: "mock-workspace", name: "一刻" };

const areas: YikeArea[] = [
  { id: "area-content", name: "内容方向", sortOrder: 100 },
  { id: "area-product", name: "产品打磨", sortOrder: 200 },
  { id: "area-health", name: "身体", sortOrder: 300 },
];

const projects: YikeProject[] = [
  {
    id: "project-yike",
    name: "一刻上线",
    nextTaskId: "task-yike-backend",
    nextTaskTitle: "把后端方案交给 Codex",
    areaId: "area-product",
  },
  {
    id: "project-missing",
    name: "健身计划",
    nextTaskId: null,
    areaId: "area-health",
  },
];

const people: YikePerson[] = [
  { id: "person-codex", name: "Codex" },
  { id: "person-kimi", name: "Kimi" },
];

const allItems: YikeItem[] = [
  {
    id: "task-write-spec",
    itemType: "task",
    status: "doing",
    title: "整理一刻前端静态版",
    note: "先搭页面结构和组件，不接真实 API",
    rawInput: null,
    areaId: "area-product",
    areaName: "产品打磨",
    projectId: "project-yike",
    projectName: "一刻上线",
    complexity: "focus",
    timeBucket: "today",
    dueDate: null,
    isUrgent: false,
    memoGranularity: "unknown",
    assigneePersonId: null,
    delegatedNote: null,
    followUpBucket: null,
    sourceMemoId: null,
    completedAt: null,
    createdAt: "2026-06-14T08:00:00Z",
  },
  {
    id: "task-yike-backend",
    itemType: "task",
    status: "planned",
    title: "把后端方案交给 Codex",
    note: "数据库、service、API 路由",
    rawInput: null,
    areaId: "area-product",
    areaName: "产品打磨",
    projectId: "project-yike",
    projectName: "一刻上线",
    complexity: "deep",
    timeBucket: "today",
    dueDate: null,
    isUrgent: false,
    memoGranularity: "unknown",
    assigneePersonId: "person-codex",
    assigneeName: "Codex",
    delegatedNote: null,
    followUpBucket: null,
    sourceMemoId: null,
    completedAt: null,
    createdAt: "2026-06-14T08:10:00Z",
  },
  {
    id: "task-review-script",
    itemType: "task",
    status: "planned",
    title: "审核下周脚本选题",
    note: "从飞书表格里挑 5 个",
    rawInput: null,
    areaId: "area-content",
    areaName: "内容方向",
    projectId: null,
    projectName: null,
    complexity: "small",
    timeBucket: "today",
    dueDate: "2026-06-15",
    isUrgent: true,
    memoGranularity: "unknown",
    assigneePersonId: null,
    delegatedNote: null,
    followUpBucket: null,
    sourceMemoId: null,
    completedAt: null,
    createdAt: "2026-06-14T08:20:00Z",
  },
  {
    id: "task-buy-domain",
    itemType: "task",
    status: "planned",
    title: "确认域名解析",
    note: null,
    rawInput: null,
    areaId: "area-product",
    areaName: "产品打磨",
    projectId: null,
    projectName: null,
    complexity: "quick",
    timeBucket: "this_week",
    dueDate: null,
    isUrgent: false,
    memoGranularity: "unknown",
    assigneePersonId: null,
    delegatedNote: null,
    followUpBucket: null,
    sourceMemoId: null,
    completedAt: null,
    createdAt: "2026-06-14T08:30:00Z",
  },
  {
    id: "memo-meeting",
    itemType: "memo",
    status: "planned",
    title: "晨会三点记录",
    note: "1. 一刻先做个人版 2. 后端 Codex 3. 前端静态版先跑",
    rawInput: "晨会三点记录",
    areaId: "area-content",
    areaName: "内容方向",
    projectId: null,
    projectName: null,
    complexity: "small",
    timeBucket: "today",
    dueDate: null,
    isUrgent: false,
    memoGranularity: "multiple",
    assigneePersonId: null,
    delegatedNote: null,
    followUpBucket: null,
    sourceMemoId: null,
    completedAt: null,
    createdAt: "2026-06-14T08:40:00Z",
  },
  {
    id: "task-delegated-design",
    itemType: "task",
    status: "delegated",
    title: "设计首页入口图",
    note: "等 Kimi 出图",
    rawInput: null,
    areaId: "area-product",
    areaName: "产品打磨",
    projectId: null,
    projectName: null,
    complexity: "small",
    timeBucket: "this_week",
    dueDate: null,
    isUrgent: false,
    memoGranularity: "unknown",
    assigneePersonId: "person-kimi",
    assigneeName: "Kimi",
    delegatedNote: "要 1200×630 的社交图",
    followUpBucket: "tomorrow",
    sourceMemoId: null,
    completedAt: null,
    createdAt: "2026-06-13T10:00:00Z",
  },
  {
    id: "task-done-yesterday",
    itemType: "task",
    status: "done",
    title: "定下一刻产品边界",
    note: null,
    rawInput: null,
    areaId: "area-product",
    areaName: "产品打磨",
    projectId: "project-yike",
    projectName: "一刻上线",
    complexity: "focus",
    timeBucket: "today",
    dueDate: null,
    isUrgent: false,
    memoGranularity: "unknown",
    assigneePersonId: null,
    delegatedNote: null,
    followUpBucket: null,
    sourceMemoId: null,
    completedAt: "2026-06-13T18:00:00Z",
    createdAt: "2026-06-13T09:00:00Z",
  },
];

const primaryTask = allItems.find((i) => i.status === "doing") ?? null;
const plannedItems = allItems.filter((i) => i.status === "planned");
// 执行区是状态栏的聚光灯：主任务仍保留在「正在做」栏中
const doingItems = allItems.filter((i) => i.status === "doing");
const delegatedItems = allItems.filter((i) => i.status === "delegated");
const doneItems = allItems.filter((i) => i.status === "done");

function makeSlot(
  item: YikeItem | null,
  slotKey: "primary_task" | "candidate_1" | "candidate_2",
  requiresConfirmation = false
) {
  return item
    ? {
        slotKey,
        itemId: item.id,
        projectId: null,
        filledReason: "auto" as const,
        item,
        requiresConfirmation,
      }
    : null;
}

const candidateTaskItems: YikeItem[] = [allItems[1], allItems[2]];
const recommendedTaskItems: YikeItem[] = plannedItems.filter(
  (i) => !candidateTaskItems.some((c) => c.id === i.id)
);

export const mockWorkbench: YikeWorkbench = {
  workspace,
  today: "2026-06-14",
  execution: {
    primaryTask: primaryTask
      ? {
          slotKey: "primary_task",
          itemId: primaryTask.id,
          projectId: null,
          filledReason: "auto",
          item: primaryTask,
          requiresConfirmation: false,
        }
      : null,
    candidateTasks: [
      makeSlot(candidateTaskItems[0] ?? null, "candidate_1", true),
      makeSlot(candidateTaskItems[1] ?? null, "candidate_2", true),
    ].filter(Boolean) as YikeWorkbench["execution"]["candidateTasks"],
    recommendedTasks: recommendedTaskItems.slice(0, 2),
    projectFocus: {
      slotKey: "project_focus",
      itemId: null,
      projectId: "project-yike",
      filledReason: "auto",
      project: projects[0],
    },
    emptySlots: [],
  },
  lanes: {
    planned: { items: plannedItems, hiddenCount: 0 },
    doing: { items: doingItems, hiddenCount: 0 },
    delegated: { items: delegatedItems, hiddenCount: 0 },
    done: { items: doneItems, hiddenCount: 0 },
  },
  reminders: {
    urgent: allItems.filter((i) => i.isUrgent && i.status !== "done"),
    dueSoon: allItems.filter((i) => i.dueDate && i.status !== "done"),
    projectsMissingNextTask: [projects[1]],
    memosSuggestSplit: allItems.filter((i) => i.memoGranularity === "multiple"),
  },
  drawerData: {
    areas,
    projects,
    people,
  },
};
