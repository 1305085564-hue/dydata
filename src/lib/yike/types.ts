export const YIKE_ITEM_STATUSES = ["planned", "doing", "delegated", "done"] as const;
export const YIKE_ITEM_TYPES = ["task", "memo"] as const;
export const YIKE_COMPLEXITIES = ["deep", "focus", "small", "quick"] as const;
export const YIKE_TIME_BUCKETS = ["today", "tomorrow", "this_week", "this_month", "later"] as const;
export const YIKE_MEMO_GRANULARITIES = ["single", "multiple", "unknown"] as const;
export const YIKE_NATURES = ["task", "project", "memo"] as const;
export const YIKE_EXECUTION_SLOT_KEYS = ["primary_task", "candidate_1", "candidate_2", "project_focus"] as const;

export type YikeItemStatus = (typeof YIKE_ITEM_STATUSES)[number];
export type YikeItemType = (typeof YIKE_ITEM_TYPES)[number];
export type YikeComplexity = (typeof YIKE_COMPLEXITIES)[number];
export type YikeTimeBucket = (typeof YIKE_TIME_BUCKETS)[number];
export type YikeMemoGranularity = (typeof YIKE_MEMO_GRANULARITIES)[number];
export type YikeNature = (typeof YIKE_NATURES)[number];
export type YikeExecutionSlotKey = (typeof YIKE_EXECUTION_SLOT_KEYS)[number];

export type YikeActor = {
  userId: string;
};

export type YikeWorkspaceContext = YikeActor & {
  workspaceId: string;
};

export type YikeApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export type YikeApiError = {
  code: YikeApiErrorCode;
  message: string;
  details?: unknown;
};

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: YikeApiError };

export type YikeQuickCreateInput = {
  rawText: string;
  clientRequestId?: string;
};

export type YikeCreateItemInput = {
  rawText: string | null;
  title: string;
  note: string | null;
  itemType: YikeItemType;
  status: YikeItemStatus;
  timeBucket: YikeTimeBucket;
  complexity: YikeComplexity;
  memoGranularity: YikeMemoGranularity;
  areaId: string | null;
  projectId: string | null;
  dueDate: string | null;
  isUrgent: boolean;
  assigneePersonId: string | null;
  delegatedNote: string | null;
  followUpBucket: YikeTimeBucket | null;
  clientRequestId: string | null;
};

export type YikeTransitionInput = {
  toStatus: YikeItemStatus;
};

export type YikeUpdateItemInput = Partial<{
  rawText: string | null;
  title: string;
  note: string | null;
  itemType: YikeItemType;
  status: YikeItemStatus;
  timeBucket: YikeTimeBucket;
  complexity: YikeComplexity;
  memoGranularity: YikeMemoGranularity;
  areaId: string | null;
  projectId: string | null;
  dueDate: string | null;
  isUrgent: boolean;
  assigneePersonId: string | null;
  delegatedNote: string | null;
  followUpBucket: YikeTimeBucket | null;
}>;

export type YikeFocusCompleteInput = {
  itemId: string;
  continueWithItemId: string | null;
};

export type YikeFocusReplaceInput = {
  slotKey: Extract<YikeExecutionSlotKey, "primary_task" | "candidate_1" | "candidate_2">;
  itemId: string;
};

export type YikeAreaInput = {
  name: string;
  sortOrder: number;
  color?: string | null;
};

export type YikeAreaUpdateInput = Partial<{
  name: string;
  sortOrder: number;
  archived: boolean;
  color: string | null;
}>;

export type YikeAreaReorderInput = {
  areas: Array<{ id: string; sortOrder: number }>;
};

export type YikeProjectInput = {
  name: string;
  areaId: string | null;
  goalNote: string | null;
  acceptanceCriteria: string | null;
  nextTaskTitle: string | null;
};

export type YikeProjectUpdateInput = Partial<{
  name: string;
  areaId: string | null;
  goalNote: string | null;
  acceptanceCriteria: string | null;
  nextTaskId: string | null;
  archived: boolean;
}>;

export type YikeProjectTaskInput = {
  title: string;
  note: string | null;
  complexity: YikeComplexity;
  timeBucket: YikeTimeBucket;
  setAsNextTask: boolean;
};

export type YikeSetProjectNextTaskInput = {
  nextTaskId: string | null;
};

export type YikePersonInput = {
  name: string;
  sortOrder: number;
};

export type YikePersonUpdateInput = Partial<{
  name: string;
  sortOrder: number;
  archived: boolean;
}>;

export type YikeMemoSplitInput = {
  tasks: Array<{ title: string; note: string | null }>;
  archiveSourceMemo: boolean;
};

