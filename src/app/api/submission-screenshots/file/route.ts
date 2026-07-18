import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { __internal as screenshotAccess } from "@/lib/submission-screenshot-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";

const BUCKET_NAME = "submission-screenshots";

interface FileRouteDependencies {
  getUser: () => Promise<{ id: string } | null>;
  getVisibleUserIds: () => Promise<string[]>;
  createSignedUrl: (
    path: string,
    expiresIn: number
  ) => Promise<{ signedUrl: string | null; error: { message?: string } | null }>;
}

export async function buildSubmissionScreenshotFileResponse(
  request: Request,
  dependencies: FileRouteDependencies
) {
  const user = await dependencies.getUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const path = new URL(request.url).searchParams.get("path")?.trim() ?? "";
  if (!screenshotAccess.isSafeObjectPath(path)) {
    return NextResponse.json({ error: "截图路径不正确" }, { status: 400 });
  }

  const ownerUserId = path.split("/", 1)[0];
  const visibleUserIds = await dependencies.getVisibleUserIds();
  if (!ownerUserId || !visibleUserIds.includes(ownerUserId)) {
    return NextResponse.json({ error: "无权读取该截图" }, { status: 403 });
  }

  const { signedUrl, error } = await dependencies.createSignedUrl(path, 60);
  if (error || !signedUrl) {
    return NextResponse.json({ error: "截图不存在或暂时无法读取" }, { status: 404 });
  }

  const response = NextResponse.redirect(signedUrl);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  return buildSubmissionScreenshotFileResponse(request, {
    getUser: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user ? { id: user.id } : null;
    },
    getVisibleUserIds: async () => {
      const permissionContext = await getCurrentPermissionContext();
      return permissionContext?.scope.visibleUserIds ?? [];
    },
    createSignedUrl: async (path, expiresIn) => {
      const { data, error } = await adminSupabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(path, expiresIn);
      return { signedUrl: data?.signedUrl ?? null, error };
    },
  });
}
