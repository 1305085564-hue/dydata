import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  ALLOWED_SCREENSHOT_TYPES,
  getAuthenticatedContext,
  jsonBadRequest,
  jsonServerError,
  jsonUnauthorized,
  MAX_SCREENSHOT_SIZE,
  sanitizeFilename,
  VIOLATION_SCREENSHOT_BUCKET,
} from "@/lib/violations/api";
import { hasMatchingImageSignature } from "@/lib/file-signatures";

export async function POST(request: NextRequest) {
  const { user } = await getAuthenticatedContext();

  if (!user) {
    return jsonUnauthorized();
  }

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

  if (!ALLOWED_SCREENSHOT_TYPES.has(file.type)) {
    return jsonBadRequest("只支持 PNG、JPEG、WebP 图片");
  }

  if (file.size > MAX_SCREENSHOT_SIZE) {
    return jsonBadRequest("截图不能超过 5MB");
  }
  if (file.size <= 0) {
    return jsonBadRequest("截图为空或已损坏");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasMatchingImageSignature(buffer, file.type)) {
    return jsonBadRequest("图片内容与文件类型不一致或文件已损坏");
  }

  const now = new Date();
  const datePart = now.toISOString().slice(0, 10);
  const timestamp = now.getTime();
  const filename = sanitizeFilename(file.name);
  const objectPath = `${user.id}/${datePart}/${timestamp}_${filename}`;
  const adminClient = createAdminClient();

  const { error } = await adminClient.storage
    .from(VIOLATION_SCREENSHOT_BUCKET)
    .upload(objectPath, buffer, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    return jsonServerError("上传截图失败");
  }

  return NextResponse.json({ path: objectPath });
}
