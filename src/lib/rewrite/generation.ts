import {
  getCurrentDocumentSnapshot,
  createRevision,
  createParagraphs,
  updateRevisionStatus,
  setCurrentRevision,
  type DocumentParagraph,
} from "./documents";
import { listConversationSkills } from "./skills";
import { callAi, type AiMessage, type AiResponse } from "@/lib/ai/client";
import {
  getProviderKeyModelConfig,
  selectHealthyProviderKeyModel,
} from "@/lib/ai/provider-routing";

// Dynamic v2 tables are not in the generated Supabase type map yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MinimalClient = any;

export type GenerationRunType = "full_rewrite" | "paragraph_patch" | "variant_generate" | "chat_reply";
export type GenerationRunStatus = "started" | "streaming" | "completed" | "failed" | "aborted";

export type GenerationRunRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  run_type: GenerationRunType;
  status: GenerationRunStatus;
  actual_model: string | null;
  provider_name: string | null;
  provider_key_model_id: string | null;
  skill_version_ids: string[] | null;
  input_snapshot: Record<string, unknown> | null;
  output_snapshot: Record<string, unknown> | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  elapsed_ms: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
};

export type GenerationRun = {
  id: string;
  conversationId: string;
  userId: string;
  runType: GenerationRunType;
  status: GenerationRunStatus;
  actualModel: string | null;
  providerName: string | null;
  providerKeyModelId: string | null;
  skillVersionIds: string[] | null;
  inputSnapshot: Record<string, unknown> | null;
  outputSnapshot: Record<string, unknown> | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  totalCost: number | null;
  elapsedMs: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

const GENERATION_RUN_SELECT =
  "id, conversation_id, user_id, run_type, status, actual_model, provider_name, provider_key_model_id, skill_version_ids, input_snapshot, output_snapshot, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, elapsed_ms, error_message, started_at, completed_at";

function toGenerationRun(row: GenerationRunRow): GenerationRun {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    userId: row.user_id,
    runType: row.run_type,
    status: row.status,
    actualModel: row.actual_model,
    providerName: row.provider_name,
    providerKeyModelId: row.provider_key_model_id,
    skillVersionIds: row.skill_version_ids,
    inputSnapshot: row.input_snapshot,
    outputSnapshot: row.output_snapshot,
    inputTokens: row.prompt_tokens,
    outputTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    totalCost: row.estimated_cost_usd,
    elapsedMs: row.elapsed_ms,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

export async function createGenerationRun(
  service: MinimalClient,
  input: {
    conversationId: string;
    userId: string;
    runType: GenerationRunType;
    providerKeyModelId?: string | null;
    skillVersionIds?: string[] | null;
    inputSnapshot?: Record<string, unknown> | null;
  },
): Promise<GenerationRun> {
  const { data, error } = await service
    .from("rewrite_generation_runs")
    .insert({
      conversation_id: input.conversationId,
      user_id: input.userId,
      run_type: input.runType,
      status: "started",
      provider_key_model_id: input.providerKeyModelId ?? null,
      skill_version_ids: input.skillVersionIds ?? [],
      input_snapshot: input.inputSnapshot ?? null,
    })
    .select(GENERATION_RUN_SELECT)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "创建 generation_run 失败");
  }

  return toGenerationRun(data as GenerationRunRow);
}

