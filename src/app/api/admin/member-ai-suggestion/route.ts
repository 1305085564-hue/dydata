import { NextRequest, NextResponse } from "next/server";

import { requireAdminActor, toObject, toTrimmedString } from "@/app/api/admin/auth-helper";
import { ADMIN_AI_ALLOWED_TOOLS, isWhitelistedToolName } from "@/lib/admin-ai/core";
import { getAnomalousData, getUserInfo } from "@/lib/admin-tools/data-query";
import { callAiJson, extractJsonString } from "@/lib/ai/client";
import { buildDataAccessScope, type DataAccessScope } from "@/lib/data-access-scope";
import { createAdminClient } from "@/lib/supabase/admin";

type SuggestionAction =
  | {
      type: "execute_tool";
      toolName: (typeof ADMIN_AI_ALLOWED_TOOLS)[number];
      toolArgs?: Record<string, unknown>;
    }
  | {
      type: "navigate";
      href: string;
    };

type SuggestionItem = {
  label: string;
  description: string;
  action: SuggestionAction;
};

type MemberSuggestionPayload = {
  status: "normal" | "warning" | "critical";
  summary: string;
  suggestions: SuggestionItem[];
  generatedAt: string;
};

type MemberProfile = {
  id: string;
  name: string | null;
  role: string | null;
  team_id: string | null;
};

type ToolResult = Awaited<ReturnType<typeof getAnomalousData>>;
type UserInfoResult = Awaited<ReturnType<typeof getUserInfo>>;
type AdminActorResult = Awaited<ReturnType<typeof requireAdminActor>>;

type RouteDeps = {
  requireAdminActor: typeof requireAdminActor;
  createAdminClient: typeof createAdminClient;
  buildDataAccessScope: typeof buildDataAccessScope;
  getUserInfo: typeof getUserInfo;
  getAnomalousData: typeof getAnomalousData;
  callAiJson: typeof callAiJson;
  now: () => Date;
};

function isAuthError(result: AdminActorResult): result is Extract<AdminActorResult, { error: string; status: 401 | 403 }> {
  return "error" in result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isVisibleAdminScope(
  scope: DataAccessScope | null,
): scope is DataAccessScope & { businessRole: "owner" | "team_admin" } {
  return Boolean(scope && (scope.businessRole === "owner" || scope.businessRole === "team_admin"));
}

function normalizeExecuteAction(value: unknown): SuggestionAction | null {
  if (!isRecord(value)) return null;

  const type = toTrimmedString(value.type);
  if (type === "navigate") {
    const href = toTrimmedString(value.href);
    if (!href) return null;
    return { type: "navigate", href };
  }

  if (type === "execute_tool") {
    const toolName = toTrimmedString(value.toolName);
    if (!toolName || !isWhitelistedToolName(toolName)) return null;
    return {
      type: "execute_tool",
      toolName,
      toolArgs: toObject(value.toolArgs),
    };
  }

  return null;
}

function normalizeSuggestions(value: unknown): SuggestionItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!isRecord(item)) return null;

      const label = toTrimmedString(item.label);
      const description = toTrimmedString(item.description);
      const action = normalizeExecuteAction(item.action);

      if (!label || !description || !action) return null;
      return { label, description, action } satisfies SuggestionItem;
    })
    .filter((item): item is SuggestionItem => item !== null)
    .slice(0, 3);
}

function parseMemberSuggestion(content: string, generatedAt: string): MemberSuggestionPayload | null {
  const jsonString = extractJsonString(content);
  if (!jsonString) return null;

  try {
    const parsed = JSON.parse(jsonString) as Record<string, unknown>;
    const summary = toTrimmedString(parsed.summary);
    if (!summary) return null;

    const rawStatus = toTrimmedString(parsed.status);
    const status =
      rawStatus === "critical" || rawStatus === "warning" || rawStatus === "normal"
        ? rawStatus
        : "warning";

    return {
      status,
      summary,
      suggestions: normalizeSuggestions(parsed.suggestions),
      generatedAt,
    };
  } catch {
    return null;
  }
}

function toSafeData(result: UserInfoResult) {
  if (!result.success || !isRecord(result.data)) return null;
  return result.data;
}

function extractMemberAnomalies(result: ToolResult, memberId: string) {
  if (!result.success || !isRecord(result.data) || !Array.isArray(result.data.anomalies)) {
    return [];
  }

  return result.data.anomalies.filter((item) => isRecord(item) && item.userId === memberId);
}

