import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { callStructuredAi } from "@/lib/ai/shared";
import {
  ADMIN_AI_ALLOWED_TOOLS,
  ADMIN_AI_SYSTEM_PROMPT,
  assertToolIsWhitelisted,
  shouldRequireConfirmation,
  type AdminAiToolName,
} from "@/lib/admin-ai/core";
import {
  buildConfirmationRequiredPresentation,
  buildSuccessPresentation,
  type AssistantDebug,
} from "@/lib/admin-ai/presentation";
import { executeAdminTool } from "@/lib/admin-tools";

import { requireAdminActor, toObject, toTrimmedString } from "./_shared";

type ActionType = "query" | "modify" | "delete" | "retry_task" | "config_change" | "diagnosis";
type ActionCategory = "user_management" | "data_correction" | "task_management" | "config" | "diagnosis";

const TOOL_META: Record<
  AdminAiToolName,
  { actionType: ActionType; actionCategory: ActionCategory; targetType: string; description: string }
> = {
  getUserInfo: {
    actionType: "query",
    actionCategory: "user_management",
    targetType: "user",
    description: "查询用户信息",
  },
  getAnomalousData: {
    actionType: "query",
    actionCategory: "data_correction",
    targetType: "metrics",
    description: "查询异常数据",
  },
  getTaskStatus: {
    actionType: "query",
    actionCategory: "task_management",
    targetType: "task",
    description: "查询任务状态",
  },
  kickUser: {
    actionType: "delete",
    actionCategory: "user_management",
    targetType: "user",
    description: "踢出用户",
  },
  changeUserRole: {
    actionType: "modify",
    actionCategory: "user_management",
    targetType: "user",
    description: "修改用户角色",
  },
  updateUserPermissions: {
    actionType: "modify",
    actionCategory: "user_management",
    targetType: "user",
    description: "修改用户权限",
  },
  deleteMetrics: {
    actionType: "delete",
    actionCategory: "data_correction",
    targetType: "video_metrics",
    description: "删除错误数据",
  },
  fillMissingData: {
    actionType: "modify",
    actionCategory: "data_correction",
    targetType: "video_metrics",
    description: "补填数据",
  },
  grantExemption: {
    actionType: "modify",
    actionCategory: "data_correction",
    targetType: "exemption",
    description: "标记豁免",
  },
  retryContentBreakdown: {
    actionType: "retry_task",
    actionCategory: "task_management",
    targetType: "task",
    description: "重跑内容拆解",
  },
  retryDailyReview: {
    actionType: "retry_task",
    actionCategory: "task_management",
    targetType: "task",
    description: "重跑次日复盘",
  },
  clearCache: {
    actionType: "config_change",
    actionCategory: "config",
    targetType: "cache",
    description: "清理分析结果数据",
  },
  diagnoseIssue: {
    actionType: "diagnosis",
    actionCategory: "diagnosis",
    targetType: "issue",
    description: "诊断问题",
  },
};

function buildTargetId(params: Record<string, unknown>) {
  const keys = ["userId", "metricsId", "contentItemId", "taskType", "date"] as const;
  for (const key of keys) {
    const value = toTrimmedString(params[key]);
    if (value) return value;
  }
  return null;
}

function buildRiskContext(params: Record<string, unknown>) {
  const rawCacheType = toTrimmedString(params.cacheType);
  const cacheType =
    rawCacheType && ["all", "user_metrics", "leaderboard", "analytics"].includes(rawCacheType)
      ? (rawCacheType as "all" | "user_metrics" | "leaderboard" | "analytics")
      : undefined;

  return {
    batch: Array.isArray(params.userIds) || Array.isArray(params.videoIds),
    cacheType,
  };
}

function buildAiPrompt(message: string) {
  return [
    ADMIN_AI_SYSTEM_PROMPT,
    "",
    "你必须只输出 JSON，格式如下：",
    '{"reply":"给管理员看的一句话","toolName":"白名单工具名","params":{},"reasoning":"简短原因"}',
    "",
    `可用工具：${ADMIN_AI_ALLOWED_TOOLS.join(", ")}`,
    "若用户表达不清或无法确定工具，toolName 填空字符串，并在 reply 中要求补充信息。",
    "",
    `管理员输入：${message}`,
  ].join("\n");
}

