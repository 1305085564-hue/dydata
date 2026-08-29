import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildImportSummary,
  buildParsedImportRows,
  loadTopicNameMap,
  parseTopicImportFile,
  TOPIC_IMPORT_MAX_FILE_BYTES,
} from "@/lib/topics/import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireAdminActor({ requiredPermission: "review_content" });
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "请求必须是 multipart/form-data 格式" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请选择要导入的文件" }, { status: 400 });
  }
  if (file.size > TOPIC_IMPORT_MAX_FILE_BYTES) {
    return NextResponse.json({ error: "文件过大，请控制在 2MB 以内" }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseTopicImportFile(buffer, file.name);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }

  try {
    const topicNameMap = await loadTopicNameMap(createAdminClient());
    const rows = buildParsedImportRows(parsed.rows, topicNameMap);
    return NextResponse.json({
      fileName: file.name,
      rows,
      summary: buildImportSummary(rows),
    });
  } catch (error) {
    console.error("[topics-library] import parse failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "解析文件失败" }, { status: 500 });
  }
}
