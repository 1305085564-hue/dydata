import { createClient as createServiceRoleClient } from "@supabase/supabase-js";

import { callAi, extractJsonString, type AiMessage } from "@/lib/ai/client";
import { createClient } from "@/lib/supabase/server";
import { toBoolean, toTrimmedString } from "@/lib/type-guards";
import type { UserRole } from "@/types";

type MinimalClient = ReturnType<typeof createServiceRoleClient>;

type RewriteFeatureRow = {
  feature_key: string;
  label: string;
  system_prompt: string | null;
  is_enabled: boolean;
};

type RewriteModelViewRow = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_enabled: boolean;
  is_default: boolean;
};

type RewriteModeRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  mode_prompt: string;
  sort_order: number;
  is_enabled: boolean;
  is_default: boolean;
};

type RewriteFixedModeRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  fixed_prompt: string;
  model_view_id: string;
  length_preset_id: string | null;
  sort_order: number;
  is_enabled: boolean;
};

type RewriteLengthPresetRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  length_prompt: string;
  sort_order: number;
  is_enabled: boolean;
  is_default: boolean;
};

type RewriteWorkflowRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_enabled: boolean;
  is_default: boolean;
};

type RewriteWorkflowStepRow = {
  id: string;
  workflow_id: string;
  model_view_id: string | null;
  step_key: string;
  name: string;
  description: string | null;
  step_prompt: string;
  sort_order: number;
  is_enabled: boolean;
};

type RewriteRouteJoin = {
  id: string;
  name: string;
  is_enabled: boolean;
} | null;

type RewriteModelRouteRow = {
  id: string;
  model_view_id: string;
  workflow_step_id: string | null;
  channel_id: string;
  actual_model: string;
  priority: number;
  weight: number;
  is_enabled: boolean;
  channel: RewriteRouteJoin | RewriteRouteJoin[] | null;
};

type RewriteConversationRow = {
  id: string;
  user_id: string;
  title: string;
  auto_mode_enabled: boolean;
  selected_fixed_mode_id: string | null;
  selected_model_view_id: string | null;
  selected_mode_id: string | null;
  selected_length_preset_id: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
};

type RewriteMessageRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant" | "system_note";
  generation_mode: "auto" | "single" | null;
  message_status: "success" | "partial_success" | "failed" | null;
  content: string;
  structured_result: Record<string, unknown> | null;
  request_snapshot: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

export type RewriteActor = {
  userId: string;
  name: string | null;
  role: UserRole;
};

export type RewriteModelOption = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  isDefault: boolean;
};

export type RewriteModeOption = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isDefault: boolean;
};

export type RewriteFixedModeOption = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
  modelViewId: string;
  lengthPresetId: string | null;
};

export type RewriteLengthPresetOption = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isDefault: boolean;
};

export type RewriteWorkflowStepOption = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
  modelViewId: string | null;
};

export type RewriteWorkflowOption = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  steps: RewriteWorkflowStepOption[];
};

export type RewriteBootstrapPayload = {
  feature: {
    key: string;
    label: string;
    enabled: boolean;
  };
  defaults: {
    autoModeEnabled: boolean;
    fixedModeId: string | null;
    modelViewId: string | null;
    modeId: string | null;
    lengthPresetId: string | null;
    workflowId: string | null;
  };
  fixedModes: RewriteFixedModeOption[];
  modelViews: RewriteModelOption[];
  modes: RewriteModeOption[];
  lengthPresets: RewriteLengthPresetOption[];
  workflow: RewriteWorkflowOption | null;
};

type RewriteConfigBundle = {
  feature: RewriteFeatureRow | null;
  modelViews: RewriteModelViewRow[];
  fixedModes: RewriteFixedModeRow[];
  modes: RewriteModeRow[];
  lengthPresets: RewriteLengthPresetRow[];
  workflow: RewriteWorkflowRow | null;
  workflowSteps: RewriteWorkflowStepRow[];
};

type RewriteSelectionInput = {
  autoModeEnabled?: boolean;
  fixedModeId?: string | null;
  fixedModeKey?: string | null;
  modelViewId?: string | null;
  modelViewKey?: string | null;
  modeId?: string | null;
  modeKey?: string | null;
  lengthPresetId?: string | null;
  lengthPresetKey?: string | null;
};

type RewriteResolvedSelections = {
  fixedMode: RewriteFixedModeRow | null;
  modelView: RewriteModelViewRow;
  mode: RewriteModeRow | null;
  lengthPreset: RewriteLengthPresetRow;
  workflow: RewriteWorkflowRow | null;
  workflowSteps: RewriteWorkflowStepRow[];
  autoModeEnabled: boolean;
};

type RewriteVersion = {
  title: string;
  content: string;
};

export type RewriteResponseMode = "chat" | "versions";

export type RewriteRequestSnapshot = {
  autoModeEnabled: boolean | null;
  fixedModeId: string | null;
  modelViewId: string | null;
  modeId: string | null;
  lengthPresetId: string | null;
  workflowId: string | null;
};

export type NormalizedRewriteResult = {
  responseMode: RewriteResponseMode;
  title: string | null;
  summary: string | null;
  versions: RewriteVersion[];
  notes: string[];
  followUpSuggestions: string[];
  recommendedText: string;
};

type RewriteStepExecution = {
  stepKey: string;
  stepName: string;
  description: string | null;
  status: "pending" | "success" | "failed";
  modelViewId: string | null;
  modelViewKey: string | null;
  modelViewLabel: string | null;
  routeId: string | null;
  channelId: string | null;
  channelName: string | null;
  actualModel: string | null;
  elapsedMs: number | null;
  rawContent: string | null;
  normalizedResult: NormalizedRewriteResult | null;
  errorMessage: string | null;
};

export type RewriteStructuredSelection = {
  autoModeEnabled: boolean;
  fixedModeId: string | null;
  modelViewId: string | null;
  modeId: string | null;
  lengthPresetId: string | null;
  workflowId: string | null;
  fixedMode: Pick<RewriteFixedModeOption, "id" | "key" | "name" | "description" | "isEnabled"> | null;
  modelView: Pick<RewriteModelOption, "id" | "key" | "label" | "description" | "isDefault"> | null;
  mode: Pick<RewriteModeOption, "id" | "key" | "name" | "description" | "isDefault"> | null;
  lengthPreset:
    | Pick<RewriteLengthPresetOption, "id" | "key" | "name" | "description" | "isDefault">
    | null;
  workflow: {
    id: string;
    key: string;
    name: string;
  } | null;
};

export type RewriteAssistantPayload = {
  generationMode: "auto" | "single";
  status: "success" | "partial_success" | "failed";
  selected: RewriteStructuredSelection;
  snapshots: {
    featureSystemPrompt: string | null;
    fixedModePrompt: string | null;
    modePrompt: string | null;
    lengthPrompt: string | null;
  };
  final: NormalizedRewriteResult;
  steps: Array<{
    stepKey: string;
    stepName: string;
    description: string | null;
    status: "pending" | "success" | "failed";
    modelViewId: string | null;
    modelViewKey: string | null;
    modelViewLabel: string | null;
    routeId: string | null;
    channelId: string | null;
    channelName: string | null;
    actualModel: string | null;
    elapsedMs: number | null;
    errorMessage: string | null;
    normalizedResult: NormalizedRewriteResult | null;
  }>;
};

export type RewriteConversationItem = {
  id: string;
  title: string;
  selected: Omit<RewriteStructuredSelection, "workflowId" | "workflow">;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
};

export type RewriteMessageItem = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system_note";
  generationMode: "auto" | "single" | null;
  status: "success" | "partial_success" | "failed" | null;
  content: string;
  structuredResult: RewriteAssistantPayload | null;
  requestSnapshot: RewriteRequestSnapshot | null;
  errorMessage: string | null;
  createdAt: string;
};

const REWRITE_CONVERSATION_SELECT =
  "id, user_id, title, auto_mode_enabled, selected_fixed_mode_id, selected_model_view_id, selected_mode_id, selected_length_preset_id, last_message_at, created_at, updated_at";
