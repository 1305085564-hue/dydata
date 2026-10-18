import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { __internal as screenshotAccess } from "@/lib/submission-screenshot-access";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { readGrantCookie, grantAllowsOwner, verifyGrantValue } from "@/lib/screenshot-grant";
import { readSubmissionScreenshot, type ScreenshotReadResult } from "@/lib/screenshot-storage";

const BUCKET_NAME = "submission-screenshots";

interface FileRouteDependencies {
  getUser: () => Promise<{ id: string } | null>;
  getVisibleUserIds: () => Promise<string[]>;
  createSignedUrl: (
    path: string,
    expiresIn: number
  ) => Promise<{ signedUrl: string | null; error: { message?: string } | null }>;
  readScreenshot?: (path: string) => Promise<ScreenshotReadResult>;
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
  response.headers.set("Cache-Control", "private, max-age=1800");
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
