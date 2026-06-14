import { z } from "zod";

import {
  YIKE_COMPLEXITIES,
  YIKE_EXECUTION_SLOT_KEYS,
  YIKE_ITEM_STATUSES,
  YIKE_ITEM_TYPES,
  YIKE_MEMO_GRANULARITIES,
  YIKE_TIME_BUCKETS,
  type ValidationResult,
  type YikeAreaInput,
  type YikeAreaReorderInput,
  type YikeAreaUpdateInput,
  type YikeCreateItemInput,
  type YikeFocusCompleteInput,
  type YikeFocusReplaceInput,
  type YikeMemoSplitInput,
  type YikePersonInput,
  type YikePersonUpdateInput,
  type YikeProjectInput,
  type YikeProjectTaskInput,
  type YikeProjectUpdateInput,
  type YikeQuickCreateInput,
  type YikeSetProjectNextTaskInput,
  type YikeTransitionInput,
  type YikeUpdateItemInput,
} from "./types";
import { yikeError } from "./errors";

const uuidSchema = z.uuid();
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期必须是 YYYY-MM-DD");

function optionalTrimmedString(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength)
    .optional()
    .nullable()
    .transform((value) => {
      if (value === undefined || value === null || value === "") return null;
      return value;
    });
}

function optionalUuid() {
  return z
    .union([uuidSchema, z.literal(""), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" && value ? value : null));
}

function optionalDateOnly() {
  return z
    .union([dateOnlySchema, z.literal(""), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" && value ? value : null));
}

function archivedAtFromFlag(value: boolean | undefined) {
  if (value === undefined) return undefined;
  return value ? new Date().toISOString() : null;
}

function firstIssueMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "请求体格式不正确";
}

function issueDetails(error: z.ZodError) {
  const details: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path[0] ? String(issue.path[0]) : "body";
    details[key] = [...(details[key] ?? []), issue.message];
  }

  return details;
}

function toValidationError<T>(error: z.ZodError): ValidationResult<T> {
  return {
    ok: false,
    error: yikeError("VALIDATION_ERROR", firstIssueMessage(error), issueDetails(error)),
  };
}

function buildTitle(rawText: string | null, title: string | null) {
  const source = title ?? rawText ?? "";
  return source.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 120) ?? "";
}

const quickCreateSchema = z.object({
  rawText: z.string().trim().min(1, "rawText 不能为空").max(2000, "rawText 最多 2000 字"),
  clientRequestId: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .transform((value) => value || undefined),
});

const createItemSchema = z
  .object({
    rawText: optionalTrimmedString(2000),
    title: optionalTrimmedString(120),
    note: optionalTrimmedString(5000),
    itemType: z.enum(YIKE_ITEM_TYPES).default("memo"),
    status: z.enum(YIKE_ITEM_STATUSES).default("planned"),
    timeBucket: z.enum(YIKE_TIME_BUCKETS).default("today"),
    complexity: z.enum(YIKE_COMPLEXITIES).default("small"),
    memoGranularity: z.enum(YIKE_MEMO_GRANULARITIES).default("unknown"),
    areaId: optionalUuid(),
    projectId: optionalUuid(),
    dueDate: optionalDateOnly(),
    isUrgent: z.boolean().default(false),
    assigneePersonId: optionalUuid(),
    delegatedNote: optionalTrimmedString(2000),
    followUpBucket: z
      .union([z.enum(YIKE_TIME_BUCKETS), z.literal(""), z.null(), z.undefined()])
      .transform((value) => (typeof value === "string" && value ? value : null)),
    clientRequestId: optionalTrimmedString(120),
  })
  .transform((value) => ({
    ...value,
    title: buildTitle(value.rawText, value.title),
  }))
  .refine((value) => value.title.length > 0 || Boolean(value.rawText), {
    path: ["title"],
    message: "title 或 rawText 至少提供一个",
  });

const transitionSchema = z.object({
  toStatus: z.enum(YIKE_ITEM_STATUSES, { error: "toStatus 不合法" }),
});

const updateItemSchema = z
  .object({
    rawText: optionalTrimmedString(2000),
    title: optionalTrimmedString(120),
    note: optionalTrimmedString(5000),
    itemType: z.enum(YIKE_ITEM_TYPES).optional(),
    status: z.enum(YIKE_ITEM_STATUSES).optional(),
    timeBucket: z.enum(YIKE_TIME_BUCKETS).optional(),
    complexity: z.enum(YIKE_COMPLEXITIES).optional(),
    memoGranularity: z.enum(YIKE_MEMO_GRANULARITIES).optional(),
    areaId: optionalUuid(),
    projectId: optionalUuid(),
    dueDate: optionalDateOnly(),
    isUrgent: z.boolean().optional(),
    assigneePersonId: optionalUuid(),
    delegatedNote: optionalTrimmedString(2000),
    followUpBucket: z
      .union([z.enum(YIKE_TIME_BUCKETS), z.literal(""), z.null(), z.undefined()])
      .transform((value) => (typeof value === "string" && value ? value : null)),
  })
  .transform((value) => {
    const output: YikeUpdateItemInput = {};
    if (value.rawText !== undefined) output.rawText = value.rawText;
    if (value.title !== undefined && value.title !== null) output.title = value.title;
    if (value.note !== undefined) output.note = value.note;
    if (value.itemType !== undefined) output.itemType = value.itemType;
    if (value.status !== undefined) output.status = value.status;
    if (value.timeBucket !== undefined) output.timeBucket = value.timeBucket;
    if (value.complexity !== undefined) output.complexity = value.complexity;
    if (value.memoGranularity !== undefined) output.memoGranularity = value.memoGranularity;
    if (value.areaId !== undefined) output.areaId = value.areaId;
    if (value.projectId !== undefined) output.projectId = value.projectId;
    if (value.dueDate !== undefined) output.dueDate = value.dueDate;
    if (value.isUrgent !== undefined) output.isUrgent = value.isUrgent;
    if (value.assigneePersonId !== undefined) output.assigneePersonId = value.assigneePersonId;
    if (value.delegatedNote !== undefined) output.delegatedNote = value.delegatedNote;
    if (value.followUpBucket !== undefined) output.followUpBucket = value.followUpBucket;
    return output;
  })
  .refine((value) => Object.keys(value).length > 0, {
    path: ["body"],
    message: "至少提供一个要更新的字段",
  });

const focusCompleteSchema = z.object({
  itemId: uuidSchema,
  continueWithItemId: optionalUuid(),
});

const focusReplaceSchema = z.object({
  slotKey: z.enum(YIKE_EXECUTION_SLOT_KEYS).refine((value) => value !== "project_focus", {
    message: "slotKey 只能是 primary_task/candidate_1/candidate_2",
  }),
  itemId: uuidSchema,
});

const areaSchema = z.object({
  name: z.string().trim().min(1, "name 不能为空").max(80, "name 最多 80 字"),
  sortOrder: z.number().int().min(0).max(999999).default(1000),
  color: z.string().trim().max(32).nullable().optional(),
});

const areaUpdateSchema = z
  .object({
    name: optionalTrimmedString(80),
    sortOrder: z.number().int().min(0).max(999999).optional(),
    archived: z.boolean().optional(),
    color: z.string().trim().max(32).nullable().optional(),
  })
  .transform((value) => ({
    ...(value.name !== undefined && value.name !== null ? { name: value.name } : {}),
    ...(value.sortOrder !== undefined ? { sortOrder: value.sortOrder } : {}),
    ...(value.archived !== undefined ? { archived: value.archived } : {}),
    ...(value.color !== undefined ? { color: value.color } : {}),
  }))
  .refine((value) => Object.keys(value).length > 0, {
    path: ["body"],
    message: "至少提供一个要更新的字段",
  });

const areaReorderSchema = z.object({
  areas: z
    .array(z.object({ id: uuidSchema, sortOrder: z.number().int().min(0).max(999999) }))
    .min(1, "areas 不能为空")
    .max(200, "一次最多排序 200 个领域"),
});

const projectSchema = z.object({
  name: z.string().trim().min(1, "name 不能为空").max(120, "name 最多 120 字"),
  areaId: optionalUuid(),
  goalNote: optionalTrimmedString(5000),
  acceptanceCriteria: optionalTrimmedString(5000),
  nextTaskTitle: optionalTrimmedString(120),
});

const projectUpdateSchema = z
  .object({
    name: optionalTrimmedString(120),
    areaId: optionalUuid(),
    goalNote: optionalTrimmedString(5000),
    acceptanceCriteria: optionalTrimmedString(5000),
    nextTaskId: optionalUuid(),
    archived: z.boolean().optional(),
  })
  .transform((value) => {
    const output: YikeProjectUpdateInput = {};
    if (value.name !== undefined && value.name !== null) output.name = value.name;
    if (value.areaId !== undefined) output.areaId = value.areaId;
    if (value.goalNote !== undefined) output.goalNote = value.goalNote;
    if (value.acceptanceCriteria !== undefined) output.acceptanceCriteria = value.acceptanceCriteria;
    if (value.nextTaskId !== undefined) output.nextTaskId = value.nextTaskId;
    if (value.archived !== undefined) output.archived = value.archived;
    return output;
  })
  .refine((value) => Object.keys(value).length > 0, {
    path: ["body"],
    message: "至少提供一个要更新的字段",
  });

const projectTaskSchema = z.object({
  title: z.string().trim().min(1, "title 不能为空").max(120, "title 最多 120 字"),
  note: optionalTrimmedString(5000),
  complexity: z.enum(YIKE_COMPLEXITIES).default("small"),
  timeBucket: z.enum(YIKE_TIME_BUCKETS).default("today"),
  setAsNextTask: z.boolean().default(false),
});

const setProjectNextTaskSchema = z.object({
  nextTaskId: optionalUuid(),
});

const personSchema = z.object({
  name: z.string().trim().min(1, "name 不能为空").max(80, "name 最多 80 字"),
  sortOrder: z.number().int().min(0).max(999999).default(1000),
});

const personUpdateSchema = z
  .object({
    name: optionalTrimmedString(80),
    sortOrder: z.number().int().min(0).max(999999).optional(),
    archived: z.boolean().optional(),
  })
  .transform((value) => ({
    ...(value.name !== undefined && value.name !== null ? { name: value.name } : {}),
    ...(value.sortOrder !== undefined ? { sortOrder: value.sortOrder } : {}),
    ...(value.archived !== undefined ? { archived: value.archived } : {}),
  }))
  .refine((value) => Object.keys(value).length > 0, {
    path: ["body"],
    message: "至少提供一个要更新的字段",
  });

const memoSplitSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1, "title 不能为空").max(120, "title 最多 120 字"),
        note: optionalTrimmedString(5000),
      }),
    )
    .min(1, "tasks 不能为空")
    .max(20, "一次最多拆 20 个任务"),
  archiveSourceMemo: z.boolean().default(false),
});