export async function updateGenerationRunStatus(
  service: MinimalClient,
  runId: string,
  status: GenerationRunStatus,
  updates?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    totalCost?: number;
    elapsedMs?: number;
    actualModel?: string | null;
    providerName?: string | null;
    providerKeyModelId?: string | null;
    outputSnapshot?: Record<string, unknown> | null;
    errorMessage?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
  },
): Promise<void> {
  const patch: Record<string, unknown> = { status };

  if (updates?.inputTokens !== undefined) patch.prompt_tokens = updates.inputTokens;
  if (updates?.outputTokens !== undefined) patch.completion_tokens = updates.outputTokens;
  if (updates?.totalTokens !== undefined) patch.total_tokens = updates.totalTokens;
  if (updates?.totalCost !== undefined) patch.estimated_cost_usd = updates.totalCost;
  if (updates?.elapsedMs !== undefined) patch.elapsed_ms = updates.elapsedMs;
  if (updates?.actualModel !== undefined) patch.actual_model = updates.actualModel;
  if (updates?.providerName !== undefined) patch.provider_name = updates.providerName;
  if (updates?.providerKeyModelId !== undefined) patch.provider_key_model_id = updates.providerKeyModelId;
  if (updates?.outputSnapshot !== undefined) patch.output_snapshot = updates.outputSnapshot;
  if (updates?.errorMessage !== undefined) patch.error_message = updates.errorMessage;
  if (updates?.startedAt !== undefined) patch.started_at = updates.startedAt;
  if (updates?.completedAt !== undefined) patch.completed_at = updates.completedAt;

  const { error } = await service.from("rewrite_generation_runs").update(patch).eq("id", runId);

  if (error) {
    throw new Error(error.message);
  }
}

type RewriteMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