function buildMemberSuggestionPrompt(input: {
  generatedAt: string;
  member: MemberProfile;
  userInfo: Record<string, unknown>;
  noSubmissionAnomalies: Array<Record<string, unknown>>;
  spikeAnomalies: Array<Record<string, unknown>>;
}) {
  return [
    "你是 DYData 后台成员管理顾问。",
    "只返回 JSON，不要 markdown，不要解释。",
    'JSON 结构固定为：{"status":"normal|warning|critical","summary":"一句判断","suggestions":[{"label":"动作名","description":"为什么这样做","action":{"type":"execute_tool|navigate","toolName":"白名单工具名","toolArgs":{},"href":"/path"}}]}',
    "要求：",
    "1. 建议最多 3 条，按优先级排序。",
    "2. summary 要直接说问题，不说空话。",
    "3. execute_tool 的 toolName 只能从白名单里选；navigate 只能给站内相对路径。",
    "4. 若问题轻微，status=normal；若需跟进，status=warning；若明显异常或连续缺报，status=critical。",
    `5. 可用工具白名单：${ADMIN_AI_ALLOWED_TOOLS.join(", ")}`,
    "6. 不要发明系统没有的动作。",
    "",
    `当前时间：${input.generatedAt}`,
    `成员信息：${JSON.stringify(input.member)}`,
    `成员上下文：${JSON.stringify(input.userInfo)}`,
    `缺报异常：${JSON.stringify(input.noSubmissionAnomalies)}`,
    `播放异常：${JSON.stringify(input.spikeAnomalies)}`,
  ].join("\n");
}

async function loadMemberProfile(memberId: string, deps: RouteDeps) {
  const { data, error } = await deps.createAdminClient()
    .from("profiles")
    .select("id, name, role, team_id")
    .eq("id", memberId)
    .single<MemberProfile>();

  if (error || !data) {
    return null;
  }

  return data;
}

export async function buildMemberAiSuggestionResponse(
  input: { memberId: string },
  deps: RouteDeps = {
    requireAdminActor,
    createAdminClient,
    buildDataAccessScope,
    getUserInfo,
    getAnomalousData,
    callAiJson,
    now: () => new Date(),
  },
) {
  const auth = await deps.requireAdminActor({ requiredPermission: "use_ai_management" });
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (auth.actor.businessRole !== "owner" && auth.actor.businessRole !== "team_admin") {
    return NextResponse.json({ error: "仅 owner 和负责人可使用该功能" }, { status: 403 });
  }

  const memberId = toTrimmedString(input.memberId);
  if (!memberId) {
    return NextResponse.json({ error: "缺少 memberId" }, { status: 400 });
  }

  const rawScope = await deps.buildDataAccessScope(deps.createAdminClient(), auth.actor.userId);
  if (!isVisibleAdminScope(rawScope)) {
    return NextResponse.json({ error: "当前账号没有成员建议权限" }, { status: 403 });
  }
  const scope = rawScope;

  const member = await loadMemberProfile(memberId, deps);
  if (!member) {
    return NextResponse.json({ error: "成员不存在" }, { status: 404 });
  }

  if (member.role === "owner") {
    return NextResponse.json({ error: "owner 不支持生成成员建议" }, { status: 400 });
  }

  if (!scope.visibleUserIds.includes(member.id)) {
    return NextResponse.json({ error: "无权查看该成员" }, { status: 403 });
  }

  const userInfoResult = await deps.getUserInfo({ userId: memberId });
  const userInfo = toSafeData(userInfoResult);
  if (!userInfo) {
    return NextResponse.json({ error: userInfoResult.error ?? "成员上下文读取失败" }, { status: 500 });
  }

  const today = deps.now().toISOString().slice(0, 10);
  const monthAgo = new Date(deps.now().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [noSubmissionResult, spikeResult] = await Promise.all([
    deps.getAnomalousData({ type: "no_submission", dateRange: { end: today } }),
    deps.getAnomalousData({ type: "abnormal_spike", dateRange: { start: monthAgo, end: today } }),
  ]);

  const generatedAt = deps.now().toISOString();
  const prompt = buildMemberSuggestionPrompt({
    generatedAt,
    member,
    userInfo,
    noSubmissionAnomalies: extractMemberAnomalies(noSubmissionResult, memberId),
    spikeAnomalies: extractMemberAnomalies(spikeResult, memberId),
  });

  try {
    const aiResult = await deps.callAiJson(prompt, {
      maxTokens: 1400,
      timeoutMs: 15000,
      featureKey: "member_ai_suggestion",
    });

    const payload = parseMemberSuggestion(aiResult.content, generatedAt);
    if (!payload) {
      return NextResponse.json({ error: "AI 返回结构解析失败" }, { status: 500 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 建议生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = toObject(await request.json());
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  return buildMemberAiSuggestionResponse({
    memberId: toTrimmedString(body.memberId),
  });
}