export function validateQuickCreateInput(body: unknown): ValidationResult<YikeQuickCreateInput> {
  const result = quickCreateSchema.safeParse(body);
  if (!result.success) return toValidationError(result.error);
  return { ok: true, data: result.data };
}

export function validateCreateItemInput(body: unknown): ValidationResult<YikeCreateItemInput> {
  const result = createItemSchema.safeParse(body);
  if (!result.success) return toValidationError(result.error);
  return { ok: true, data: result.data };
}

export function validateTransitionInput(body: unknown): ValidationResult<YikeTransitionInput> {
  const result = transitionSchema.safeParse(body);
  if (!result.success) return toValidationError(result.error);
  return { ok: true, data: result.data };
}

export function validateUpdateItemInput(body: unknown): ValidationResult<YikeUpdateItemInput> {
  const result = updateItemSchema.safeParse(body);
  if (!result.success) return toValidationError(result.error);
  return { ok: true, data: result.data };
}

export function validateFocusCompleteInput(body: unknown): ValidationResult<YikeFocusCompleteInput> {
  const result = focusCompleteSchema.safeParse(body);
  if (!result.success) return toValidationError(result.error);
  return { ok: true, data: result.data };
}

export function validateFocusReplaceInput(body: unknown): ValidationResult<YikeFocusReplaceInput> {
  const result = focusReplaceSchema.safeParse(body);
  if (!result.success) return toValidationError(result.error);
  return { ok: true, data: result.data as YikeFocusReplaceInput };
}

