export type YikeItemStatus = "planned" | "doing" | "delegated" | "done";
export type YikeItemType = "task" | "memo";
export type YikeComplexity = "deep" | "focus" | "small" | "quick";
export type YikeTimeBucket = "today" | "tomorrow" | "this_week" | "this_month" | "later";
export type YikeMemoGranularity = "single" | "multiple" | "unknown";
export type ExecutionSlotKey = "primary_task" | "candidate_1" | "candidate_2" | "project_focus";

export const YIKE_COMPLEXITIES: YikeComplexity[] = ["deep", "focus", "small", "quick"];
export const YIKE_TIME_BUCKETS: YikeTimeBucket[] = ["today", "tomorrow", "this_week", "this_month", "later"];

/** 提交给 PATCH /items/:id 的字段子集（前端可编辑部分） */
export interface YikeUpdatePayload {
  title?: string;
  note?: string | null;
  complexity?: YikeComplexity;
  timeBucket?: YikeTimeBucket;
  areaId?: string | null;
  projectId?: string | null;
  dueDate?: string | null;
  isUrgent?: boolean;
  assigneePersonId?: string | null;
}

export interface YikeArea {
  id: string;
  name: string;
  sortOrder: number;
  color: string | null;
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
  areaColor?: string | null;
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

export interface YikeProjectFocus {
  projectId: string;
  projectName: string;
  nextTaskId: string | null;
  nextTaskTitle: string | null;
}

/** 执行区不再是独立数据，只是状态栏的「聚光灯」：用 id 标记栏内某几条。 */
export interface ExecutionSpotlight {
  /** 正在做栏里被提为焦点的那条（默认 = doing 栏首条） */
  primaryTaskId: string | null;
  /** 计划做栏里被标为候选的事项 id */
  candidateTaskIds: string[];
  /** 完成焦点后可继续做的推荐项（来自计划做栏） */
  recommendedTasks: YikeItem[];
  /** 当前聚焦的项目推进 */
  projectFocus: YikeProjectFocus | null;
}

export interface YikeLane {
  items: YikeItem[];
  hiddenCount: number;
}

export interface YikeWorkbench {
  workspace: { id: string; name: string };
  today: string;
  execution: ExecutionSpotlight;
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
