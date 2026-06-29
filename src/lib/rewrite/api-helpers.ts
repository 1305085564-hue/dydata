import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { NextRequest, NextResponse } from "next/server";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }
  return { user };
}

export async function requireConversationOwner(conversationId: string, userId: string) {
  const service = createServiceClient();
  const { data, error } = await service
    .from("rewrite_conversations")
    .select("user_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "对话不存在" }, { status: 404 });
  }

  if (data.user_id !== userId) {
    return NextResponse.json({ error: "无权访问此对话" }, { status: 403 });
  }

  return null;
}

export function jsonResponse<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

function normalizeV2ErrorMessage(message: string) {
  const missingV2SchemaVersion =
    message.includes("schema_version") &&
    (message.includes("column") && message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("Could not find the '"));
  const missingV2Tables =
    (message.includes("rewrite_documents") ||
      message.includes("rewrite_skills") ||
      message.includes("rewrite_skill_versions") ||
      message.includes("ai_providers") ||
      message.includes("ai_provider_keys")) &&
    (message.includes("relation") && message.includes("does not exist") ||
      message.includes("Could not find the table") ||
      message.includes("schema cache"));

  if (missingV2SchemaVersion || missingV2Tables) {
    return "文案助手 v2 数据表未就绪，请先执行对应 migration";
  }

  if (message.includes("invalid input syntax for type uuid")) {
    return "会话 ID 格式不正确";
  }

  return message;
}

function getErrorStatus(message: string) {
  if (message.includes("数据表未就绪") || message.includes("schema cache")) return 503;
  if (message === "对话不存在") return 404;
  if (message.includes("未授权")) return 401;
  if (message.includes("无权访问")) return 403;
  if (message.includes("格式错误") || message.includes("格式不正确")) return 400;
  return null;
}

export function errorResponse(error: string | Error, fallbackStatus = 500) {
  const rawMessage = error instanceof Error ? error.message : error;
  const message = normalizeV2ErrorMessage(rawMessage);
  const status = getErrorStatus(message);
  return NextResponse.json({ error: message }, { status: status || fallbackStatus });
}

export async function parseJsonBody<T>(req: NextRequest): Promise<T | NextResponse> {
  try {
    const body = await req.json();
    return body as T;
  } catch {
    return errorResponse("请求体格式错误", 400);
  }
}

export function createSSEStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
  });

  function send(event: string, data: unknown) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    controller.enqueue(encoder.encode(message));
  }

  function close() {
    controller.close();
  }

  return {
    stream,
    send,
    close,
    response: new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    }),
  };
}
