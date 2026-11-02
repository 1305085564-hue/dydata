import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { request, type APIRequestContext } from "@playwright/test";
import {
  GRANT_COOKIE_NAME,
  GRANT_COOKIE_PATH,
  GRANT_MAX_COOKIE_BYTES,
  buildGrantValue,
} from "../../src/lib/screenshot-grant";
import { cosGetObject, readCosConfig } from "../../src/lib/cos/client";

const SCREENSHOT_FILE_PATH = "/api/submission-screenshots/file";
const DEFAULT_BASE_URL = "http://127.0.0.1:3100";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type EvidenceRows = (sql: string) => Promise<unknown[]>;

export interface CloudBaseScreenshotEvidenceInput {
  ctx: APIRequestContext;
  gateway: string;
  ids: { memberA: string };
  rows: EvidenceRows;
  baseURL?: string;
}

interface ScreenshotReadEvidence {
  status: number;
  backend: string | null;
  mode: string | null;
  byteLength: number;
  sha256: string;
}

export interface CloudBaseScreenshotEvidence {
  source: "existing-private-screenshot-in-current-isolated-project";
  gatewayConfigured: boolean;
  crossIndependentProject: { status: "BLOCKED"; reason: "no-second-project-tested" };
  original: { status: number; byteLength: number; sha256: string };
  slowAuthorization: ScreenshotReadEvidence;
  grantedAuthorization: ScreenshotReadEvidence;
  byteComparisons: { slowMatchesCos: boolean; grantedMatchesCos: boolean };
  denials: {
    expiredGrantWithoutVideoId: { status: number; expected: 403; passed: boolean };
    oversizedGrantWithoutVideoId: { status: number; expected: 403; passed: boolean };
    simulatedOtherAudienceForeignPath: {
      status: number;
      expected: 403;
      classification: "simulated-invalid-ticket-and-foreign-path; no-second-project-tested";
      passed: boolean;
    };
  };
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function screenshotPath(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value, "https://dydata.local");
  } catch {
    throw new Error("B04 screenshot reference is not a valid URL");
  }
  requireCondition(parsed.pathname === SCREENSHOT_FILE_PATH, "B04 screenshot reference is not the private file endpoint");
  const path = parsed.searchParams.get("path")?.trim() ?? "";
  const segments = path.split("/");
  requireCondition(
    path.length > 0
      && !path.startsWith("/")
      && !path.includes("\\")
      && path.length <= 1024
      && segments.length >= 2
      && segments.every((segment) => segment.length > 0 && segment !== "." && segment !== ".."),
    "B04 screenshot reference does not contain a safe object key",
  );
  return path;
}

function responseUrl(path: string, videoId?: string) {
  const url = new URL(SCREENSHOT_FILE_PATH, "https://dydata.local");
  url.searchParams.set("path", path);
  if (videoId) url.searchParams.set("videoId", videoId);
  return `${url.pathname}${url.search}`;
}

async function contextWithGrant(
  source: APIRequestContext,
  baseURL: string,
  value: string,
) {
  const state = await source.storageState();
  const cookies = state.cookies.filter((cookie) => cookie.name !== GRANT_COOKIE_NAME);
  const hostname = new URL(baseURL).hostname;
  cookies.push({
    name: GRANT_COOKIE_NAME,
    value,
    domain: hostname,
    path: GRANT_COOKIE_PATH,
    expires: -1,
    httpOnly: true,
    secure: false,
    sameSite: "Lax",
  });
  return request.newContext({ baseURL, storageState: { ...state, cookies } });
}

