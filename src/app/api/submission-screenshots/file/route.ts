import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createRequestContext } from "@/lib/request-context";
import { reportScreenshotReadFailure, type ScreenshotReadFailureEvent } from "@/lib/screenshot-read-observability";
import { createClient } from "@/lib/supabase/server";
import { __internal as screenshotAccess } from "@/lib/submission-screenshot-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { readGrantCookie, grantAllowsOwner, verifyGrantValue } from "@/lib/screenshot-grant";
import { readSubmissionScreenshot, type ScreenshotReadResult } from "@/lib/screenshot-storage";
import { canReadContentVideoScreenshot } from "@/lib/content/video-screenshot-access";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const SCREENSHOT_TIMESTAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)(?:-|\.|$)/;

interface FileRouteDependencies {
  getUser: () => Promise<{ id: string } | null>;
  getVisibleUserIds: () => Promise<string[]>;
  canReadVideoScreenshot?: (input: { userId: string; videoId: string; path: string }) => Promise<boolean>;
  /**
   * 可选注入缝（测试用）。不提供时由 readSubmissionScreenshot 适配器内置的 Supabase 兜底实现接管。
   * 生产代码不得在本文件直连 Supabase Storage，
   * 见 scripts/check-screenshot-storage-boundary.mjs。
   */
  createSignedUrl?: (
    path: string,
    expiresIn: number
  ) => Promise<{ signedUrl: string | null; error: { message?: string } | null }>;
  readScreenshot?: (path: string) => Promise<ScreenshotReadResult>;
  reportReadFailure?: (event: ScreenshotReadFailureEvent) => void;
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
  const params = new URL(request.url).searchParams;
  const path = params.get("path")?.trim() ?? "";
  const videoId = params.get("videoId")?.trim() ?? "";
  if (!screenshotAccess.isSafeObjectPath(path)) {
    return NextResponse.json({ error: "截图路径不正确" }, { status: 400 });
  }

  const ownerUserId = path.split("/", 1)[0];
  const grantEnabled = process.env.SCREENSHOT_GRANT_ENABLED !== "0";
  const grant = grantEnabled ? verifyGrantValue(readGrantCookie(request)) : { payload: null, reason: "disabled" as const };
  let mode: "fast" | "slow" = "slow";
  let videoContextAuthorized = false;
  const authStarted = Date.now();

  if (grant.payload && grantAllowsOwner(grant.payload, ownerUserId)) {
    mode = "fast";
  } else {
    // grant 未覆盖的作者不能退回更宽的 owner 列表，只允许校验具体可见作品的关联图。
    if (grant.payload && (!videoId || !dependencies.canReadVideoScreenshot)) {
      console.info("[screenshot-grant]", JSON.stringify({ event: "grant_owner_denied", mode: "fast" }));
      return NextResponse.json({ error: "无权读取该截图" }, { status: 403 });
    }
    const user = await dependencies.getUser();
    if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const ownerVisible = !grant.payload && (await dependencies.getVisibleUserIds()).includes(ownerUserId);
    if (!ownerVisible) {
      if (videoId && dependencies.canReadVideoScreenshot) {
        try {
          videoContextAuthorized = await dependencies.canReadVideoScreenshot({ userId: user.id, videoId, path });
        } catch {
          console.info("[screenshot-grant]", JSON.stringify({ event: "video_context_check_failed" }));
          return NextResponse.json({ error: "截图访问校验暂时不可用" }, { status: 503 });
        }
      }
      if (!videoContextAuthorized) {
        return NextResponse.json({ error: "无权读取该截图" }, { status: 403 });
      }
    }
    console.info("[screenshot-grant]", JSON.stringify({ event: videoContextAuthorized ? "grant_video_context" : grant.reason === "oversize" ? "grant_oversize" : grant.reason === "expired" ? "grant_expired" : "grant_slow", reason: grant.reason }));
  }
  const authMs = Date.now() - authStarted;

  const storage = dependencies.readScreenshot
    ? await dependencies.readScreenshot(path)
    : dependencies.createSignedUrl
      ? await readSubmissionScreenshot(path, { createSignedUrl: dependencies.createSignedUrl })
      : await readSubmissionScreenshot(path);
  if (storage.kind === "failure") {
    const { requestId } = createRequestContext({ route: "/api/submission-screenshots/file", operation: "read-screenshot" });
    if (!storage.notFound) {
      try {
        (dependencies.reportReadFailure ?? reportScreenshotReadFailure)({
          requestId, mode, authMs,
          imageKey: createHash("sha256").update(path).digest("hex").slice(0, 16),
          failure: storage.failure,
        });
      } catch { /* 观测失败不能改变读图响应。 */ }
    }
    const response = NextResponse.json({
      error: storage.notFound ? "截图不存在或暂时无法读取" : "截图存储暂时不可用",
      error_code: storage.notFound ? "SCREENSHOT_NOT_FOUND" : "SCREENSHOT_STORAGE_UNAVAILABLE",
      requestId,
    }, { status: storage.notFound ? 404 : 502 });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("x-dydata-request-id", requestId);
    if (!storage.notFound) response.headers.set("Retry-After", "2");
    return response;
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
  response.headers.set("Cache-Control", videoContextAuthorized ? "private, no-store" : getScreenshotCacheControl(path));
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

  return buildSubmissionScreenshotFileResponse(request, {
    canReadVideoScreenshot: canReadContentVideoScreenshot,
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
  });
}
