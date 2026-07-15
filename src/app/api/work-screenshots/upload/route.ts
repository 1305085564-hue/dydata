import { NextRequest, NextResponse } from "next/server";

import { archivedFeatureResponse, isArchivedWriteEnabled } from "@/app/api/_archive";
import { createAdminClient } from "@/lib/supabase/admin";
import { getShanghaiDate, requireSignedInUser } from "@/app/api/production/_shared";

const BUCKET_NAME = "work-screenshots";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function getExtension(file: File) {
  const byType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  return byType[file.type] ?? "jpg";
}

export async function POST(request: NextRequest) {
  if (isArchivedWriteEnabled()) {
    return archivedFeatureResponse("作品凭证截图上传已归档，请改用今日工作台提交日报截图");
  }

  const auth = await requireSignedInUser();
  if ("response" in auth) return auth.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请上传图片文件" }, { status: 400 });
  }

  if (!ACCEPTED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "仅支持 jpg、png、webp 图片" }, { status: 400 });
  }

  if (file.size <= 0) {
    return NextResponse.json({ error: "图片为空或已损坏，请重新上传" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "图片不能超过 5MB" }, { status: 400 });
  }

  const date = getShanghaiDate();
  const storagePath = `${auth.user.id}/${date}/${crypto.randomUUID()}.${getExtension(file)}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase.storage.from(BUCKET_NAME).upload(storagePath, buffer, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    return NextResponse.json({ error: error.message || "截图上传失败" }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      bucket: BUCKET_NAME,
      path: storagePath,
    },
  });
}