export type YikeSortableCard = {
  id: string;
  areaSortOrder: number | null;
  complexity: YikeComplexity;
  nature: YikeNature;
  createdAt: string;
  isUrgent: boolean;
  dueDate: string | null;
};

export type YikeItemRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  item_type: YikeItemType;
  status: YikeItemStatus;
  title: string;
  note: string | null;
  raw_input: string | null;
  area_id: string | null;
  project_id: string | null;
  complexity: YikeComplexity;
  time_bucket: YikeTimeBucket;
  bucket_anchor_date: string | null;
  due_date: string | null;
  is_urgent: boolean;
  memo_granularity: YikeMemoGranularity;
  assignee_person_id: string | null;
  delegated_note: string | null;
  follow_up_bucket: YikeTimeBucket | null;
  source_memo_id: string | null;
  client_request_id: string | null;
  completed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type YikeItemDTO = {
  id: string;
  itemType: YikeItemType;
  status: YikeItemStatus;
  title: string;
  note: string | null;
  rawInput: string | null;
  areaId: string | null;
  projectId: string | null;
  complexity: YikeComplexity;
  timeBucket: YikeTimeBucket;
  bucketAnchorDate: string | null;
  dueDate: string | null;
  isUrgent: boolean;
  memoGranularity: YikeMemoGranularity;
  assigneePersonId: string | null;
  delegatedNote: string | null;
  followUpBucket: YikeTimeBucket | null;
  sourceMemoId: string | null;
  clientRequestId: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type YikeItemInsert = {
  workspace_id: string;
  user_id: string;
  item_type: YikeItemType;
  status: YikeItemStatus;
  title: string;
  note: string | null;
  raw_input: string | null;
  area_id: string | null;
  project_id: string | null;
  complexity: YikeComplexity;
  time_bucket: YikeTimeBucket;
  due_date: string | null;
  is_urgent: boolean;
  memo_granularity: YikeMemoGranularity;
  assignee_person_id: string | null;
  delegated_note: string | null;
  follow_up_bucket: YikeTimeBucket | null;
  client_request_id: string | null;
  source_memo_id?: string | null;
};

export type YikeWorkspaceDTO = {
  id: string;
  name: string;
};

export type YikeAreaRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  sort_order: number;
  color: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type YikeAreaDTO = {
  id: string;
  name: string;
  sortOrder: number;
  color: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type YikeProjectRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  area_id: string | null;
  name: string;
  goal_note: string | null;
  acceptance_criteria: string | null;
  next_task_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type YikeProjectDTO = {
  id: string;
  areaId: string | null;
  name: string;
  goalNote: string | null;
  acceptanceCriteria: string | null;
  nextTaskId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type YikePersonRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type YikePersonDTO = {
  id: string;
  name: string;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type YikeExecutionSlotRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  slot_key: YikeExecutionSlotKey;
  item_id: string | null;
  project_id: string | null;
  filled_reason: "auto" | "manual";
  filled_at: string;
  created_at: string;
  updated_at: string;
};

export type YikeWorkbenchCard = YikeItemDTO & {
  nature: YikeNature;
  areaSortOrder: number | null;
  visualWeight: "normal" | "light";
  requiresConfirmation: boolean;
  reminder: {
    isUrgent: boolean;
    dueState: "none" | "overdue" | "due_today" | "upcoming";
  };
  suggestSplit: boolean;
};

export type YikeWorkbenchLane = {
  items: YikeWorkbenchCard[];
  hiddenCount: number;
};

export type YikeProjectFocusCard = {
  project: YikeProjectDTO;
  nextTask: YikeWorkbenchCard;
  requiresConfirmation: boolean;
  needsNextTask: boolean;
} | null;

export type YikeWorkbenchPayload = {
  workspace: YikeWorkspaceDTO;
  today: string;
  execution: {
    primaryTask: YikeWorkbenchCard | null;
    candidateTasks: YikeWorkbenchCard[];
    recommendedTasks: YikeWorkbenchCard[];
    projectFocus: YikeProjectFocusCard;
    emptySlots: YikeExecutionSlotKey[];
  };
  lanes: Record<YikeItemStatus, YikeWorkbenchLane>;
  reminders: {
    urgent: YikeWorkbenchCard[];
    dueSoon: YikeWorkbenchCard[];
    projectsMissingNextTask: YikeProjectDTO[];
    memosSuggestSplit: YikeWorkbenchCard[];
  };
  drawerData: {
    areas: YikeAreaDTO[];
    projects: YikeProjectDTO[];
    people: YikePersonDTO[];
  };
};