async function getRecentMessages(
  service: MinimalClient,
  conversationId: string,
  limit = 4,
): Promise<RewriteMessage[]> {
  const { data, error } = await service
    .from("rewrite_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as RewriteMessage[]).reverse();
}

export type GenerationSkillSnapshot = {
  skillId: string;
  skillVersionId: string;
  name: string;
  version: number;
  position: number;
  isActive: boolean;
};

export type GenerationAssetMention = {
  id: string;
  name: string;
};

export type GenerationContext = {
  systemPrompt: string;
  skillStack: GenerationSkillSnapshot[];
  skillVersionIds: string[];
  documentSnapshot: string | null;
  targetParagraphSnapshot: string | null;
  recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
  userPrompt: string;
};

const CANVAS_OUTPUT_PROTOCOL = [
  "最高输出协议：你正在为右侧文案画布生成内容。",
  "只输出可以直接放进画布的最终文案正文。",
  "禁止输出解释、寒暄、修改说明、标题包装、原文/修改后对照、Markdown 引导语。",
  "禁止出现“以下是”“我已帮你”“修改后：”“润色后：”“原文：”等对话性或包装性文字。",
  "保持自然段落，不要为了说明修改而额外分段。",
].join("\n");

const WRAPPER_LINE_PATTERN =
  /^(?:#{1,3}\s*)?(?:\*\*)?(?:【)?(?:修改后|润色后|终稿|最终文案|文案终稿|改写后|结果|版本|主版本)(?:】)?(?:\*\*)?\s*[:：]?\s*$/u;

const WRAPPER_PREFIX_PATTERN =
  /^(?:#{1,3}\s*)?(?:\*\*)?(?:【)?(?:修改后|润色后|终稿|最终文案|文案终稿|改写后|结果|版本|主版本)(?:】)?(?:\*\*)?\s*[:：]\s*/u;

const CONVERSATIONAL_PREFIX_PATTERN =
  /^(?:好的|可以|没问题|已根据.*|根据.*要求|我已.*|以下是.*|下面是.*|这里是.*|这是.*)(?:[:：，,。])?\s*$/u;

const EXPLICIT_SPLIT_PATTERN = /(拆成|分成|拆为|分为|分段|两段|2段|多段|展开成)/u;

export function sanitizeCanvasOutput(content: string) {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";

  return normalized
    .split(/\n\n+/)
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      while (lines.length > 0 && (WRAPPER_LINE_PATTERN.test(lines[0]) || CONVERSATIONAL_PREFIX_PATTERN.test(lines[0]))) {
        lines.shift();
      }

      if (lines[0]) {
        lines[0] = lines[0].replace(WRAPPER_PREFIX_PATTERN, "").trim();
      }

      return lines.join("\n").trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

function userExplicitlyAllowsSplit(prompt: string) {
  return EXPLICIT_SPLIT_PATTERN.test(prompt);
}

function splitCanvasParagraphs(content: string) {
  return content
    .replace(/\r\n/g, "\n")
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function normalizePatchParagraphs(input: {
  patchedContent: string;
  targetParagraphs: DocumentParagraph[];
  userPrompt?: string;
}) {
  const sanitized = sanitizeCanvasOutput(input.patchedContent);
  const nextParagraphs = splitCanvasParagraphs(sanitized);

  if (
    input.targetParagraphs.length === 1 &&
    nextParagraphs.length > 1 &&
    !userExplicitlyAllowsSplit(input.userPrompt ?? "")
  ) {
    return [nextParagraphs.join("\n")];
  }

  return nextParagraphs;
}

async function resolveProviderKeyModelByModelView(
  service: MinimalClient,
  modelViewId: string,
): Promise<string | null> {
  const { data, error } = await service
    .from("rewrite_model_routes")
    .select("id, model_view_id, provider_key_model_id, actual_model, priority, weight, is_enabled, created_at")
    .eq("model_view_id", modelViewId)
    .eq("is_enabled", true)
    .order("priority", { ascending: true })
    .order("weight", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const routes = ((data ?? []) as Array<{
    provider_key_model_id?: string | null;
    actual_model?: string | null;
  }>);

  for (const route of routes) {
    if (route.provider_key_model_id) {
      const config = await getProviderKeyModelConfig(service, route.provider_key_model_id);
      if (config) return route.provider_key_model_id;
      continue;
    }

    const selected = await selectHealthyProviderKeyModel(
      service,
      route.actual_model?.trim() || undefined,
    );
    if (selected) return selected.providerKeyModelId;
  }

  return null;
}

async function resolveFirstHealthyProviderKeyModelBySortedModelViews(
  service: MinimalClient,
): Promise<string | null> {
  const { data, error } = await service
    .from("rewrite_model_views")
    .select("id, sort_order, is_enabled, created_at")
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  for (const row of (data ?? []) as Array<{ id: string }>) {
    const selected = await resolveProviderKeyModelByModelView(service, row.id);
    if (selected) return selected;
  }

  return null;
}

export async function resolveGenerationProviderKeyModelId(
  service: MinimalClient,
  input: {
    conversationId: string;
    providerKeyModelId?: string | null;
    modelViewId?: string | null;
  },
): Promise<string | null> {
  const explicitProviderKeyModelId = input.providerKeyModelId?.trim();
  if (explicitProviderKeyModelId) return explicitProviderKeyModelId;

  const explicitModelViewId = input.modelViewId?.trim();
  if (explicitModelViewId) {
    const selected = await resolveProviderKeyModelByModelView(service, explicitModelViewId);
    if (selected) return selected;
  }

  const skills = await listConversationSkills(service, input.conversationId);
  const skillDefaultModelViewId = [...skills]
    .reverse()
    .find((skill) => skill.isActive && skill.skill.defaultModelViewId)?.skill.defaultModelViewId;

  if (skillDefaultModelViewId) {
    const selected = await resolveProviderKeyModelByModelView(service, skillDefaultModelViewId);
    if (selected) return selected;
  }

  const sortedModelViewSelection = await resolveFirstHealthyProviderKeyModelBySortedModelViews(service);
  if (sortedModelViewSelection) return sortedModelViewSelection;

  const selected = await selectHealthyProviderKeyModel(
    service,
    process.env.AI_MODEL?.trim() || undefined,
  );
  return selected?.providerKeyModelId ?? null;
}

export async function buildGenerationContext(
  service: MinimalClient,
  input: {
    conversationId: string;
    userPrompt: string;
    targetParagraphIds?: string[];
    assetMentions?: GenerationAssetMention[];
    includeSkillStack?: boolean;
    includeDocumentSnapshot?: boolean;
    contextLimit?: number | null;
  },
): Promise<GenerationContext> {
  const parts: string[] = [];
  let skillStack: GenerationSkillSnapshot[] = [];

  if (input.includeSkillStack !== false) {
    const conversationSkills = await listConversationSkills(service, input.conversationId);
    const activeSkills = conversationSkills.filter((skill) => skill.isActive);
    skillStack = activeSkills.map((skill) => ({
      skillId: skill.skillId,
      skillVersionId: skill.skillVersionId,
      name: skill.skill.name,
      version: skill.version.version,
      position: skill.position,
      isActive: skill.isActive,
    }));

    if (activeSkills.length > 0) {
      const skillStackPrompt = activeSkills
        .map((skill, index) => `Skill ${index + 1}/${activeSkills.length}: ${skill.skill.name}\n${skill.version.systemPrompt}`)
        .join("\n\n");
      parts.push(skillStackPrompt);
    }
  }

  let documentSnapshot: string | null = null;
  let targetParagraphSnapshot: string | null = null;
  const snapshot = await getCurrentDocumentSnapshot(service, input.conversationId);

  if (input.targetParagraphIds && input.targetParagraphIds.length > 0) {
    if (!snapshot?.paragraphs || snapshot.paragraphs.length === 0) {
      throw new Error("目标段落不存在");
    }

    const selectedParagraphs = snapshot.paragraphs.filter((paragraph) =>
      input.targetParagraphIds?.includes(paragraph.paragraphId),
    );
    if (selectedParagraphs.length === 0) {
      throw new Error("目标段落不存在");
    }

    targetParagraphSnapshot = selectedParagraphs
      .map((paragraph) => `${paragraph.isLocked ? "[LOCKED] " : ""}${paragraph.content}`)
      .join("\n\n");

    parts.push(
      `目标段落（仅重写这些段落，保持其他段落不变）：\n${targetParagraphSnapshot}`,
    );
  }

  if (input.assetMentions && input.assetMentions.length > 0) {
    parts.push(
      `引用的品牌/资产：${input.assetMentions.map((asset) => `${asset.name}(${asset.id})`).join("、")}`,
    );
  }

  if (input.includeDocumentSnapshot !== false && snapshot?.paragraphs && snapshot.paragraphs.length > 0) {
    const paragraphTexts = snapshot.paragraphs.map((p) => {
      const prefix = p.isLocked ? "[LOCKED] " : "";
      return `${prefix}${p.content}`;
    });
    documentSnapshot = paragraphTexts.join("\n\n");
    parts.push("标记为 [LOCKED] 的段落为用户锁定内容，生成时必须保持不变。");
    parts.push(`当前文档内容：\n${documentSnapshot}`);
  }

  parts.push(
    input.targetParagraphIds && input.targetParagraphIds.length > 0
      ? `${CANVAS_OUTPUT_PROTOCOL}\n局部修改时，只输出目标段落的新正文；没有明确要求拆分时，输出段落数量必须和目标段落数量一致。`
      : CANVAS_OUTPUT_PROTOCOL,
  );

  let recentMessages = await getRecentMessages(service, input.conversationId);
  if (typeof input.contextLimit === "number" && input.contextLimit > 0) {
    recentMessages = recentMessages.slice(-input.contextLimit);
  }

  return {
    systemPrompt: parts.join("\n\n"),
    skillStack,
    skillVersionIds: skillStack.map((skill) => skill.skillVersionId),
    documentSnapshot,
    targetParagraphSnapshot,
    recentMessages: recentMessages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    userPrompt: input.userPrompt,
  };
}

export type StreamEvent =
  | { type: "generation_start"; runId: string }
  | {
      type: "target_plan";
      scope: "paragraphs" | "full_document";
      targetParagraphIds: string[];
      runType: GenerationRunType;
    }
  | { type: "content_delta"; delta: string }
  | { type: "generation_complete"; runId: string; revisionId: string; fullContent: string }
  | { type: "error"; error: string };

function mergeLockedParagraphs(
  previousParagraphs: DocumentParagraph[],
  generatedParagraphs: string[],
) {
  const next = [...generatedParagraphs];
  for (const paragraph of previousParagraphs) {
    if (!paragraph.isLocked) continue;
    if (paragraph.position < next.length) {
      next[paragraph.position] = paragraph.content;
    } else {
      next.push(paragraph.content);
    }
  }
  return next;
}

type StreamChatChunk = {
  delta?: string;
  usage?: { inputTokens?: number | null; outputTokens?: number | null; totalTokens?: number | null };
  response?: Pick<AiResponse, "model" | "channelName" | "providerKeyModelId" | "elapsedMs">;
};

function streamChatWithCallAi(input: {
  providerKeyModelId?: string | null;
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): AsyncIterable<StreamChatChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      const queue: StreamChatChunk[] = [];
      let done = false;
      let failure: unknown = null;
      let streamedContent = "";
      let wake: (() => void) | null = null;

      const notify = () => {
        wake?.();
        wake = null;
      };

      const task = callAi({
        providerKeyModelId: input.providerKeyModelId ?? undefined,
        messages: [
          ...(input.systemPrompt
            ? [{ role: "system" as const, content: input.systemPrompt } satisfies AiMessage]
            : []),
          ...input.messages,
        ],
        onChunk(delta) {
          streamedContent += delta;
          queue.push({ delta });
          notify();
        },
      })
        .then((result) => {
          if (!streamedContent && result.content) {
            queue.push({ delta: result.content });
          }
          queue.push({
            usage: {
              inputTokens: result.promptTokens ?? null,
              outputTokens: result.completionTokens ?? null,
              totalTokens: result.totalTokens ?? null,
            },
            response: {
              model: result.model,
              channelName: result.channelName,
              providerKeyModelId: result.providerKeyModelId,
              elapsedMs: result.elapsedMs,
            },
          });
        })
        .catch((error) => {
          failure = error;
        })
        .finally(() => {
          done = true;
          notify();
        });

      while (!done || queue.length > 0) {
        if (queue.length > 0) {
          const chunk = queue.shift();
          if (chunk) yield chunk;
          continue;
        }

        await new Promise<void>((resolve) => {
          wake = resolve;
        });

        if (failure) {
          throw failure;
        }
      }

      await task;
      if (failure) {
        throw failure;
      }
    },
  };
}

export async function* streamGeneration(
  service: MinimalClient,
  input: {
    conversationId: string;
    userId: string;
    userPrompt: string;
    targetParagraphIds?: string[];
    assetMentions?: GenerationAssetMention[];
    runType?: GenerationRunType;
    providerKeyModelId?: string | null;
    modelViewId?: string | null;
    contextLimit?: number | null;
    aiClient?: {
      streamChat: (params: {
        systemPrompt: string;
        messages: Array<{ role: "user" | "assistant"; content: string }>;
      }) => AsyncIterable<StreamChatChunk>;
    };
  },
): AsyncGenerator<StreamEvent> {
  const targetParagraphIds = (input.targetParagraphIds ?? []).filter(Boolean);
  const assetMentions = (input.assetMentions ?? []).filter(
    (asset) => asset.id.trim() && asset.name.trim(),
  );
  const providerKeyModelId = input.providerKeyModelId ?? (
    input.aiClient
      ? null
      : await resolveGenerationProviderKeyModelId(service, {
          conversationId: input.conversationId,
          modelViewId: input.modelViewId,
        })
  );
  const runType = input.runType ?? (targetParagraphIds.length > 0 ? "paragraph_patch" : "full_rewrite");
  const context = await buildGenerationContext(service, {
    conversationId: input.conversationId,
    userPrompt: input.userPrompt,
    targetParagraphIds,
    assetMentions,
    contextLimit: input.contextLimit,
  });
  const messages = [...context.recentMessages, { role: "user" as const, content: input.userPrompt }];

  const run = await createGenerationRun(service, {
    conversationId: input.conversationId,
    userId: input.userId,
    runType,
    providerKeyModelId,
    skillVersionIds: context.skillVersionIds,
    inputSnapshot: {
      userPrompt: input.userPrompt,
      skillStack: context.skillStack,
      documentSnapshot: context.documentSnapshot,
      targetParagraphSnapshot: context.targetParagraphSnapshot,
      recentMessages: context.recentMessages,
      targetParagraphIds,
      assetMentions,
      modelViewId: input.modelViewId ?? null,
      providerKeyModelId,
    },
  });

  yield { type: "generation_start", runId: run.id };
  yield {
    type: "target_plan",
    scope: targetParagraphIds.length > 0 ? "paragraphs" : "full_document",
    targetParagraphIds,
    runType,
  };

  try {
    await updateGenerationRunStatus(service, run.id, "streaming", {
      startedAt: new Date().toISOString(),
    });

    let fullContent = "";
    let usage: StreamChatChunk["usage"] | undefined;
    let aiResponse: StreamChatChunk["response"] | undefined;

    const aiClient = input.aiClient ?? {
      streamChat: (params: {
        systemPrompt: string;
        messages: Array<{ role: "user" | "assistant"; content: string }>;
      }) => streamChatWithCallAi({
        ...params,
        providerKeyModelId,
      }),
    };

    for await (const chunk of aiClient.streamChat({ systemPrompt: context.systemPrompt, messages })) {
      if (chunk.delta) {
        fullContent += chunk.delta;
        yield { type: "content_delta", delta: chunk.delta };
      }
      if (chunk.usage) {
        usage = chunk.usage;
      }
      if (chunk.response) {
        aiResponse = chunk.response;
      }
    }

    const completedAt = new Date().toISOString();

    const document = await getCurrentDocumentSnapshot(service, input.conversationId);
    if (!document) {
      throw new Error("Document not found");
    }

    let revisionId: string;
    let protectedFullContent: string;
    let paragraphCount: number;
    if (targetParagraphIds.length > 0) {
      const patchResult = await createParagraphPatchRevision(service, {
        conversationId: input.conversationId,
        userId: input.userId,
        generationRunId: run.id,
        targetParagraphIds,
        patchedContent: fullContent,
        userPrompt: input.userPrompt,
      });
      revisionId = patchResult.revisionId;
      protectedFullContent = patchResult.fullContent;
      paragraphCount = patchResult.paragraphCount;
    } else {
      const paragraphContents = mergeLockedParagraphs(document.paragraphs, splitCanvasParagraphs(sanitizeCanvasOutput(fullContent)));
      protectedFullContent = paragraphContents.join("\n\n");

      const revision = await createRevision(service, {
        documentId: document.document.id,
        parentRevisionId: document.document.currentRevisionId,
        sourceType: "ai_generation",
        status: "completed",
        generationRunId: run.id,
        fullContent: protectedFullContent,
      });

      revisionId = revision.id;
      const paragraphData = paragraphContents.map((content, index) => ({
        paragraphId: `p-${Date.now()}-${index}`,
        position: index,
        content,
        isLocked: document.paragraphs.find((p) => p.isLocked && p.position === index)?.isLocked ?? false,
        sourceType: "ai" as const,
      }));

      await createParagraphs(service, {
        revisionId: revision.id,
        paragraphs: paragraphData,
      });
      paragraphCount = paragraphData.length;
      await setCurrentRevision(service, document.document.id, revision.id);
    }

    const promptTokens = typeof usage?.inputTokens === "number" ? usage.inputTokens : undefined;
    const completionTokens = typeof usage?.outputTokens === "number" ? usage.outputTokens : undefined;
    const totalTokens =
      typeof usage?.totalTokens === "number"
        ? usage.totalTokens
        : promptTokens !== undefined && completionTokens !== undefined
          ? promptTokens + completionTokens
          : undefined;

    await updateGenerationRunStatus(service, run.id, "completed", {
      completedAt,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      totalTokens,
      totalCost:
        promptTokens !== undefined && completionTokens !== undefined
          ? promptTokens * 0.000003 + completionTokens * 0.000015
          : undefined,
      actualModel: aiResponse?.model ?? null,
      providerName: aiResponse?.channelName ?? null,
      providerKeyModelId: aiResponse?.providerKeyModelId ?? providerKeyModelId,
      elapsedMs: aiResponse?.elapsedMs,
      outputSnapshot: {
        fullContent: protectedFullContent,
        revisionId,
        paragraphCount,
        targetParagraphIds,
        lockedParagraphIds: document.paragraphs.filter((p) => p.isLocked).map((p) => p.paragraphId),
      },
    });

    yield {
      type: "generation_complete",
      runId: run.id,
      revisionId,
      fullContent: protectedFullContent,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await updateGenerationRunStatus(service, run.id, "failed", {
      errorMessage,
      completedAt: new Date().toISOString(),
    });

    yield { type: "error", error: errorMessage };
  }
}

export async function createParagraphPatchRevision(
  service: MinimalClient,
  input: {
    conversationId: string;
    userId: string;
    generationRunId: string;
    targetParagraphIds: string[];
    patchedContent: string;
    userPrompt?: string;
  },
): Promise<{ revisionId: string; fullContent: string; paragraphCount: number }> {
  const snapshot = await getCurrentDocumentSnapshot(service, input.conversationId);
  if (!snapshot || !snapshot.revision) {
    throw new Error("No current document revision");
  }

  const newRevision = await createRevision(service, {
    documentId: snapshot.document.id,
    parentRevisionId: snapshot.revision.id,
    sourceType: "paragraph_patch",
    status: "pending",
    generationRunId: input.generationRunId,
  });

  const unlockedTargetParagraphs = snapshot.paragraphs.filter(
    (p) => input.targetParagraphIds.includes(p.paragraphId) && !p.isLocked,
  );
  if (unlockedTargetParagraphs.length === 0) {
    throw new Error("目标段落不存在或已锁定");
  }

  const unlockedTargetIds = new Set(unlockedTargetParagraphs.map((p) => p.paragraphId));
  const existingParagraphs = snapshot.paragraphs.filter((p) => !unlockedTargetIds.has(p.paragraphId));

  const patchedParagraphContents = normalizePatchParagraphs({
    patchedContent: input.patchedContent,
    targetParagraphs: unlockedTargetParagraphs,
    userPrompt: input.userPrompt,
  });
  const patchedParagraphs = patchedParagraphContents.map((content, index) => ({
    paragraphId: unlockedTargetParagraphs[index]?.paragraphId ?? `patch-${Date.now()}-${index}`,
    content,
    sourceType: "ai" as const,
  }));

  const targetPosition =
    unlockedTargetParagraphs[0]?.position ?? 0;

  const beforeParagraphs = existingParagraphs.filter((p) => p.position < targetPosition);
  const afterParagraphs = existingParagraphs.filter((p) => p.position >= targetPosition);

  const finalParagraphs = [
    ...beforeParagraphs.map((p, index) => ({
      paragraphId: p.paragraphId,
      position: index,
      content: p.content,
      isLocked: p.isLocked,
      sourceType: p.sourceType,
    })),
    ...patchedParagraphs.map((p, index) => ({
      ...p,
      position: beforeParagraphs.length + index,
      isLocked: false,
    })),
    ...afterParagraphs.map((p, index) => ({
      paragraphId: p.paragraphId,
      position: beforeParagraphs.length + patchedParagraphs.length + index,
      content: p.content,
      isLocked: p.isLocked,
      sourceType: p.sourceType,
    })),
  ];

  await createParagraphs(service, {
    revisionId: newRevision.id,
    paragraphs: finalParagraphs,
  });

  const fullContent = finalParagraphs.map((p) => p.content).join("\n\n");

  await updateRevisionStatus(service, newRevision.id, "completed", fullContent);
  await setCurrentRevision(service, snapshot.document.id, newRevision.id);

  return {
    revisionId: newRevision.id,
    fullContent,
    paragraphCount: finalParagraphs.length,
  };
}