const REWRITE_MESSAGE_SELECT =
  "id, conversation_id, user_id, role, generation_mode, message_status, content, structured_result, request_snapshot, error_message, created_at";

let serviceClient: MinimalClient | null = null;
let rewriteAiCaller = callAi;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeJoinedRow<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function trimOrNull(value: unknown) {
  const text = toTrimmedString(value);
  return text || null;
}

function hasExplicitSelectionValue(value: unknown) {
  return value !== undefined;
}

function pickFirstNonEmptyStrings(value: unknown, limit = 6) {
  if (!Array.isArray(value)) return [] as string[];

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, limit);
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1))}…`;
}

function buildConversationTitle(seed: string) {
  const firstLine = seed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return truncateText(firstLine || "新会话", 18);
}

function pickRecommendedText(versions: RewriteVersion[]) {
  return versions[0]?.content ?? "";
}

function createChatResult(rawContent: string): NormalizedRewriteResult {
  const trimmed = rawContent.trim();
  return {
    responseMode: "chat",
    title: null,
    summary: null,
    versions: [],
    notes: [],
    followUpSuggestions: [],
    recommendedText: trimmed,
  };
}

function inferStoredResponseMode(value: Record<string, unknown>, versionsLength: number): RewriteResponseMode {
  if (value.responseMode === "chat" || value.responseMode === "versions") {
    return value.responseMode;
  }
  if (value.response_mode === "chat" || value.response_mode === "versions") {
    return value.response_mode;
  }
  return versionsLength > 0 ? "versions" : "chat";
}

function inferFollowUpResponseMode(userMessage: string): RewriteResponseMode {
  const normalized = userMessage.replace(/\s+/g, "").toLowerCase();
  const versionRequestPatterns = [
    /(重写|改写|重来|重新写|再写|另写).{0,8}(一版|两版|三版|\d+版|多个版本|几版)/,
    /(给我|给出|出|再出|重新出).{0,8}(一版|两版|三版|\d+版|多个版本|几版)/,
    /(多个版本|两个版本|三个版本|3个版本|2个版本|ab版|a\/b版|版本a|版本b)/,
  ];

  return versionRequestPatterns.some((pattern) => pattern.test(normalized)) ? "versions" : "chat";
}

function toModelOption(row: RewriteModelViewRow): RewriteModelOption {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description,
    isDefault: row.is_default,
  };
}

function toModeOption(row: RewriteModeRow): RewriteModeOption {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    isDefault: row.is_default,
  };
}

function toFixedModeOption(row: RewriteFixedModeRow): RewriteFixedModeOption {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    isEnabled: row.is_enabled,
    modelViewId: row.model_view_id,
    lengthPresetId: row.length_preset_id,
  };
}

function toLengthPresetOption(row: RewriteLengthPresetRow): RewriteLengthPresetOption {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    isDefault: row.is_default,
  };
}

function normalizeFixedModeOption(value: unknown): RewriteFixedModeOption | null {
  if (!isRecord(value)) return null;

  const id = trimOrNull(value.id);
  const key = trimOrNull(value.key);
  const name = trimOrNull(value.name);
  const modelViewId = trimOrNull(value.modelViewId);
  if (!id || !key || !name || !modelViewId) return null;

  return {
    id,
    key,
    name,
    description: trimOrNull(value.description),
    isEnabled: toBoolean(value.isEnabled, true),
    modelViewId,
    lengthPresetId: trimOrNull(value.lengthPresetId),
  };
}

function normalizeModelOption(value: unknown): RewriteModelOption | null {
  if (!isRecord(value)) return null;

  const id = trimOrNull(value.id);
  const key = trimOrNull(value.key);
  const label = trimOrNull(value.label);
  if (!id || !key || !label) return null;

  return {
    id,
    key,
    label,
    description: trimOrNull(value.description),
    isDefault: toBoolean(value.isDefault, false),
  };
}

function normalizeModeOption(value: unknown): RewriteModeOption | null {
  if (!isRecord(value)) return null;

  const id = trimOrNull(value.id);
  const key = trimOrNull(value.key);
  const name = trimOrNull(value.name);
  if (!id || !key || !name) return null;

  return {
    id,
    key,
    name,
    description: trimOrNull(value.description),
    isDefault: toBoolean(value.isDefault, false),
  };
}

function normalizeLengthPresetOption(value: unknown): RewriteLengthPresetOption | null {
  if (!isRecord(value)) return null;

  const id = trimOrNull(value.id);
  const key = trimOrNull(value.key);
  const name = trimOrNull(value.name);
  if (!id || !key || !name) return null;

  return {
    id,
    key,
    name,
    description: trimOrNull(value.description),
    isDefault: toBoolean(value.isDefault, false),
  };
}

function normalizeWorkflowSelection(
  value: unknown,
): {
  id: string;
  key: string;
  name: string;
} | null {
  if (!isRecord(value)) return null;

  const id = trimOrNull(value.id);
  const key = trimOrNull(value.key);
  const name = trimOrNull(value.name);
  if (!id || !key || !name) return null;

  return { id, key, name };
}

function normalizeRequestSnapshot(value: unknown): RewriteRequestSnapshot | null {
  if (!isRecord(value)) return null;

  const snapshot: RewriteRequestSnapshot = {
    autoModeEnabled:
      typeof value.autoModeEnabled === "boolean" ? value.autoModeEnabled : null,
    fixedModeId: trimOrNull(value.fixedModeId),
    modelViewId: trimOrNull(value.modelViewId),
    modeId: trimOrNull(value.modeId),
    lengthPresetId: trimOrNull(value.lengthPresetId),
    workflowId: trimOrNull(value.workflowId),
  };

  return Object.values(snapshot).some((item) => item !== null) ? snapshot : null;
}

export function normalizeStoredRewriteResult(
  value: unknown,
  fallbackContent = "",
  fallbackTitle = "版本A",
): NormalizedRewriteResult {
  if (typeof value === "string") {
    return normalizeRewriteResult(value, fallbackTitle);
  }

  if (!isRecord(value)) {
    return normalizeRewriteResult(fallbackContent, fallbackTitle);
  }

  const versions = Array.isArray(value.versions)
    ? value.versions
        .filter(isRecord)
        .map((item, index) => {
          const content = trimOrNull(item.content);
          if (!content) return null;
          return {
            title: trimOrNull(item.title) ?? `版本${String.fromCharCode(65 + index)}`,
            content,
          } satisfies RewriteVersion;
        })
        .filter((item): item is RewriteVersion => item !== null)
    : [];

  const fallbackText =
    trimOrNull(value.recommendedText) ??
    trimOrNull(value.recommended_text) ??
    trimOrNull(value.finalText) ??
    trimOrNull(value.final_text) ??
    trimOrNull(value.rewrite) ??
    trimOrNull(value.content) ??
    fallbackContent.trim();

  const responseMode = inferStoredResponseMode(value, versions.length);
  const safeVersions =
    responseMode === "versions"
      ? versions.length > 0
        ? versions
        : fallbackText
          ? [{ title: fallbackTitle, content: fallbackText }]
          : []
      : [];

  return {
    responseMode,
    title: trimOrNull(value.title),
    summary: trimOrNull(value.summary),
    versions: safeVersions,
    notes: pickFirstNonEmptyStrings(value.notes),
    followUpSuggestions: pickFirstNonEmptyStrings(
      value.followUpSuggestions ?? value.follow_up_suggestions,
    ),
    recommendedText:
      responseMode === "versions" ? pickRecommendedText(safeVersions) || fallbackText || "" : fallbackText || "",
  };
}

export function normalizeRewriteResult(
  rawContent: string,
  fallbackTitle = "版本A",
  responseMode: RewriteResponseMode = "versions",
): NormalizedRewriteResult {
  const trimmed = rawContent.trim();
  if (responseMode === "chat") {
    return createChatResult(trimmed);
  }

  const jsonString = extractJsonString(trimmed);

  if (!jsonString) {
    return {
      responseMode: "versions",
      title: null,
      summary: null,
      versions: trimmed ? [{ title: fallbackTitle, content: trimmed }] : [],
      notes: [],
      followUpSuggestions: [],
      recommendedText: trimmed,
    };
  }

  try {
    const parsed = JSON.parse(jsonString) as Record<string, unknown>;
    const versions = Array.isArray(parsed.versions)
      ? parsed.versions
          .filter(isRecord)
          .map((item, index) => {
            const content = trimOrNull(item.content);
            if (!content) return null;
            return {
              title: trimOrNull(item.title) ?? `版本${String.fromCharCode(65 + index)}`,
              content,
            } satisfies RewriteVersion;
          })
          .filter((item): item is RewriteVersion => item !== null)
      : [];

    const fallbackText =
      trimOrNull(parsed.recommended_text) ??
      trimOrNull(parsed.final_text) ??
      trimOrNull(parsed.rewrite) ??
      trimmed;

    const safeVersions =
      versions.length > 0
        ? versions
        : fallbackText
          ? [{ title: fallbackTitle, content: fallbackText }]
          : [];

    return normalizeStoredRewriteResult(
      {
        responseMode: responseMode,
        title: trimOrNull(parsed.title),
        summary: trimOrNull(parsed.summary),
        versions: safeVersions,
        notes: pickFirstNonEmptyStrings(parsed.notes),
        followUpSuggestions: pickFirstNonEmptyStrings(
          parsed.follow_up_suggestions ?? parsed.followUpSuggestions,
        ),
        recommendedText: pickRecommendedText(safeVersions) || fallbackText || "",
      },
      trimmed,
      fallbackTitle,
    );
  } catch {
    return {
      responseMode: "versions",
      title: null,
      summary: null,
      versions: trimmed ? [{ title: fallbackTitle, content: trimmed }] : [],
      notes: [],
      followUpSuggestions: [],
      recommendedText: trimmed,
    };
  }
}

export function renderAssistantMessageContent(result: NormalizedRewriteResult) {
  if (result.responseMode === "chat") {
    return result.recommendedText.trim();
  }

  const lines: string[] = [];

  for (const version of result.versions) {
    lines.push(`${version.title}：`);
    lines.push(version.content);
  }

  if (result.summary) {
    lines.push(`改写说明：${result.summary}`);
  }

  if (result.notes.length > 0) {
    lines.push(`备注：${result.notes.join("；")}`);
  }

  return lines.filter(Boolean).join("\n\n").trim() || result.recommendedText;
}

function buildJsonOutputInstruction() {
  return [
    "你必须只输出 JSON，不要 Markdown，不要代码块，不要额外解释。",
    '格式：{"responseMode":"versions","title":"一句话标题","summary":"一句话改写说明","versions":[{"title":"版本A","content":"..."}],"notes":["..."],"follow_up_suggestions":["..."]}',
    "要求：versions 至少返回 1 个；如果用户明确要多个版本，就返回对应数量或 2-3 个可直接复制的版本。",
  ].join("\n");
}

function buildHistoryMessages(history: RewriteMessageRow[]): AiMessage[] {
  const recent = history.slice(-8);
  const messages: AiMessage[] = [];

  for (const message of recent) {
    if (message.role === "user") {
      messages.push({
        role: "user",
        content: message.content,
      });
      continue;
    }

    if (message.role === "assistant") {
      messages.push({
        role: "assistant",
        content: truncateText(message.content, 1800),
      });
    }
  }

  return messages;
}

export function buildCombinedRewriteSystemMessage(input: {
  featureSystemPrompt?: string | null;
  fixedMode: RewriteFixedModeRow | null;
  mode: RewriteModeRow | null;
  lengthPreset: RewriteLengthPresetRow;
  workflowStepPrompt?: string | null;
  responseMode: RewriteResponseMode;
  autoModeEnabled: boolean;
  isFollowUp?: boolean;
}) {
  // 后续追问：走自然对话模式，不强制 JSON 输出
  if (input.isFollowUp) {
    const systemLines = [
      "你是财经短视频文案改写助手。",
      "用户之前已经完成了一轮文案改写，现在在继续追问或要求微调。",
      "请像正常 AI 助手一样理解上下文、回答问题、继续修改。",
      "保持事实边界，不编造数据。",
      input.featureSystemPrompt
        ? ["功能级系统要求（必须优先遵守）：", input.featureSystemPrompt].join("\n")
        : null,
      input.fixedMode ? `当前固定能力要求：${input.fixedMode.fixed_prompt}` : null,
      input.mode ? `当前模式要求：${input.mode.mode_prompt}` : null,
      `当前长度要求：${input.lengthPreset.length_prompt}`,
      input.responseMode === "versions"
        ? "这次用户明确要求重写/重出版本，请返回 JSON 结构化版本结果。"
        : "这次是继续追问或微调，请直接自然回复，不要包装成 A/B/C 版本，不要输出 JSON。",
    ];
    return systemLines.filter(Boolean).join("\n");
  }

  const systemLines = [
    "你是财经短视频文案改写助手。",
    "你的唯一任务是把用户给的原文改写成更适合发布的版本。",
    "保持事实边界，不编造数据，不新增未经用户提供的结论。",
    input.featureSystemPrompt
      ? ["功能级系统要求（必须优先遵守）：", input.featureSystemPrompt].join("\n")
      : null,
    input.fixedMode
      ? `当前固定能力要求：${input.fixedMode.fixed_prompt}`
      : input.mode
        ? `当前模式要求：${input.mode.mode_prompt}`
        : "当前模式要求：无额外模式，按基础改写执行。",
    `当前长度要求：${input.lengthPreset.length_prompt}`,
    input.fixedMode ? `当前固定套餐：${input.fixedMode.name}` : null,
    "当前是单步对话模式。",
    input.workflowStepPrompt ? `本步目标：${input.workflowStepPrompt}` : null,
    input.responseMode === "versions" ? buildJsonOutputInstruction() : null,
  ];

  return systemLines.filter(Boolean).join("\n");
}

function buildSingleUserPrompt(
  userMessage: string,
  isFollowUp?: boolean,
  responseMode: RewriteResponseMode = "versions",
) {
  if (isFollowUp && responseMode === "chat") {
    return userMessage.trim();
  }

  if (isFollowUp && responseMode === "versions") {
    return [
      "用户在继续追问，但这次明确要求重新出版本。",
      "请按当前要求重新生成可直接复制的版本结果。",
      "",
      `用户输入：${userMessage.trim()}`,
    ].join("\n");
  }

  return [
    "请直接按要求改写下面这段内容。",
    "如果用户没有明确补充要求，就默认给出多版可选结果。",
    "",
    `用户输入：${userMessage.trim()}`,
  ].join("\n");
}

function buildAutoStepUserPrompt(input: {
  userMessage: string;
  previousStepResult?: NormalizedRewriteResult | null;
  stepKey: string;
}) {
  if (input.stepKey === "structure") {
    return [
      "先做第一步：框架/结构改写。",
      "重点放在信息排序、开头抓力、节奏、删冗余。",
      "不要在这一步过度堆情绪词。",
      "",
      `原始输入：${input.userMessage.trim()}`,
    ].join("\n");
  }

  const previousText =
    input.previousStepResult?.recommendedText ||
    input.previousStepResult?.versions[0]?.content ||
    input.userMessage.trim();

  return [
    "继续做第二步：情绪/语感润色。",
    "请基于下面这版结构稿润色，不要推翻其核心结构，也不要改掉事实边界。",
    "",
    `原始输入：${input.userMessage.trim()}`,
    "",
    `结构稿：${previousText}`,
  ].join("\n");
}

function getServiceClient() {
  if (serviceClient) return serviceClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("服务端 Supabase 配置缺失");
  }

  serviceClient = createServiceRoleClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return serviceClient;
}

export async function requireRewriteActor() {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return { error: "未登录", status: 401 as const };
  }

  const { data: profile, error } = await authClient
    .from("profiles")
    .select("id, name, role")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return { error: "用户信息不存在", status: 403 as const };
  }

  return {
    authClient,
    serviceClient: getServiceClient(),
    actor: {
      userId: profile.id,
      name: profile.name ?? null,
      role: profile.role as UserRole,
    } satisfies RewriteActor,
  };
}

async function loadRewriteConfig(service: MinimalClient): Promise<RewriteConfigBundle> {
  const [
    featureResult,
    modelViewsResult,
    fixedModesResult,
    modesResult,
    lengthPresetsResult,
    workflowResult,
    workflowStepsResult,
  ] = await Promise.all([
    service
      .from("ai_feature_config")
      .select("feature_key, label, system_prompt, is_enabled")
      .eq("feature_key", "content_rewrite")
      .maybeSingle(),
    service
      .from("rewrite_model_views")
      .select("id, key, label, description, sort_order, is_enabled, is_default")
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    service
      .from("rewrite_fixed_modes")
      .select(
        "id, key, name, description, fixed_prompt, model_view_id, length_preset_id, sort_order, is_enabled",
      )
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    service
      .from("rewrite_modes")
      .select("id, key, name, description, mode_prompt, sort_order, is_enabled, is_default")
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    service
      .from("rewrite_length_presets")
      .select("id, key, name, description, length_prompt, sort_order, is_enabled, is_default")
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    service
      .from("rewrite_workflows")
      .select("id, key, name, description, sort_order, is_enabled, is_default")
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle(),
    service
      .from("rewrite_workflow_steps")
      .select("id, workflow_id, model_view_id, step_key, name, description, step_prompt, sort_order, is_enabled")
      .eq("is_enabled", true)
      .order("sort_order", { ascending: true }),
  ]);

  return {
    feature: (featureResult.data ?? null) as RewriteFeatureRow | null,
    modelViews: (modelViewsResult.data ?? []) as RewriteModelViewRow[],
    fixedModes: (fixedModesResult.data ?? []) as RewriteFixedModeRow[],
    modes: (modesResult.data ?? []) as RewriteModeRow[],
    lengthPresets: (lengthPresetsResult.data ?? []) as RewriteLengthPresetRow[],
    workflow: (workflowResult.data ?? null) as RewriteWorkflowRow | null,
    workflowSteps: (workflowStepsResult.data ?? []) as RewriteWorkflowStepRow[],
  };
}

function pickDefaultRow<T extends { is_default: boolean }>(rows: T[]) {
  return rows.find((row) => row.is_default) ?? rows[0] ?? null;
}

function findByIdOrKey<T extends { id: string; key: string }>(
  rows: T[],
  id: string | null | undefined,
  key: string | null | undefined,
) {
  if (id) {
    const found = rows.find((row) => row.id === id);
    if (found) return found;
  }

  if (key) {
    const found = rows.find((row) => row.key === key);
    if (found) return found;
  }

  return null;
}

export function mergeRewriteSelectionInput(
  conversation: RewriteConversationRow | null,
  input: RewriteSelectionInput,
): RewriteSelectionInput {
  const hasFixedModeOverride =
    hasExplicitSelectionValue(input.fixedModeId) || hasExplicitSelectionValue(input.fixedModeKey);
  const hasModelOverride =
    hasExplicitSelectionValue(input.modelViewId) || hasExplicitSelectionValue(input.modelViewKey);
  const hasModeOverride =
    hasExplicitSelectionValue(input.modeId) || hasExplicitSelectionValue(input.modeKey);
  const hasLengthOverride =
    hasExplicitSelectionValue(input.lengthPresetId) || hasExplicitSelectionValue(input.lengthPresetKey);

  return {
    autoModeEnabled: false,
    fixedModeId: hasFixedModeOverride ? input.fixedModeId : conversation?.selected_fixed_mode_id,
    fixedModeKey: hasFixedModeOverride ? input.fixedModeKey : undefined,
    modelViewId: hasModelOverride ? input.modelViewId : conversation?.selected_model_view_id,
    modelViewKey: hasModelOverride ? input.modelViewKey : undefined,
    modeId: hasModeOverride ? input.modeId : conversation?.selected_mode_id,
    modeKey: hasModeOverride ? input.modeKey : undefined,
    lengthPresetId: hasLengthOverride
      ? input.lengthPresetId
      : conversation?.selected_length_preset_id,
    lengthPresetKey: hasLengthOverride ? input.lengthPresetKey : undefined,
  };
}

export function resolveWorkflowStepModelView(
  config: Pick<RewriteConfigBundle, "modelViews">,
  step: Pick<RewriteWorkflowStepRow, "model_view_id"> | null | undefined,
  fallbackModelView: RewriteModelViewRow,
) {
  if (!step?.model_view_id) {
    return fallbackModelView;
  }

  return config.modelViews.find((row) => row.id === step.model_view_id) ?? fallbackModelView;
}

export async function getRewriteBootstrapPayload(service: MinimalClient): Promise<RewriteBootstrapPayload> {
  const config = await loadRewriteConfig(service);

  return {
    feature: {
      key: config.feature?.feature_key ?? "content_rewrite",
      label: config.feature?.label ?? "员工文案改写",
      enabled: config.feature?.is_enabled ?? true,
    },
    defaults: {
      autoModeEnabled: false,
      fixedModeId: null,
      modelViewId: pickDefaultRow(config.modelViews)?.id ?? null,
      modeId: null,
      lengthPresetId: pickDefaultRow(config.lengthPresets)?.id ?? null,
      workflowId: null,
    },
    fixedModes: config.fixedModes.map(toFixedModeOption),
    modelViews: config.modelViews.map(toModelOption),
    modes: config.modes.map(toModeOption),
    lengthPresets: config.lengthPresets.map(toLengthPresetOption),
    workflow: null,
  };
}

export function ensureRewriteFeatureEnabled(feature: RewriteFeatureRow | null) {
  if (feature && !feature.is_enabled) {
    throw new Error("文案改写功能已关闭");
  }
}

export async function resolveRewriteSelections(
  service: MinimalClient,
  input: RewriteSelectionInput,
): Promise<{ config: RewriteConfigBundle; selections: RewriteResolvedSelections }> {
  const config = await loadRewriteConfig(service);
  ensureRewriteFeatureEnabled(config.feature);

  if (config.modelViews.length === 0) {
    throw new Error("未配置可用的展示模型");
  }
  if (config.lengthPresets.length === 0) {
    throw new Error("未配置输出长度预设");
  }

  const requestedModelViewId = trimOrNull(input.modelViewId);
  const requestedModelViewKey = trimOrNull(input.modelViewKey);
  const requestedFixedModeId = trimOrNull(input.fixedModeId);
  const requestedFixedModeKey = trimOrNull(input.fixedModeKey);
  const requestedModeId = trimOrNull(input.modeId);
  const requestedModeKey = trimOrNull(input.modeKey);
  const requestedLengthPresetId = trimOrNull(input.lengthPresetId);
  const requestedLengthPresetKey = trimOrNull(input.lengthPresetKey);
  const fixedMode =
    requestedFixedModeId || requestedFixedModeKey
      ? findByIdOrKey(config.fixedModes, requestedFixedModeId, requestedFixedModeKey)
      : null;
  if ((requestedFixedModeId || requestedFixedModeKey) && !fixedMode) {
    throw new Error("固定模式不存在");
  }

  const explicitModelView =
    requestedModelViewId || requestedModelViewKey
      ? findByIdOrKey(config.modelViews, requestedModelViewId, requestedModelViewKey)
      : null;
  if ((requestedModelViewId || requestedModelViewKey) && !explicitModelView) {
    throw new Error("展示模型不存在");
  }

  const fixedModeModelView = fixedMode
    ? config.modelViews.find((row) => row.id === fixedMode.model_view_id) ?? null
    : null;
  if (fixedMode && !fixedModeModelView) {
    throw new Error("固定模式绑定的展示模型不存在");
  }
  const modelView = fixedModeModelView ?? explicitModelView ?? pickDefaultRow(config.modelViews);
  if (!modelView) {
    throw new Error("展示模型不存在");
  }

  let mode: RewriteModeRow | null = null;
  if (fixedMode) {
    mode = null;
  } else if (input.modeId === null || input.modeKey === null) {
    mode = null;
  } else if (requestedModeId || requestedModeKey) {
    mode = findByIdOrKey(config.modes, requestedModeId, requestedModeKey);
    if (!mode) {
      throw new Error("模式不存在");
    }
  }

  const explicitLengthPreset =
    requestedLengthPresetId || requestedLengthPresetKey
      ? findByIdOrKey(config.lengthPresets, requestedLengthPresetId, requestedLengthPresetKey)
      : null;
  if ((requestedLengthPresetId || requestedLengthPresetKey) && !explicitLengthPreset) {
    throw new Error("输出长度预设不存在");
  }

  const fixedModeLengthPreset =
    fixedMode?.length_preset_id
      ? config.lengthPresets.find((row) => row.id === fixedMode.length_preset_id) ?? null
      : null;
  const lengthPreset = fixedModeLengthPreset ?? explicitLengthPreset ?? pickDefaultRow(config.lengthPresets);
  if (!lengthPreset) {
    throw new Error("输出长度预设不存在");
  }

  const autoModeEnabled = false;
  const workflow = null;
  const workflowSteps: RewriteWorkflowStepRow[] = [];

  return {
    config,
    selections: {
      fixedMode,
      modelView,
      mode,
      lengthPreset,
      workflow,
      workflowSteps,
      autoModeEnabled,
    },
  };
}

export async function getConversationById(
  service: MinimalClient,
  conversationId: string,
  userId: string,
) {
  const { data, error } = await service
    .from("rewrite_conversations")
    .select(REWRITE_CONVERSATION_SELECT)
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as RewriteConversationRow | null;
}

async function loadOptionMaps(
  service: MinimalClient,
  input: {
    fixedModeIds: string[];
    modelViewIds: string[];
    modeIds: string[];
    lengthPresetIds: string[];
  },
) {
  const [fixedModesResult, modelViewsResult, modesResult, lengthPresetsResult] = await Promise.all([
    input.fixedModeIds.length
      ? service
          .from("rewrite_fixed_modes")
          .select("id, key, name, description, fixed_prompt, model_view_id, length_preset_id, sort_order, is_enabled")
          .in("id", input.fixedModeIds)
      : Promise.resolve({ data: [] as RewriteFixedModeRow[] }),
    input.modelViewIds.length
      ? service
          .from("rewrite_model_views")
          .select("id, key, label, description, sort_order, is_enabled, is_default")
          .in("id", input.modelViewIds)
      : Promise.resolve({ data: [] as RewriteModelViewRow[] }),
    input.modeIds.length
      ? service
          .from("rewrite_modes")
          .select("id, key, name, description, mode_prompt, sort_order, is_enabled, is_default")
          .in("id", input.modeIds)
      : Promise.resolve({ data: [] as RewriteModeRow[] }),
    input.lengthPresetIds.length
      ? service
          .from("rewrite_length_presets")
          .select("id, key, name, description, length_prompt, sort_order, is_enabled, is_default")
          .in("id", input.lengthPresetIds)
      : Promise.resolve({ data: [] as RewriteLengthPresetRow[] }),
  ]);

  return {
    fixedModeMap: new Map(
      (((fixedModesResult as { data?: RewriteFixedModeRow[] }).data ?? []) as RewriteFixedModeRow[]).map((row) => [
        row.id,
        toFixedModeOption(row),
      ]),
    ),
    modelViewMap: new Map(
      (((modelViewsResult as { data?: RewriteModelViewRow[] }).data ?? []) as RewriteModelViewRow[]).map((row) => [
        row.id,
        toModelOption(row),
      ]),
    ),
    modeMap: new Map(
      (((modesResult as { data?: RewriteModeRow[] }).data ?? []) as RewriteModeRow[]).map((row) => [
        row.id,
        toModeOption(row),
      ]),
    ),
    lengthPresetMap: new Map(
      (
        ((lengthPresetsResult as { data?: RewriteLengthPresetRow[] }).data ?? []) as RewriteLengthPresetRow[]
      ).map((row) => [row.id, toLengthPresetOption(row)]),
    ),
  };
}

function serializeConversationRow(
  row: RewriteConversationRow,
  optionMaps: Awaited<ReturnType<typeof loadOptionMaps>>,
): RewriteConversationItem {
  const fixedMode = row.selected_fixed_mode_id
    ? optionMaps.fixedModeMap.get(row.selected_fixed_mode_id) ?? null
    : null;
  const modelView = row.selected_model_view_id
    ? optionMaps.modelViewMap.get(row.selected_model_view_id) ?? null
    : null;
  const mode = row.selected_mode_id ? optionMaps.modeMap.get(row.selected_mode_id) ?? null : null;
  const lengthPreset = row.selected_length_preset_id
    ? optionMaps.lengthPresetMap.get(row.selected_length_preset_id) ?? null
    : null;

  return {
    id: row.id,
    title: row.title,
    selected: {
      autoModeEnabled: row.auto_mode_enabled,
      fixedModeId: fixedMode?.id ?? row.selected_fixed_mode_id,
      fixedMode,
      modelViewId: modelView?.id ?? row.selected_model_view_id,
      modeId: mode?.id ?? row.selected_mode_id,
      lengthPresetId: lengthPreset?.id ?? row.selected_length_preset_id,
      modelView,
      mode,
      lengthPreset,
    },
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeConversationRows(
  rows: RewriteConversationRow[],
  optionMaps: Awaited<ReturnType<typeof loadOptionMaps>>,
) {
  return rows.map((row) => serializeConversationRow(row, optionMaps));
}

export function normalizeAssistantStructuredResult(input: {
  value: unknown;
  content: string;
  generationMode: "auto" | "single" | null;
  status: "success" | "partial_success" | "failed" | null;
  requestSnapshot: RewriteRequestSnapshot | null;
}): RewriteAssistantPayload {
  const raw = isRecord(input.value) ? input.value : {};
  const rawSelected = isRecord(raw.selected) ? raw.selected : {};
  const selectedFixedMode = normalizeFixedModeOption(rawSelected.fixedMode);
  const selectedModelView = normalizeModelOption(rawSelected.modelView);
  const selectedMode = normalizeModeOption(rawSelected.mode);
  const selectedLengthPreset = normalizeLengthPresetOption(rawSelected.lengthPreset);
  const selectedWorkflow = normalizeWorkflowSelection(rawSelected.workflow);
  const fallbackGenerationMode =
    typeof input.requestSnapshot?.autoModeEnabled === "boolean"
      ? input.requestSnapshot.autoModeEnabled
        ? "auto"
        : "single"
      : input.generationMode ?? "single";
  const generationMode =
    raw.generationMode === "auto" || raw.generationMode === "single"
      ? raw.generationMode
      : fallbackGenerationMode;
  const status =
    raw.status === "success" || raw.status === "partial_success" || raw.status === "failed"
      ? raw.status
      : input.status ?? "success";
  const steps = Array.isArray(raw.steps)
    ? raw.steps
        .filter(isRecord)
        .map((step, index) => {
          const normalizedResult = step.normalizedResult
            ? normalizeStoredRewriteResult(
                step.normalizedResult,
                trimOrNull(step.content) ?? input.content,
                trimOrNull(step.stepName) ?? trimOrNull(step.name) ?? `步骤${index + 1}`,
              )
            : trimOrNull(step.content)
              ? normalizeStoredRewriteResult(
                  step.content,
                  trimOrNull(step.content) ?? "",
                  trimOrNull(step.stepName) ?? trimOrNull(step.name) ?? `步骤${index + 1}`,
                )
              : null;

          return {
            stepKey: trimOrNull(step.stepKey) ?? trimOrNull(step.key) ?? `step_${index + 1}`,
            stepName:
              trimOrNull(step.stepName) ??
              trimOrNull(step.name) ??
              trimOrNull(step.stepKey) ??
              trimOrNull(step.key) ??
              `步骤${index + 1}`,
            description: trimOrNull(step.description),
            status:
              step.status === "success" || step.status === "pending" || step.status === "failed"
                ? step.status
                : trimOrNull(step.errorMessage) || trimOrNull(step.error)
                  ? "failed"
                  : "success",
            modelViewId: trimOrNull(step.modelViewId),
            modelViewKey: trimOrNull(step.modelViewKey),
            modelViewLabel: trimOrNull(step.modelViewLabel),
            routeId: trimOrNull(step.routeId),
            channelId: trimOrNull(step.channelId),
            channelName: trimOrNull(step.channelName),
            actualModel: trimOrNull(step.actualModel),
            elapsedMs: typeof step.elapsedMs === "number" ? step.elapsedMs : null,
            errorMessage: trimOrNull(step.errorMessage) ?? trimOrNull(step.error),
            normalizedResult,
          } satisfies RewriteAssistantPayload["steps"][number];
        })
    : [];
  const final = raw.final
    ? normalizeStoredRewriteResult(raw.final, input.content)
    : normalizeStoredRewriteResult(input.content, input.content);
  const selectedAutoMode =
    typeof rawSelected.autoModeEnabled === "boolean"
      ? rawSelected.autoModeEnabled
      : input.requestSnapshot?.autoModeEnabled ?? generationMode === "auto";

  return {
    generationMode,
    status,
    selected: {
      autoModeEnabled: selectedAutoMode,
      fixedModeId:
        trimOrNull(rawSelected.fixedModeId) ??
        selectedFixedMode?.id ??
        input.requestSnapshot?.fixedModeId ??
        null,
      modelViewId:
        trimOrNull(rawSelected.modelViewId) ??
        selectedModelView?.id ??
        input.requestSnapshot?.modelViewId ??
        null,
      modeId: trimOrNull(rawSelected.modeId) ?? selectedMode?.id ?? input.requestSnapshot?.modeId ?? null,
      lengthPresetId:
        trimOrNull(rawSelected.lengthPresetId) ??
        selectedLengthPreset?.id ??
        input.requestSnapshot?.lengthPresetId ??
        null,
      workflowId:
        trimOrNull(rawSelected.workflowId) ??
        selectedWorkflow?.id ??
        input.requestSnapshot?.workflowId ??
        null,
      fixedMode: selectedFixedMode,
      modelView: selectedModelView,
      mode: selectedMode,
      lengthPreset: selectedLengthPreset,
      workflow: selectedWorkflow,
    },
    snapshots: {
      featureSystemPrompt: isRecord(raw.snapshots) ? trimOrNull(raw.snapshots.featureSystemPrompt) : null,
      fixedModePrompt: isRecord(raw.snapshots) ? trimOrNull(raw.snapshots.fixedModePrompt) : null,
      modePrompt: isRecord(raw.snapshots) ? trimOrNull(raw.snapshots.modePrompt) : null,
      lengthPrompt: isRecord(raw.snapshots) ? trimOrNull(raw.snapshots.lengthPrompt) : null,
    },
    final,
    steps,
  };
}

function serializeMessageRow(row: RewriteMessageRow): RewriteMessageItem {
  const requestSnapshot = normalizeRequestSnapshot(row.request_snapshot);

  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    generationMode: row.generation_mode,
    status: row.message_status,
    content: row.content,
    structuredResult:
      row.role === "assistant"
        ? normalizeAssistantStructuredResult({
            value: row.structured_result,
            content: row.content,
            generationMode: row.generation_mode,
            status: row.message_status,
            requestSnapshot,
          })
        : null,
    requestSnapshot,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

export async function listUserConversations(service: MinimalClient, input: { userId: string; limit: number }) {
  const { data, error } = await service
    .from("rewrite_conversations")
    .select(REWRITE_CONVERSATION_SELECT)
    .eq("user_id", input.userId)
    .order("last_message_at", { ascending: false })
    .limit(input.limit);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as RewriteConversationRow[];
  const optionMaps = await loadOptionMaps(service, {
    fixedModeIds: Array.from(new Set(rows.map((row) => row.selected_fixed_mode_id).filter(Boolean))) as string[],
    modelViewIds: Array.from(new Set(rows.map((row) => row.selected_model_view_id).filter(Boolean))) as string[],
    modeIds: Array.from(new Set(rows.map((row) => row.selected_mode_id).filter(Boolean))) as string[],
    lengthPresetIds: Array.from(
      new Set(rows.map((row) => row.selected_length_preset_id).filter(Boolean)),
    ) as string[],
  });

  return serializeConversationRows(rows, optionMaps);
}

export async function listConversationMessages(
  service: MinimalClient,
  input: { userId: string; conversationId: string },
) {
  const conversation = await getConversationById(service, input.conversationId, input.userId);
  if (!conversation) {
    throw new Error("会话不存在");
  }

  const { data, error } = await service
    .from("rewrite_messages")
    .select(REWRITE_MESSAGE_SELECT)
    .eq("conversation_id", input.conversationId)
    .eq("user_id", input.userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const optionMaps = await loadOptionMaps(service, {
    fixedModeIds: conversation.selected_fixed_mode_id ? [conversation.selected_fixed_mode_id] : [],
    modelViewIds: conversation.selected_model_view_id ? [conversation.selected_model_view_id] : [],
    modeIds: conversation.selected_mode_id ? [conversation.selected_mode_id] : [],
    lengthPresetIds: conversation.selected_length_preset_id ? [conversation.selected_length_preset_id] : [],
  });

  return {
    conversation: serializeConversationRow(conversation, optionMaps),
    messages: ((data ?? []) as RewriteMessageRow[]).map((row) => serializeMessageRow(row)),
  };
}

export async function createRewriteConversation(
  service: MinimalClient,
  input: {
    userId: string;
    title?: string | null;
    autoModeEnabled: boolean;
    fixedModeId?: string | null;
    modelViewId: string;
    modeId?: string | null;
    lengthPresetId: string;
  },
) {
  // MinimalClient 没有项目级数据库类型，这里用运行时表名保证可用。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conversationsTable = service.from("rewrite_conversations") as any;
  const { data, error } = await conversationsTable
    .insert({
      user_id: input.userId,
      title: trimOrNull(input.title) ?? "新会话",
      auto_mode_enabled: input.autoModeEnabled,
      selected_fixed_mode_id: input.fixedModeId ?? null,
      selected_model_view_id: input.modelViewId,
      selected_mode_id: input.modeId ?? null,
      selected_length_preset_id: input.lengthPresetId,
    })
    .select(REWRITE_CONVERSATION_SELECT)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "创建会话失败");
  }

  const row = data as RewriteConversationRow;
  const optionMaps = await loadOptionMaps(service, {
    fixedModeIds: row.selected_fixed_mode_id ? [row.selected_fixed_mode_id] : [],
    modelViewIds: row.selected_model_view_id ? [row.selected_model_view_id] : [],
    modeIds: row.selected_mode_id ? [row.selected_mode_id] : [],
    lengthPresetIds: row.selected_length_preset_id ? [row.selected_length_preset_id] : [],
  });

  return serializeConversationRow(row, optionMaps);
}

async function loadConversationHistory(
  service: MinimalClient,
  input: { userId: string; conversationId: string; limit?: number },
) {
  const limit = input.limit ?? 12;
  const { data, error } = await service
    .from("rewrite_messages")
    .select(REWRITE_MESSAGE_SELECT)
    .eq("conversation_id", input.conversationId)
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as RewriteMessageRow[]).reverse();
}

async function updateConversationSelections(
  service: MinimalClient,
  input: {
    conversationId: string;
    userId: string;
    title?: string | null;
    autoModeEnabled: boolean;
    fixedModeId?: string | null;
    modelViewId: string;
    modeId?: string | null;
    lengthPresetId: string;
  },
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conversationsTable = service.from("rewrite_conversations") as any;
  const patch: Record<string, unknown> = {
    auto_mode_enabled: input.autoModeEnabled,
    selected_fixed_mode_id: input.fixedModeId ?? null,
    selected_model_view_id: input.modelViewId,
    selected_mode_id: input.modeId ?? null,
    selected_length_preset_id: input.lengthPresetId,
    updated_at: new Date().toISOString(),
  };

  const title = trimOrNull(input.title);
  if (title) {
    patch.title = title;
  }

  const { error } = await conversationsTable
    .update(patch)
    .eq("id", input.conversationId)
    .eq("user_id", input.userId);

  if (error) {
    throw new Error(error.message);
  }
}

async function insertRewriteMessage(
  service: MinimalClient,
  input: {
    conversationId: string;
    userId: string;
    role: "user" | "assistant" | "system_note";
    content: string;
    generationMode?: "auto" | "single" | null;
    messageStatus?: "success" | "partial_success" | "failed" | null;
    structuredResult?: Record<string, unknown> | null;
    requestSnapshot?: Record<string, unknown> | null;
    errorMessage?: string | null;
    returnRow?: boolean;
  },
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messagesTable = service.from("rewrite_messages") as any;
  const query = messagesTable.insert({
    conversation_id: input.conversationId,
    user_id: input.userId,
    role: input.role,
    content: input.content,
    generation_mode: input.generationMode ?? null,
    message_status: input.messageStatus ?? null,
    structured_result: input.structuredResult ?? null,
    request_snapshot: input.requestSnapshot ?? null,
    error_message: input.errorMessage ?? null,
  });
  const result = input.returnRow
    ? await query.select(REWRITE_MESSAGE_SELECT).single()
    : await query;
  const error = result?.error ?? null;

  if (error) {
    throw new Error(error.message);
  }

  return (input.returnRow ? ((result?.data ?? null) as RewriteMessageRow | null) : null) ?? null;
}

async function maybeUpdateConversationTitle(
  service: MinimalClient,
  input: { conversation: RewriteConversationRow; userId: string; message: string },
) {
  if (input.conversation.title && input.conversation.title !== "新会话") {
    return;
  }

  await updateConversationSelections(service, {
    conversationId: input.conversation.id,
    userId: input.userId,
    title: buildConversationTitle(input.message),
    autoModeEnabled: input.conversation.auto_mode_enabled,
    fixedModeId: input.conversation.selected_fixed_mode_id,
    modelViewId: input.conversation.selected_model_view_id ?? "",
    modeId: input.conversation.selected_mode_id,
    lengthPresetId: input.conversation.selected_length_preset_id ?? "",
  });
}

async function loadRoutesForStep(
  service: MinimalClient,
  input: { modelViewId: string; workflowStepId?: string | null },
) {
  const load = async (workflowStepId: string | null) => {
    let query = service
      .from("rewrite_model_routes")
      .select(
        "id, model_view_id, workflow_step_id, channel_id, actual_model, priority, weight, is_enabled, channel:ai_channels(id, name, is_enabled)",
      )
      .eq("model_view_id", input.modelViewId)
      .eq("is_enabled", true)
      .order("priority", { ascending: true })
      .order("weight", { ascending: false })
      .order("created_at", { ascending: true });

    query = workflowStepId ? query.eq("workflow_step_id", workflowStepId) : query.is("workflow_step_id", null);

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []) as RewriteModelRouteRow[];
  };

  const stepRoutes = input.workflowStepId ? await load(input.workflowStepId) : [];
  const genericRoutes = await load(null);
  const fallbackRoutes =
    !input.workflowStepId && genericRoutes.length === 0
      ? ((await service
          .from("rewrite_model_routes")
          .select(
            "id, model_view_id, workflow_step_id, channel_id, actual_model, priority, weight, is_enabled, channel:ai_channels(id, name, is_enabled)",
          )
          .eq("model_view_id", input.modelViewId)
          .eq("is_enabled", true)
          .order("priority", { ascending: true })
          .order("weight", { ascending: false })
          .order("created_at", { ascending: true })) as { data?: RewriteModelRouteRow[] }).data ?? []
      : [];
  const unique = new Map<string, RewriteModelRouteRow>();

  for (const route of [...stepRoutes, ...genericRoutes, ...fallbackRoutes]) {
    if (!unique.has(route.id)) {
      unique.set(route.id, route);
    }
  }

  return Array.from(unique.values());
}

async function executeRewriteStep(input: {
  service: MinimalClient;
  feature: RewriteFeatureRow | null;
  config: RewriteConfigBundle;
  selections: RewriteResolvedSelections;
  history: RewriteMessageRow[];
  userMessage: string;
  workflowStep?: RewriteWorkflowStepRow | null;
  previousStepResult?: NormalizedRewriteResult | null;
  responseMode: RewriteResponseMode;
  isFollowUp?: boolean;
}) {
  const stepModelView = resolveWorkflowStepModelView(
    input.config,
    input.workflowStep,
    input.selections.modelView,
  );
  const routes = await loadRoutesForStep(input.service, {
    modelViewId: stepModelView.id,
    workflowStepId: input.workflowStep?.id ?? null,
  });

  if (routes.length === 0) {
    throw new Error("当前展示模型未配置真实执行路线");
  }

  const systemMessage = buildCombinedRewriteSystemMessage({
    featureSystemPrompt: input.feature?.system_prompt ?? null,
    fixedMode: input.selections.fixedMode,
    mode: input.selections.mode,
    lengthPreset: input.selections.lengthPreset,
    workflowStepPrompt: input.workflowStep?.step_prompt ?? null,
    responseMode: input.responseMode,
    autoModeEnabled: input.selections.autoModeEnabled,
    isFollowUp: input.isFollowUp,
  });

  const userPrompt = input.workflowStep
    ? buildAutoStepUserPrompt({
        userMessage: input.userMessage,
        previousStepResult: input.previousStepResult,
        stepKey: input.workflowStep.step_key,
      })
    : buildSingleUserPrompt(input.userMessage, input.isFollowUp, input.responseMode);

  const baseMessages: AiMessage[] = [
    { role: "system", content: systemMessage },
    ...buildHistoryMessages(input.history),
    { role: "user", content: userPrompt },
  ];

  // 后续追问不强制 JSON mode，让 AI 自然回答
  const useJsonMode = input.responseMode === "versions";

  let lastError: string | null = null;
  for (const route of routes) {
    const channel = normalizeJoinedRow(route.channel);
    const channelName = channel?.name ?? null;

    try {
      const aiResult = await rewriteAiCaller({
        channelId: route.channel_id,
        model: route.actual_model,
        databaseOnly: true,
        jsonMode: useJsonMode,
        maxTokens: 2200,
        timeoutMs: 50_000,
        messages: baseMessages,
      });

      return {
        stepKey: input.workflowStep?.step_key ?? "single",
        stepName: input.workflowStep?.name ?? "单步改写",
        description: input.workflowStep?.description ?? null,
        status: "success",
        modelViewId: stepModelView.id,
        modelViewKey: stepModelView.key,
        modelViewLabel: stepModelView.label,
        routeId: route.id,
        channelId: route.channel_id,
        channelName: channelName ?? aiResult.channelName,
        actualModel: aiResult.model,
        elapsedMs: aiResult.elapsedMs,
        rawContent: aiResult.content,
        normalizedResult: normalizeRewriteResult(
          aiResult.content,
          input.workflowStep?.step_key === "structure" ? "结构稿" : "版本A",
          input.responseMode,
        ),
        errorMessage: null,
      } satisfies RewriteStepExecution;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "AI 执行失败";
    }
  }

  return {
    stepKey: input.workflowStep?.step_key ?? "single",
    stepName: input.workflowStep?.name ?? "单步改写",
    description: input.workflowStep?.description ?? null,
    status: "failed",
    modelViewId: stepModelView.id,
    modelViewKey: stepModelView.key,
    modelViewLabel: stepModelView.label,
    routeId: null,
    channelId: null,
    channelName: null,
    actualModel: null,
    elapsedMs: null,
    rawContent: null,
    normalizedResult: null,
    errorMessage: lastError ?? "AI 执行失败",
  } satisfies RewriteStepExecution;
}

function buildAssistantPayload(input: {
  config: RewriteConfigBundle;
  selections: RewriteResolvedSelections;
  final: NormalizedRewriteResult;
  steps: RewriteStepExecution[];
  status: "success" | "partial_success" | "failed";
}): RewriteAssistantPayload {
  return {
    generationMode: input.selections.autoModeEnabled ? "auto" : "single",
    status: input.status,
    selected: {
      autoModeEnabled: input.selections.autoModeEnabled,
      fixedModeId: input.selections.fixedMode?.id ?? null,
      modelViewId: input.selections.modelView.id,
      modeId: input.selections.mode?.id ?? null,
      lengthPresetId: input.selections.lengthPreset.id,
      workflowId: input.selections.workflow?.id ?? null,
      fixedMode: input.selections.fixedMode ? toFixedModeOption(input.selections.fixedMode) : null,
      modelView: toModelOption(input.selections.modelView),
      mode: input.selections.mode ? toModeOption(input.selections.mode) : null,
      lengthPreset: toLengthPresetOption(input.selections.lengthPreset),
      workflow: input.selections.workflow
        ? {
            id: input.selections.workflow.id,
            key: input.selections.workflow.key,
            name: input.selections.workflow.name,
          }
        : null,
    },
    snapshots: {
      featureSystemPrompt: input.config.feature?.system_prompt ?? null,
      fixedModePrompt: input.selections.fixedMode?.fixed_prompt ?? null,
      modePrompt: input.selections.mode?.mode_prompt ?? null,
      lengthPrompt: input.selections.lengthPreset.length_prompt,
    },
    final: input.final,
    steps: input.steps.map((step) => ({
      stepKey: step.stepKey,
      stepName: step.stepName,
      description: step.description,
      status: step.status,
      modelViewId: step.modelViewId,
      modelViewKey: step.modelViewKey,
      modelViewLabel: step.modelViewLabel,
      routeId: step.routeId,
      channelId: step.channelId,
      channelName: step.channelName,
      actualModel: step.actualModel,
      elapsedMs: step.elapsedMs,
      errorMessage: step.errorMessage,
      normalizedResult: step.normalizedResult,
    })),
  } satisfies RewriteAssistantPayload;
}

function buildRequestSnapshot(selections: RewriteResolvedSelections): RewriteRequestSnapshot {
  return {
    autoModeEnabled: selections.autoModeEnabled,
    fixedModeId: selections.fixedMode?.id ?? null,
    modelViewId: selections.modelView.id,
    modeId: selections.mode?.id ?? null,
    lengthPresetId: selections.lengthPreset.id,
    workflowId: selections.workflow?.id ?? null,
  };
}

export async function handleRewriteChat(input: {
  service: MinimalClient;
  actor: RewriteActor;
  conversationId?: string | null;
  message: string;
  autoStep?: number;
} & RewriteSelectionInput) {
  const userMessage = trimOrNull(input.message);
  if (!userMessage) {
    throw new Error("缺少 message");
  }

  let conversation = input.conversationId
    ? await getConversationById(input.service, input.conversationId, input.actor.userId)
    : null;

  if (input.conversationId && !conversation) {
    throw new Error("会话不存在");
  }

  const mergedSelectionInput = mergeRewriteSelectionInput(conversation, {
    autoModeEnabled: input.autoModeEnabled,
    fixedModeId: input.fixedModeId,
    fixedModeKey: input.fixedModeKey,
    modelViewId: input.modelViewId,
    modelViewKey: input.modelViewKey,
    modeId: input.modeId,
    modeKey: input.modeKey,
    lengthPresetId: input.lengthPresetId,
    lengthPresetKey: input.lengthPresetKey,
  });

  const { config, selections } = await resolveRewriteSelections(input.service, mergedSelectionInput);

  if (!conversation) {
    const created = await createRewriteConversation(input.service, {
      userId: input.actor.userId,
      title: buildConversationTitle(userMessage),
      autoModeEnabled: selections.autoModeEnabled,
      fixedModeId: selections.fixedMode?.id ?? null,
      modelViewId: selections.modelView.id,
      modeId: selections.mode?.id ?? null,
      lengthPresetId: selections.lengthPreset.id,
    });

    conversation = await getConversationById(input.service, created.id, input.actor.userId);
  }

  if (!conversation) {
    throw new Error("会话创建失败");
  }

  await updateConversationSelections(input.service, {
    conversationId: conversation.id,
    userId: input.actor.userId,
    title: conversation.title === "新会话" ? buildConversationTitle(userMessage) : null,
    autoModeEnabled: selections.autoModeEnabled,
    fixedModeId: selections.fixedMode?.id ?? null,
    modelViewId: selections.modelView.id,
    modeId: selections.mode?.id ?? null,
    lengthPresetId: selections.lengthPreset.id,
  });

  const history = await loadConversationHistory(input.service, {
    userId: input.actor.userId,
    conversationId: conversation.id,
  });

  const isFirstMessage = history.length === 0;
  const responseMode = isFirstMessage ? "versions" : inferFollowUpResponseMode(userMessage);

  await insertRewriteMessage(input.service, {
    conversationId: conversation.id,
    userId: input.actor.userId,
    role: "user",
    content: userMessage,
    generationMode: "single",
  });

  let steps: RewriteStepExecution[] = [];
  let finalResult: NormalizedRewriteResult | null = null;
  let finalStatus: "success" | "partial_success" | "failed" = "failed";

  // 员工端主链路已降级为稳定的单次生成；旧 autoStep 仅保留接口兼容，不再参与本页行为。
  const singleResult = await executeRewriteStep({
    service: input.service,
    feature: config.feature,
    config,
    selections,
    history,
    userMessage,
    responseMode,
    isFollowUp: !isFirstMessage,
  });
  steps = [singleResult];

  if (singleResult.status !== "success" || !singleResult.normalizedResult) {
    throw new Error(singleResult.errorMessage ?? "改写失败");
  }

  finalResult = singleResult.normalizedResult;
  finalStatus = "success";

  if (!finalResult) {
    throw new Error("未生成有效改写结果");
  }

  const assistantPayload = buildAssistantPayload({
    config,
    selections,
    final: finalResult,
    steps,
    status: finalStatus,
  });
  const assistantContent = renderAssistantMessageContent(finalResult);
  const requestSnapshot = buildRequestSnapshot(selections);

  const assistantRow = await insertRewriteMessage(input.service, {
    conversationId: conversation.id,
    userId: input.actor.userId,
    role: "assistant",
    content: assistantContent,
    generationMode: "single",
    messageStatus: finalStatus,
    structuredResult: assistantPayload as unknown as Record<string, unknown>,
    requestSnapshot,
    errorMessage: null,
    returnRow: true,
  });

  const latestConversation = await getConversationById(input.service, conversation.id, input.actor.userId);
  if (latestConversation) {
    await maybeUpdateConversationTitle(input.service, {
      conversation: latestConversation,
      userId: input.actor.userId,
      message: userMessage,
    });
  }

  const finalConversation = (await getConversationById(input.service, conversation.id, input.actor.userId)) ?? conversation;
  const optionMaps = await loadOptionMaps(input.service, {
    fixedModeIds: finalConversation.selected_fixed_mode_id ? [finalConversation.selected_fixed_mode_id] : [],
    modelViewIds: finalConversation.selected_model_view_id ? [finalConversation.selected_model_view_id] : [],
    modeIds: finalConversation.selected_mode_id ? [finalConversation.selected_mode_id] : [],
    lengthPresetIds: finalConversation.selected_length_preset_id ? [finalConversation.selected_length_preset_id] : [],
  });

  return {
    conversation: serializeConversationRow(finalConversation, optionMaps),
    message: assistantRow
      ? serializeMessageRow(assistantRow)
        : {
          id: "",
          conversationId: conversation.id,
          role: "assistant",
          generationMode: assistantPayload.generationMode,
          status: assistantPayload.status,
          content: assistantContent,
          structuredResult: assistantPayload,
          requestSnapshot,
          errorMessage: null,
          createdAt: new Date().toISOString(),
        },
  };
}

export const __internal = {
  buildRequestSnapshot,
  buildAssistantPayload,
  normalizeStoredRewriteResult,
  normalizeAssistantStructuredResult,
  serializeMessageRow,
  resetAiCaller() {
    rewriteAiCaller = callAi;
  },
  setAiCallerForTests(
    caller: typeof callAi,
  ) {
    rewriteAiCaller = caller;
  },
};
