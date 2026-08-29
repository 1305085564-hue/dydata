import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import { executeTopicImport, TOPIC_IMPORT_MAX_ROWS, type TopicImportParsedRow } from "@/lib/topics/import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminActor({ requiredPermission: "review_content" });
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "请求体格式不正确" }, { status: 400 });
  }

  const rawRows = (body as { rows?: unknown }).rows;
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    return NextResponse.json({ error: "没有可导入的数据行" }, { status: 400 });
  }
  if (rawRows.length > TOPIC_IMPORT_MAX_ROWS) {
    return NextResponse.json({ error: `单次最多导入 ${TOPIC_IMPORT_MAX_ROWS} 行` }, { status: 400 });
  }

  // 只接收允许的字段，服务端会在 executeTopicImport 中完整重新校验
  const rows: TopicImportParsedRow[] = rawRows.map((raw, index) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    return {
      rowNumber: typeof row.rowNumber === "number" ? row.rowNumber : index + 2,
      topicName: toText(row.topicName),
      title: toText(row.title),
      durationText: toText(row.durationText),
      durationSeconds: null,
      historyPlay: null,
      historyLikes: null,
      hook: toText(row.hook) || null,
      outline: toText(row.outline) || null,
      status: "valid",
      message: null,
    };
  });

  try {
    const result = await executeTopicImport(createAdminClient(), {
      rows,
      adminId: auth.actor.userId,
      fileName: typeof (body as { fileName?: unknown }).fileName === "string"
        ? (body as { fileName: string }).fileName
        : null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[topics-library] import confirm failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "导入执行失败" }, { status: 500 });
  }
}
