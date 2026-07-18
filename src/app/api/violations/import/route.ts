import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { parseViolationImportWorkbook } from "@/lib/violations/import";
import {
  getAuthenticatedContext,
  jsonBadRequest,
  jsonServerError,
  jsonUnauthorized,
  requireViolationAdmin,
} from "@/lib/violations/api";
import { hasZipSignature } from "@/lib/file-signatures";

export const runtime = "nodejs";
const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const { supabase, user } = await getAuthenticatedContext();
  if (!user) return jsonUnauthorized();

  const admin = await requireViolationAdmin(supabase, user);
  if (!admin.ok) return admin.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonBadRequest("请求体必须是 multipart/form-data");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonBadRequest("file 为必填项");
  }

  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return jsonBadRequest("仅支持 .xlsx 文件");
  }
  if (file.size <= 0 || file.size > MAX_IMPORT_FILE_SIZE) {
    return jsonBadRequest("Excel 文件必须大于 0 且不能超过 10MB");
  }

  const workbookBuffer = await file.arrayBuffer();
  if (!hasZipSignature(new Uint8Array(workbookBuffer))) {
    return jsonBadRequest("文件内容不是有效的 .xlsx 工作簿");
  }

  let parsed;
  try {
    parsed = parseViolationImportWorkbook(workbookBuffer, {
      submittedBy: user.id,
      teamId: admin.profile.team_id,
    });
  } catch {
    return jsonBadRequest("解析 Excel 失败");
  }

  if (parsed.rows.length > 0) {
    const { error } = await createAdminClient()
      .from("violation_cases")
      .insert(parsed.rows);

    if (error) {
      return jsonServerError("批量导入违规案例失败");
    }
  }

  return NextResponse.json({
    imported: parsed.rows.length,
    skipped: parsed.skipped,
    errors: parsed.errors,
  });
}
