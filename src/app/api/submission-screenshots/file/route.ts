import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { __internal as screenshotAccess } from "@/lib/submission-screenshot-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { readGrantCookie, grantAllowsOwner, verifyGrantValue } from "@/lib/screenshot-grant";
import { readSubmissionScreenshot, type ScreenshotReadResult } from "@/lib/screenshot-storage";

const BUCKET_NAME = "submission-screenshots";
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const SCREENSHOT_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)(?:-|\.|$)/;

interface FileRouteDependencies {
  getUser: () => Promise<{ id: string } | null>;
  getVisibleUserIds: () => Promise<string[]>;
  createSignedUrl: (
    path: string,
    expiresIn: number
  ) => Promise<{ signedUrl: string | null; error: { message?: string } | null }>;
  readScreenshot?: (path: string) => Promise<ScreenshotReadResult>;
}

/**
 * 浏览器缓存按图龄分两档。这是「私有缓存」：只存在用户自己的浏览器里，不跨用户共享，
 * 也不能被描述成「首次加载优化」——A 看过的图不会让 B 变快。
 *
 * - 图龄 ≤ 3 天：30 分钟，保留误传撤回能力
 * - 图龄 > 3 天：30 天，业务反复回看当月数据
 *
 * 图龄只取 path 最后一段文件名里的上传时间戳，不能用 storage.objects.created_at：
 * 迁移进 COS 的 5 月老图 created_at 是迁移当天，会被误判成新图。
 * 解析不出时间戳（正在写第一张图）或时间戳在未来（时钟漂移）时，一律保守取 30 分钟。
 */
export function getScreenshotCacheControl(path: string, now = Date.now()) {
  const filename = path.split("/").pop() ?? "";
  const timestamp = filename.match(SCREENSHOT_TIMESTAMP)?.[1];
  if (!timestamp) return "private, max-age=1800";

  const capturedAt = Date.parse(timestamp.replace(/T(\d{2})-(\d{2})-(\d{2})-/, "T$1:$2:$3."));
  if (!Number.isFinite(capturedAt) || now - capturedAt <= THREE_DAYS_MS) {
    return "private, max-age=1800";
  }
  return "private, max-age=2592000";
}

export async function buildSubmissionScreenshotFileResponse(
  request: Request,
  dependencies: FileRouteDependencies
) {
  const path = new URL(request.url).searchParams.get("path")?.trim() ?? "";
  if (!screenshotAccess.isSafeObjectPath(path)) {
    return NextResponse.json({ error: "截图路径不正确" }, { status: 400 });
  }

  const ownerUserId = path.split("/", 1)[0];
  const grantEnabled = process.env.SCREENSHOT_GRANT_ENABLED !== "0";
  const grant = grantEnabled ? verifyGrantValue(readGrantCookie(request)) : { payload: null, reason: "disabled" as const };
  let mode: "fast" | "slow" = "slow";
  const authStarted = Date.now();

  if (grant.payload) {
    if (!grantAllowsOwner(grant.payload, ownerUserId)) {
      console.info("[screenshot-grant]", JSON.stringify({ event: "grant_owner_denied", mode: "fast" }));
      return NextResponse.json({ error: "无权读取该截图" }, { status: 403 });
    }
    mode = "fast";
  } else {
    const user = await dependencies.getUser();
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const visibleUserIds = await dependencies.getVisibleUserIds();
    if (!ownerUserId || !visibleUserIds.includes(ownerUserId)) {
      return NextResponse.json({ error: "无权读取该截图" }, { status: 403 });
    }
    console.info("[screenshot-grant]", JSON.stringify({ event: grant.reason === "oversize" ? "grant_oversize" : grant.reason === "expired" ? "grant_expired" : "grant_slow", reason: grant.reason }));
  }
  const authMs = Date.now() - authStarted;

  const storage = dependencies.readScreenshot
    ? await dependencies.readScreenshot(path)
    : await readSubmissionScreenshot(path, { createSignedUrl: dependencies.createSignedUrl });
  if (storage.kind === "failure") {
    console.info("[screenshot-storage]", JSON.stringify({ event: "read_failed", mode, auth_ms: authMs, errors: storage.errors }));
    return NextResponse.json({ error: storage.notFound ? "截图不存在或暂时无法读取" : "截图存储暂时不可用" }, { status: storage.notFound ? 404 : 502 });
  }

  if (storage.kind === "redirect") {
    const response = NextResponse.redirect(storage.signedUrl);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Screenshot-Mode", mode);
    return response;
  }

  const response = new NextResponse(Buffer.from(storage.body), { status: 200 });
  response.headers.set("Content-Type", storage.contentType ?? inferContentType(path));
  response.headers.set("Content-Length", String(storage.body.byteLength));
  if (storage.etag) response.headers.set("ETag", storage.etag);
  response.headers.set("Content-Disposition", "inline");
  response.headers.set("Cache-Control", getScreenshotCacheControl(path));
  response.headers.set("X-Screenshot-Mode", mode);
  response.headers.set("X-Screenshot-Backend", storage.backend);
  response.headers.set("X-Screenshot-Fallback", storage.fellBack ? "1" : "0");
  console.info("[screenshot-storage]", JSON.stringify({ event: storage.fellBack ? "read_fallback" : "read", mode, backend: storage.backend, bytes: storage.body.byteLength, auth_ms: authMs }));
  return response;
}

function inferContentType(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return "image/jpeg";
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
    readScreenshot: (path) => readSubmissionScreenshot(path, {
      createSignedUrl: async (targetPath, expiresIn) => {
        const { data, error } = await adminSupabase.storage.from(BUCKET_NAME).createSignedUrl(targetPath, expiresIn);
        return { signedUrl: data?.signedUrl ?? null, error };
      },
    }),
  });
}
