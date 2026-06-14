import * as React from "react";

export type YikeItemStatus = "planned" | "doing" | "delegated" | "done";
export type YikeItemType = "task" | "memo";
export type YikeComplexity = "deep" | "focus" | "small" | "quick";
export type YikeTimeBucket = "today" | "tomorrow" | "this_week" | "this_month" | "later";
export type YikeMemoGranularity = "single" | "multiple" | "unknown";
export type ExecutionSlotKey = "primary_task" | "candidate_1" | "candidate_2" | "project_focus";

export interface YikeArea {
  id: string;
  name: string;
  sortOrder: number;
}

export interface YikeProject {
  id: string;
  name: string;
  nextTaskId: string | null;
  nextTaskTitle?: string | null;
  areaId?: string | null;
}

export interface YikePerson {
  id: string;
  name: string;
}

export interface YikeItem {
  id: string;
  itemType: YikeItemType;
  status: YikeItemStatus;
  title: string;
  note: string | null;
  rawInput: string | null;
  areaId: string | null;
  areaName?: string | null;
  projectId: string | null;
  projectName?: string | null;
  complexity: YikeComplexity;
  timeBucket: YikeTimeBucket;
  dueDate: string | null;
  isUrgent: boolean;
  memoGranularity: YikeMemoGranularity;
  assigneePersonId: string | null;
  assigneeName?: string | null;
  delegatedNote: string | null;
  followUpBucket: YikeTimeBucket | null;
  sourceMemoId: string | null;
  completedAt: string | null;
  createdAt: string;
  requiresConfirmation?: boolean;
}

export interface ExecutionSlot {
  slotKey: ExecutionSlotKey;
  itemId: string | null;
  projectId: string | null;
  filledReason: "auto" | "manual";
  item?: YikeItem | null;
  project?: YikeProject | null;
  requiresConfirmation?: boolean;
}

export interface ExecutionArea {
  primaryTask: ExecutionSlot | null;
  candidateTasks: ExecutionSlot[];
  recommendedTasks: YikeItem[];
  projectFocus: ExecutionSlot | null;
  emptySlots: ExecutionSlotKey[];
}

export interface YikeLane {
  items: YikeItem[];
  hiddenCount: number;
}

export interface YikeWorkbench {
  workspace: { id: string; name: string };
  today: string;
  execution: ExecutionArea;
  lanes: {
    planned: YikeLane;
    doing: YikeLane;
    delegated: YikeLane;
    done: YikeLane;
  };
  reminders: {
    urgent: YikeItem[];
    dueSoon: YikeItem[];
    projectsMissingNextTask: YikeProject[];
    memosSuggestSplit: YikeItem[];
  };
  drawerData: {
    areas: YikeArea[];
    projects: YikeProject[];
    people: YikePerson[];
  };
}

export const STATUS_LABELS: Record<YikeItemStatus, string> = {
  planned: "计划做",
  doing: "正在做",
  delegated: "别人做",
  done: "做完了",
};

export const STATUS_SHORT_LABELS: Record<YikeItemStatus, string> = {
  planned: "计划",
  doing: "进行",
  delegated: "委托",
  done: "完成",
};

export const COMPLEXITY_LABELS: Record<YikeComplexity, string> = {
  deep: "深度",
  focus: "专注",
  small: "小事",
  quick: "随手",
};

export const TIME_BUCKET_LABELS: Record<YikeTimeBucket, string> = {
  today: "今天",
  tomorrow: "明天",
  this_week: "本周",
  this_month: "本月",
  later: "以后",
};

export const ITEM_TYPE_LABELS: Record<YikeItemType, string> = {
  task: "任务",
  memo: "备忘",
};

/** 允许的状态流转 */
export const ALLOWED_TRANSITIONS: Record<YikeItemStatus, YikeItemStatus[]> = {
  planned: ["doing", "delegated", "done"],
  doing: ["done", "delegated", "planned"],
  delegated: ["done", "planned"],
  done: ["planned"],
};

export interface TransitionAction {
  target: YikeItemStatus;
  label: string;
  variant: "default" | "secondary" | "outline";
}

export const TRANSITION_ACTIONS: Record<YikeItemStatus, TransitionAction[]> = {
  planned: [
    { target: "doing", label: "开始", variant: "default" },
    { target: "delegated", label: "委托", variant: "outline" },
    { target: "done", label: "完成", variant: "secondary" },
  ],
  doing: [
    { target: "done", label: "完成", variant: "default" },
    { target: "delegated", label: "转委托", variant: "outline" },
    { target: "planned", label: "放回计划", variant: "secondary" },
  ],
  delegated: [
    { target: "done", label: "已完成", variant: "default" },
    { target: "planned", label: "收回", variant: "secondary" },
  ],
  done: [
    { target: "planned", label: "重做", variant: "secondary" },
  ],
};
