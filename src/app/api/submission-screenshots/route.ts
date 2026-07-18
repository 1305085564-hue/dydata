import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { buildSubmissionScreenshotUrl } from "@/lib/submission-screenshot-access";
import { hasMatchingImageSignature } from "@/lib/file-signatures";
import type { SubmissionAssetRole } from "@/types";

const BUCKET_NAME = "submission-screenshots";
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function normalizeAssetRole(value: FormDataEntryValue | null): SubmissionAssetRole | null {
  return value === "screenshot_1" || value === "screenshot_2" || value === "screenshot_3" ? value : null;
}

function getExtension(file: File) {
  const byType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  return byType[file.type] ?? "jpg";
}

function buildStoragePath(input: {
  userId: string;
  accountId: string;
  assetRole: SubmissionAssetRole;
  file: File;
}) {
  const safeAccountId = input.accountId.replace(/[^a-zA-Z0-9_-]/g, "");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${input.userId}/${safeAccountId}/${input.assetRole}/${timestamp}-${crypto.randomUUID()}.${getExtension(input.file)}`;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }

  const file = formData.get("file");
  const accountId = typeof formData.get("account_id") === "string" ? String(formData.get("account_id")).trim() : "";
  const assetRole = normalizeAssetRole(formData.get("asset_role"));

  if (!accountId) {
    return NextResponse.json({ error: "account_id 为必填项" }, { status: 400 });
  }

  if (!assetRole) {
    return NextResponse.json({ error: "截图槽位不正确" }, { status: 400 });
  }

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
    return NextResponse.json({ error: "图片不能超过 8MB" }, { status: 400 });
  }

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, profile_id")
    .eq("id", accountId)
    .single();

  if (accountError || !account || account.profile_id !== user.id) {
    return NextResponse.json({ error: "账号不存在或无权限上传" }, { status: 403 });
  }

  const adminSupabase = createAdminClient();
  const storagePath = buildStoragePath({ userId: user.id, accountId, assetRole, file });
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasMatchingImageSignature(buffer, file.type)) {
    return NextResponse.json({ error: "图片内容与文件类型不一致或文件已损坏" }, { status: 400 });
  }

  const { error: uploadError } = await adminSupabase.storage.from(BUCKET_NAME).upload(storagePath, buffer, {
    contentType: file.type,
    upsert: false,
  });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message || "截图上传失败" }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      bucket: BUCKET_NAME,
      path: storagePath,
      url: buildSubmissionScreenshotUrl(request.url, storagePath),
    },
  });
}