async function readProxyBytes(
  ctx: APIRequestContext,
  url: string,
  expectedMode?: "slow" | "fast",
): Promise<{ evidence: ScreenshotReadEvidence; body: Uint8Array }> {
  const response = await ctx.get(url, { maxRedirects: 0 });
  const status = response.status();
  requireCondition(status === 200, `B04 authorized screenshot read returned HTTP ${status}`);
  const headers = response.headers();
  requireCondition(/^image\//i.test(headers["content-type"] ?? ""), "B04 authorized screenshot response is not an image");
  requireCondition((headers["x-screenshot-backend"] ?? "").toLowerCase() === "cos", "B04 screenshot did not use the COS backend");
  const mode = headers["x-screenshot-mode"] ?? null;
  if (expectedMode) requireCondition(mode === expectedMode, `B04 screenshot authorization mode was not ${expectedMode}`);
  const body = new Uint8Array(await response.body());
  requireCondition(body.byteLength > 0, "B04 authorized screenshot response was empty");
  return {
    evidence: {
      status,
      backend: headers["x-screenshot-backend"] ?? null,
      mode,
      byteLength: body.byteLength,
      sha256: sha256(body),
    },
    body,
  };
}

async function denialStatus(
  source: APIRequestContext,
  baseURL: string,
  cookie: string,
  url: string,
) {
  const context = await contextWithGrant(source, baseURL, cookie);
  try {
    return (await context.get(url, { maxRedirects: 0 })).status();
  } finally {
    await context.dispose();
  }
}

/**
 * Collect read-only B04 evidence against one existing private screenshot.
 * This helper performs HTTP GETs and one grant POST only when called by the gate.
 * It never returns object paths, user IDs, grant values, or COS credentials.
 */
export async function collectCloudBaseScreenshotEvidence(
  input: CloudBaseScreenshotEvidenceInput,
): Promise<CloudBaseScreenshotEvidence> {
  requireCondition(UUID_PATTERN.test(input.ids.memberA), "B04 member identity is not a UUID");
  const candidateRows = await input.rows(`
    SELECT v.id, coalesce(nullif(s.curve_screenshot_url,''),s.screenshot_urls[1]) AS url
    FROM public.videos v
    JOIN public.profiles p ON p.id=v.user_id
    JOIN auth.users u ON u.sub=p.id::text
    JOIN LATERAL (
      SELECT * FROM public.video_metrics_snapshots s
      WHERE s.video_id=v.id AND s.snapshot_type='24h'
      ORDER BY s.captured_at DESC LIMIT 1
    ) s ON true
    WHERE v.lifecycle_state='active'
      AND p.team_id IS NOT NULL
      AND p.membership_status='active'
      AND u.status=1
      AND coalesce(nullif(s.curve_screenshot_url,''),s.screenshot_urls[1]) LIKE '%/api/submission-screenshots/file?%'
    ORDER BY v.id
    LIMIT 1
  `) as Array<{ id?: unknown; url?: unknown }>;
  requireCondition(candidateRows.length === 1, "B04 requires one existing active private screenshot reference");
  const candidate = candidateRows[0];
  requireCondition(typeof candidate.id === "string" && UUID_PATTERN.test(candidate.id), "B04 screenshot reference has no valid video ID");
  requireCondition(typeof candidate.url === "string", "B04 screenshot reference has no URL");

  const objectKey = screenshotPath(candidate.url);
  const ownerUserId = objectKey.split("/", 1)[0];
  const baseURL = input.baseURL ?? DEFAULT_BASE_URL;
  const boundUrl = responseUrl(objectKey, candidate.id);
  const noVideoUrl = responseUrl(objectKey);

  const cosConfig = readCosConfig();
  requireCondition(cosConfig !== null, "B04 local COS read configuration is unavailable");
  const original = await cosGetObject(cosConfig, objectKey);
  if (!original.ok) throw new Error("B04 original COS object could not be read");
  requireCondition(original.body.byteLength > 0, "B04 original COS object was empty");
  const originalHash = sha256(original.body);

  const slowContext = await contextWithGrant(input.ctx, baseURL, "");
  let slowRead: Awaited<ReturnType<typeof readProxyBytes>>;
  try {
    // An empty cookie value is omitted by the request cookie encoder. The helper
    // also removes any pre-existing grant cookie, keeping this request on slow auth.
    slowRead = await readProxyBytes(slowContext, boundUrl, "slow");
  } finally {
    await slowContext.dispose();
  }

  const grantResponse = await input.ctx.post("/api/submission-screenshots/grant", { data: {} });
  requireCondition(grantResponse.status() === 200, `B04 screenshot grant returned HTTP ${grantResponse.status()}`);
  const grantBody = await grantResponse.json() as { mode?: unknown };
  requireCondition(grantBody.mode === "fast", "B04 existing screenshot grant did not issue fast authorization");
  // A grant for the synthetic member does not include this historical author.
  // The existing video-bound authorization must still run; never forge a wider grant.
  const grantedRead = await readProxyBytes(input.ctx, boundUrl);

  const expiredGrant = buildGrantValue({ v: 1, u: input.ids.memberA, allow: [ownerUserId], exp: 1 });
  requireCondition(expiredGrant !== null, "B04 could not create the local expired-ticket fixture");
  const expiredStatus = await denialStatus(input.ctx, baseURL, expiredGrant, noVideoUrl);
  // The oversized fixture has a valid signature and would authorize this exact
  // object if the size check were absent. A malformed string proves nothing about size.
  const secret=process.env.SCREENSHOT_GRANT_SECRET;
  requireCondition(Boolean(secret), "B04 local grant signing configuration is unavailable");
  const allow=[ownerUserId];
  let oversized="";
  for(let i=0;i<119;i++){
    allow.push(randomBytes(32).toString('base64url'));
    const data=deflateRawSync(Buffer.from(JSON.stringify({v:1,u:input.ids.memberA,allow,exp:Math.floor(Date.now()/1000)+300}))).toString('base64url');
    oversized=`${data}.${createHmac('sha256',secret!).update(data,'ascii').digest('base64url')}`;
    if(Buffer.byteLength(oversized)>GRANT_MAX_COOKIE_BYTES)break;
  }
  requireCondition(Buffer.byteLength(oversized)>GRANT_MAX_COOKIE_BYTES && Buffer.byteLength(oversized)<4096,"B04 oversized fixture must cross the application limit without crossing the browser cookie limit");
  const oversizedStatus = await denialStatus(
    input.ctx,
    baseURL,
    oversized,
    noVideoUrl,
  );
  const simulatedOtherAudienceStatus = await denialStatus(
    input.ctx,
    baseURL,
    "other-audience.invalid",
    responseUrl(`${randomUUID()}/__b04_simulated_foreign_project__.jpg`),
  );

  const slowMatchesCos = Buffer.from(slowRead.body).equals(Buffer.from(original.body));
  const grantedMatchesCos = Buffer.from(grantedRead.body).equals(Buffer.from(original.body));
  requireCondition(slowMatchesCos, "B04 slow-authorized proxy bytes differ from the COS object");
  requireCondition(grantedMatchesCos, "B04 granted proxy bytes differ from the COS object");
  requireCondition(expiredStatus === 403, `B04 expired grant denial returned HTTP ${expiredStatus}`);
  requireCondition(oversizedStatus === 403, `B04 oversized grant denial returned HTTP ${oversizedStatus}`);
  requireCondition(simulatedOtherAudienceStatus === 403, `B04 simulated foreign-path denial returned HTTP ${simulatedOtherAudienceStatus}`);

  return {
    source: "existing-private-screenshot-in-current-isolated-project",
    gatewayConfigured: input.gateway.startsWith("https://") && input.gateway.includes(".api.tcloudbasegateway.com"),
    crossIndependentProject: { status: "BLOCKED", reason: "no-second-project-tested" },
    original: { status: original.status, byteLength: original.body.byteLength, sha256: originalHash },
    slowAuthorization: slowRead.evidence,
    grantedAuthorization: grantedRead.evidence,
    byteComparisons: { slowMatchesCos, grantedMatchesCos },
    denials: {
      expiredGrantWithoutVideoId: { status: expiredStatus, expected: 403, passed: true },
      oversizedGrantWithoutVideoId: { status: oversizedStatus, expected: 403, passed: true },
      simulatedOtherAudienceForeignPath: {
        status: simulatedOtherAudienceStatus,
        expected: 403,
        classification: "simulated-invalid-ticket-and-foreign-path; no-second-project-tested",
        passed: true,
      },
    },
  };
}