function parseAiDecision(raw: string): {
  reply: string;
  toolName: AdminAiToolName | null;
  params: Record<string, unknown>;
  reasoning: string;
} {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`AI 返回非 JSON 格式：${raw.slice(0, 100)}`);
  }
  const reply = toTrimmedString(parsed.reply) || "收到，开始处理";
  const rawToolName = toTrimmedString(parsed.toolName);
  let toolName: AdminAiToolName | null = null;
  if (rawToolName) {
    assertToolIsWhitelisted(rawToolName);
    toolName = rawToolName;
  }
  const params = toObject(parsed.params);
  const reasoning = toTrimmedString(parsed.reasoning);

  return {
    reply,
    toolName,
    params,
    reasoning,
  };
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminActor({ requiredPermission: "use_ai_management" });
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { supabase, actor } = auth;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const message = toTrimmedString(body.message);
  const conversationId = toTrimmedString(body.conversationId) || randomUUID();

  if (!message) {
    return NextResponse.json({ error: "缺少 message" }, { status: 400 });
  }

  let decision: ReturnType<typeof parseAiDecision>;
  try {
    const aiResult = await callStructuredAi({
      prompt: buildAiPrompt(message),
      maxTokens: 800,
      timeoutMs: 20000,
      featureKey: "admin_assistant",
    });
    decision = parseAiDecision(aiResult.jsonString);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "AI 解析失败";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }

  const { toolName, params, reply, reasoning } = decision;

  try {
    if (!toolName) {
      return NextResponse.json({
        conversationId,
        response: {
          type: "text",
          answer: reply || "请补充更具体的指令（对象、时间、目标）",
        },
      });
    }

    const meta = TOOL_META[toolName];
    const needsConfirmation = shouldRequireConfirmation(toolName, buildRiskContext(params));
    const successPresentationPreview = buildSuccessPresentation({
      toolName,
      params,
      result: { success: true, data: {} },
    });

    const actionInsert = {
      conversation_id: conversationId,
      admin_id: actor.userId,
      action_type: meta.actionType,
      action_category: meta.actionCategory,
      target_type: meta.targetType,
      target_id: buildTargetId(params),
      description: successPresentationPreview.historyTitle,
      ai_reasoning: reasoning || null,
      tool_name: toolName,
      tool_params: params,
      requires_confirmation: needsConfirmation,
      result: needsConfirmation ? "pending_confirm" : "success",
    };

    if (needsConfirmation) {
      const dryRunResult = await executeAdminTool({
        toolName,
        params,
        context: {
          actorId: actor.userId,
          actorRole: actor.role,
          actorBusinessRole: actor.businessRole,
          actorPermissions: actor.permissions,
        },
        dryRun: true,
      });

      if (!dryRunResult.success) {
        return NextResponse.json(
          {
            conversationId,
            response: {
              type: "text",
              answer: dryRunResult.error ?? "预检查失败，未进入确认流程",
            },
          },
          { status: 400 },
        );
      }

      const presentation = buildConfirmationRequiredPresentation({
        toolName,
        params,
        result: dryRunResult,
      });
      const debug: AssistantDebug | undefined =
        actor.businessRole === "owner" || actor.businessRole === "team_admin"
          ? {
              toolName,
              toolParams: params,
              backupSql: dryRunResult.backupSql ?? null,
              beforeSnapshot: dryRunResult.beforeSnapshot ?? null,
            }
          : undefined;

      const { data: row, error } = await supabase
        .from("admin_actions")
        .insert({
          ...actionInsert,
          description: presentation.historyTitle,
          backup_sql: dryRunResult.backupSql ?? null,
          before_snapshot: dryRunResult.beforeSnapshot ?? null,
          error_message: dryRunResult.success ? null : dryRunResult.error ?? "dryRun 失败",
        })
        .select("id")
        .single();

      if (error || !row) {
        return NextResponse.json({ error: error?.message ?? "写入 admin_actions 失败" }, { status: 500 });
      }

      return NextResponse.json({
        conversationId,
        response: {
          type: "confirmation",
          answer: presentation.answer,
          details: presentation.details,
          toolCall: {
            toolName,
            params,
            needsConfirmation: true,
            confirmationMessage: "这是高风险操作，确认后才会执行。",
            confirmationReason: "会直接影响后台数据或权限，所以需要你先确认。",
            details: presentation.details,
            debug,
          },
        },
        actionId: row.id,
      });
    }

    const runResult = await executeAdminTool({
      toolName,
      params,
      context: {
        actorId: actor.userId,
        actorRole: actor.role,
        actorBusinessRole: actor.businessRole,
        actorPermissions: actor.permissions,
      },
    });

    const presentation = runResult.success
      ? buildSuccessPresentation({
          toolName,
          params,
          result: runResult,
        })
      : {
          answer: runResult.error ?? "执行失败",
          historyTitle: successPresentationPreview.historyTitle,
        };

    const { data: row, error } = await supabase
      .from("admin_actions")
      .insert({
        ...actionInsert,
        description: presentation.historyTitle,
        result: runResult.success ? "success" : "failed",
        backup_sql: runResult.backupSql ?? null,
        before_snapshot: runResult.beforeSnapshot ?? null,
        after_snapshot: runResult.afterSnapshot ?? null,
        error_message: runResult.success ? null : runResult.error ?? "执行失败",
        executed_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !row) {
      return NextResponse.json({ error: error?.message ?? "写入 admin_actions 失败" }, { status: 500 });
    }

    if (toolName === "diagnoseIssue") {
      const issueType = toTrimmedString(runResult.data?.issueType);
      if (issueType === "code_bug") {
        await supabase.from("system_issues").insert({
          reported_by: actor.userId,
          issue_type: "code_bug",
          description: message,
          ai_diagnosis: toTrimmedString(runResult.data?.diagnosis) || "AI 诊断为代码问题",
          related_action_id: row.id,
        });

        const webhook = process.env.FEISHU_WEBHOOK_URL;
        if (webhook) {
          try {
            const response = await fetch(webhook, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                msg_type: "text",
                content: {
                  text: `🚨 站内AI发现代码问题\n报告人: ${actor.name ?? actor.userId}\n描述: ${message.slice(0, 200)}`,
                },
              }),
            });
            if (!response.ok) {
              console.error("[飞书通知失败]", response.status, await response.text());
            }
          } catch (error) {
            console.error("[飞书通知异常]", error);
          }
        }
      }
    }

    return NextResponse.json({
      conversationId,
      response: {
        type: runResult.success ? "result" : "text",
        answer: presentation.answer,
        details: runResult.success ? presentation.details : undefined,
      },
      actionId: row.id,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "执行失败";
    console.error("[admin/ai-assistant][POST] 执行异常", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