export function validateAreaInput(body: unknown): ValidationResult<YikeAreaInput> {
  const result = areaSchema.safeParse(body);
  if (!result.success) return toValidationError(result.error);
  return { ok: true, data: result.data };
}

export function validateAreaUpdateInput(body: unknown): ValidationResult<YikeAreaUpdateInput> {
  const result = areaUpdateSchema.safeParse(body);
  if (!result.success) return toValidationError(result.error);
  return { ok: true, data: result.data };
}

export function validateAreaReorderInput(body: unknown): ValidationResult<YikeAreaReorderInput> {
  const result = areaReorderSchema.safeParse(body);
  if (!result.success) return toValidationError(result.error);
  return { ok: true, data: result.data };
}

export function validateProjectInput(body: unknown): ValidationResult<YikeProjectInput> {
  const result = projectSchema.safeParse(body);
  if (!result.success) return toValidationError(result.error);
  return { ok: true, data: result.data };
}

export function validateProjectUpdateInput(body: unknown): ValidationResult<YikeProjectUpdateInput> {
  const result = projectUpdateSchema.safeParse(body);
  if (!result.success) return toValidationError(result.error);
  return { ok: true, data: result.data };
}

export function validateProjectTaskInput(body: unknown): ValidationResult<YikeProjectTaskInput> {
  const result = projectTaskSchema.safeParse(body);
  if (!result.success) return toValidationError(result.error);
  return { ok: true, data: result.data };
}

export function validateSetProjectNextTaskInput(body: unknown): ValidationResult<YikeSetProjectNextTaskInput> {
  const result = setProjectNextTaskSchema.safeParse(body);
  if (!result.success) return toValidationError(result.error);
  return { ok: true, data: result.data };
}

export function validatePersonInput(body: unknown): ValidationResult<YikePersonInput> {
  const result = personSchema.safeParse(body);
  if (!result.success) return toValidationError(result.error);
  return { ok: true, data: result.data };
}

export function validatePersonUpdateInput(body: unknown): ValidationResult<YikePersonUpdateInput> {
  const result = personUpdateSchema.safeParse(body);
  if (!result.success) return toValidationError(result.error);
  return { ok: true, data: result.data };
}

export function validateMemoSplitInput(body: unknown): ValidationResult<YikeMemoSplitInput> {
  const result = memoSplitSchema.safeParse(body);
  if (!result.success) return toValidationError(result.error);
  return { ok: true, data: result.data };
}

export function toArchivedAtUpdate(archived: boolean | undefined) {
  return archivedAtFromFlag(archived);
}
