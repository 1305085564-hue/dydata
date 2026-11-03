#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { connect as connectSocket } from "node:net";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_ORIGINS = Object.freeze(["https://dydata.cc", "https://direct.dydata.cc"]);
const PROBE_HEADER = "x-dydata-cutover-probe";
const REQUIRED_PAGE_COUNT = 7;
const METRICS = Object.freeze({
  "#metric-play_count": "12000",
  "#metric-follower_gain": "50",
  "#metric-likes": "200",
  "#metric-comments": "30",
  "#metric-shares": "5",
  "#metric-favorites": "20",
});

const HELP = `CloudBase 双域、双角色真实浏览器验收（执行时会写入作品和日报）

离线帮助：
  node scripts/cloudbase/cutover-browser-acceptance.mjs --help

执行：
  node scripts/cloudbase/cutover-browser-acceptance.mjs --config /绝对路径/acceptance.json

配置 JSON 字段：
  baseHost2domains: { "https://dydata.cc": ["https://dydata.cc", "https://direct.dydata.cc"] }
  credentialsFile: 绝对路径，JSON 为 { member: { email, password }, admin: { email, password } }
  probeTokenFile: 绝对路径，文件只含维护旁路 token
  evidenceRoot: 绝对路径，脚本在其下新建 700 私有目录，证据文件为 600
  bizDate: 负责人已核空的 YYYY-MM-DD，必填
  accountId: 已核对归属的账号 UUID，必填
  pagesByRole: member/admin 各 7 条页面验收项，每条为
    { path, outcome: "allow"|"deny", expectedPath, visibleText }
    visibleText 是该项应看到的页面标题或拒绝提示，用于核实页面内容，不以 HTTP 200 代替。

脚本在每个配置域名分别执行：member 原密码登录、页面读取、真实控件新建/读回/修改；
随后 admin 原密码登录，通过数据复盘抽屉移入回收站并确认日报作废。
不会物理删除，不上传截图，不访问 COS，不使用 HAR/trace。页面外请求会被阻断。
失败保留已有私有证据，不自动重试、不自动清理。`;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeOrigin(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}_invalid`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label}_invalid`);
  }
  if (
    parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
    parsed.pathname !== "/" || parsed.search || parsed.hash ||
    parsed.origin !== value.replace(/\/$/, "")
  ) {
    throw new Error(`${label}_invalid`);
  }
  return parsed.origin;
}

function validateCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function normalizePageItem(item, role, index) {
  if (!isPlainObject(item)) throw new Error(`pagesByRole_${role}_${index}_invalid`);
  const { path: routePath, outcome, expectedPath, visibleText } = item;
  for (const [candidate, name] of [[routePath, "path"], [expectedPath, "expectedPath"]]) {
    if (
      typeof candidate !== "string" || !candidate.startsWith("/") || candidate.startsWith("//") ||
      candidate.includes("#") || candidate.includes("\\") || candidate.includes("..")
    ) throw new Error(`pagesByRole_${role}_${index}_${name}_invalid`);
    const parsed = new URL(candidate, "https://dydata.cc");
    if (parsed.origin !== "https://dydata.cc") throw new Error(`pagesByRole_${role}_${index}_${name}_invalid`);
  }
  if (outcome !== "allow" && outcome !== "deny") throw new Error(`pagesByRole_${role}_${index}_outcome_invalid`);
  if (typeof visibleText !== "string" || !visibleText.trim()) throw new Error(`pagesByRole_${role}_${index}_visibleText_required`);
  if (item.openLeaderboard === true && routePath !== '/admin/collaboration') throw new Error('leaderboard_path_invalid');
  return { path: routePath, outcome, expectedPath, visibleText: visibleText.trim(), ...(item.openLeaderboard === true ? { openLeaderboard: true } : {}) };
}

/** Strict, side-effect-free validation. Paths containing secrets are never included in errors. */
export function normalizeConfig(raw) {
  if (!isPlainObject(raw)) throw new Error("config_invalid");
  const mapping = raw.baseHost2domains;
  if (!isPlainObject(mapping) || Object.keys(mapping).length !== 1) throw new Error("baseHost2domains_invalid");
  const [baseHost] = Object.keys(mapping);
  const normalizedBase = normalizeOrigin(baseHost, "baseHost");
  const configuredDomains = mapping[baseHost];
  if (!Array.isArray(configuredDomains) || configuredDomains.length !== 2) throw new Error("domains_must_contain_two_origins");
  const origins = configuredDomains.map((origin, index) => normalizeOrigin(origin, `domain_${index}`));
  if (new Set(origins).size !== 2 || origins.some((origin) => !SITE_ORIGINS.includes(origin))) {
    throw new Error("domain_origin_not_allowed");
  }
  if (!origins.includes(normalizedBase)) throw new Error("baseHost_not_in_domains");

  if (typeof raw.credentialsFile !== "string" || !path.isAbsolute(raw.credentialsFile)) throw new Error("credentialsFile_absolute_path_required");
  if (typeof raw.probeTokenFile !== "string" || !path.isAbsolute(raw.probeTokenFile)) throw new Error("probeTokenFile_absolute_path_required");
  if (typeof raw.evidenceRoot !== "string" || !path.isAbsolute(raw.evidenceRoot)) throw new Error("evidenceRoot_absolute_path_required");
  if (!validateCalendarDate(raw.bizDate)) throw new Error("bizDate_required_YYYY-MM-DD");
  if (raw.bizDatesByOrigin !== undefined && (!isPlainObject(raw.bizDatesByOrigin) || origins.some(origin => !validateCalendarDate(raw.bizDatesByOrigin[origin])) || new Set(origins.map(origin => raw.bizDatesByOrigin[origin])).size !== 2)) throw new Error('two_distinct_empty_dates_required');
  if (typeof raw.accountId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.accountId)) {
    throw new Error("accountId_required_UUID");
  }
  if (!isPlainObject(raw.pagesByRole)) throw new Error("pagesByRole_required");
  const pagesByRole = {};
  for (const role of ["member", "admin"]) {
    const entries = raw.pagesByRole[role];
    if (!Array.isArray(entries) || entries.length !== REQUIRED_PAGE_COUNT) throw new Error(`pagesByRole_${role}_must_have_7_entries`);
    const normalized = entries.map((entry, index) => normalizePageItem(entry, role, index));
    if (new Set(normalized.map((entry) => entry.path)).size !== REQUIRED_PAGE_COUNT) throw new Error(`pagesByRole_${role}_paths_must_be_unique`);
    pagesByRole[role] = normalized;
  }

  return {
    baseHost: normalizedBase,
    origins,
    credentialsFile: raw.credentialsFile,
    probeTokenFile: raw.probeTokenFile,
    evidenceRoot: raw.evidenceRoot,
    bizDate: raw.bizDate,
    bizDatesByOrigin: raw.bizDatesByOrigin ?? null,
    accountId: raw.accountId,
    pagesByRole,
  };
}

export function isAllowedOrigin(url, allowedOrigins) {
  try {
    return allowedOrigins.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

export function withProbeHeader(headers, token) {
  return { ...headers, [PROBE_HEADER]: token };
}

// Chromium carries overridden headers across redirects without routing every
// hop. Enforce the same two-host boundary below the browser, before TLS starts.
export async function createSiteOnlyProxy({ connect = connectSocket } = {}) {
  const allowedAuthorities = new Set(SITE_ORIGINS.map(origin => `${new URL(origin).hostname}:443`));
  const sockets = new Set();
  let blockedConnections = 0;
  const server = createServer((_request, response) => {
    blockedConnections++;
    response.writeHead(403, { Connection: "close" });
    response.end();
  });
  server.on("connection", socket => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.once("close", () => sockets.delete(socket));
  });
  server.on("connect", (request, client, head) => {
    if (!allowedAuthorities.has(request.url)) {
      blockedConnections++;
      client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    const host = request.url.slice(0, -4);
    let upstream;
    try { upstream = connect({ host, port: 443 }); } catch { client.destroy(); return; }
    sockets.add(upstream);
    upstream.once("close", () => { sockets.delete(upstream); client.destroy(); });
    upstream.on("error", () => client.destroy());
    client.once("close", () => upstream.destroy());
    upstream.once("connect", () => {
      if (client.destroyed) { upstream.destroy(); return; }
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    get blockedConnections() { return blockedConnections; },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}

export function submissionGuardFailure(payload, expected) {
  if (!isPlainObject(payload)) return "payload_invalid";
  if (!isPlainObject(expected)) return "write_not_explicitly_armed";
  if (payload.account_id !== expected.accountId) return "account_id_mismatch";
  if (payload.biz_date !== expected.bizDate) return "biz_date_mismatch";
  if (payload.video_title !== expected.title) return "video_title_mismatch";
  if (payload.anomaly_status !== "abnormal") return "anomaly_status_mismatch";
  if (payload.topic_tag !== "复盘") return "topic_tag_mismatch";
  if (payload.topic_id !== null && payload.topic_id !== undefined) return "topic_id_selected";
  if (Array.isArray(payload.assets) && payload.assets.length > 0) return "screenshot_upload_not_allowed";
  return null;
}

function safeRunId(value) {
  const cleaned = String(value).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 90);
  return cleaned || randomUUID();
}

function safeFailureCode(error, fallback = "browser_step_failed") {
  const message = error instanceof Error ? error.message : "";
  return /^[A-Za-z0-9_-]+$/.test(message) ? message : fallback;
}

export async function writePrivateEvidence(root, runId, evidence) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const directory = path.join(root, `${safeRunId(runId)}-${Date.now()}-${randomUUID().slice(0, 8)}`);
  await mkdir(directory, { mode: 0o700 });
  await chmod(directory, 0o700);
  const file = path.join(directory, "evidence.json");
  await writeEvidenceFile(file, evidence);
  return { directory, file };
}

async function writeEvidenceFile(file, evidence) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await chmod(temporary, 0o600);
  await rename(temporary, file);
  await chmod(file, 0o600);
}

function readRequestIdFromBody(body) {
  if (!isPlainObject(body)) return null;
  const candidates = [body.requestId, body.request_id, body?.observation?.requestId, body?.data?.requestId];
  return candidates.find((value) => typeof value === "string" && value.length <= 256) ?? null;
}

function responseRequestIds(headers, bodyRequestId = null) {
  const values = [];
  for (const name of ["x-dydata-request-id", "x-request-id", "request-id"]) {
    const value = headers.get(name);
    if (value && value.length <= 256) values.push({ source: `header:${name}`, value });
  }
  if (bodyRequestId) values.push({ source: "body:requestId", value: bodyRequestId });
  const unique = new Map(values.map((item) => [`${item.source}:${item.value}`, item]));
  return [...unique.values()];
}

function shortPath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "<invalid-url>";
  }
}

function isJsonResponse(headers) {
  return (headers.get("content-type") ?? "").toLowerCase().includes("json");
}

function extractSubmissionReceipt(body) {
  if (!isPlainObject(body)) return null;
  const videoId = typeof body.video_id === "string" ? body.video_id : body.video?.id;
  const reportId = typeof body.daily_report_id === "string" ? body.daily_report_id : null;
  const reportDate = typeof body.daily_report_date === "string" ? body.daily_report_date : null;
  if (!videoId || !reportId || !reportDate) return null;
  const library = isPlainObject(body.topic_library_entry) ? body.topic_library_entry : null;
  return {
    videoId,
    reportId,
    reportDate,
    anomalyStatus: typeof body.anomaly_status === "string" ? body.anomaly_status : null,
    storedTopicId: body.video?.topic_id ?? null,
    aiTagCount: Array.isArray(body.ai_tags) ? body.ai_tags.length : null,
    topicLibraryEntry: library ? {
      outcome: typeof library.outcome === "string" ? library.outcome : null,
      reason: typeof library.reason === "string" ? library.reason : null,
      subTopicId: typeof library.subTopicId === "string" ? library.subTopicId : null,
    } : null,
  };
}

function getCliConfigPath(argv) {
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) return { help: true };
  if (argv.length !== 2 || argv[0] !== "--config" || !path.isAbsolute(argv[1])) return { error: true };
  return { configPath: argv[1] };
}

async function readConfigFile(configPath) {
  try {
    return normalizeConfig(JSON.parse(await readFile(configPath, "utf8")));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("config_json_invalid");
    if (error instanceof Error && /^[a-zA-Z0-9_-]+$/.test(error.message)) throw error;
    throw new Error("config_read_failed");
  }
}

function assertPrivateInput(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}_empty`);
  return value.trim();
}

async function readSecrets(config) {
  let credentials;
  let token;
  try {
    credentials = JSON.parse(await readFile(config.credentialsFile, "utf8"));
    token = await readFile(config.probeTokenFile, "utf8");
  } catch {
    throw new Error("credential_or_probe_file_read_failed");
  }
  if (!isPlainObject(credentials)) throw new Error("credentials_file_invalid");
  const result = {};
  for (const role of ["member", "admin"]) {
    const entry = credentials[role];
    if (!isPlainObject(entry)) throw new Error(`credentials_${role}_missing`);
    const email = assertPrivateInput(entry.email, `${role}_email`);
    const password = assertPrivateInput(entry.password, `${role}_password`);
    if (!email.includes("@")) throw new Error(`credentials_${role}_invalid`);
    result[role] = { email, password };
  }
  const probeToken = assertPrivateInput(token, "probe_token");
  if (!/^[A-Za-z0-9_-]{32,512}$/.test(probeToken)) throw new Error("probe_token_invalid");
  return { credentials: result, probeToken };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function makeEvidenceDirectory(config, runId, evidence) {
  try {
    const created = await writePrivateEvidence(config.evidenceRoot, runId, evidence);
    return created;
  } catch {
    throw new Error("private_evidence_directory_create_failed");
  }
}

function installBrowserNetworkGuards(context, evidence, config, token, activeExpectation, persist) {
  context.route("**/*", async (route) => {
    const request = route.request();
    const url = request.url();
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      evidence.browserSafety.blockedRequests.push({ method: request.method(), target: "invalid-url" });
      await route.abort("blockedbyclient");
      void persist();
      return;
    }

    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      if (!config.origins.includes(parsed.origin)) {
        evidence.browserSafety.blockedRequests.push({ method: request.method(), target: parsed.origin });
        await route.abort("blockedbyclient");
        void persist();
        return;
      }

      const pathname = parsed.pathname;
      if (request.method() === "POST" && pathname === "/api/video-submit") {
        let payload = null;
        try {
          payload = request.postDataJSON();
        } catch {}
        const failure = submissionGuardFailure(payload, activeExpectation.currentSubmission);
        if (failure) {
          evidence.browserSafety.blockedWrites.push({ path: pathname, reason: failure });
          activeExpectation.rejectGuard?.(failure);
          await route.abort("blockedbyclient");
          void persist();
          return;
        }
        activeExpectation.currentSubmission = null;
      }

      if (pathname.startsWith("/api/admin/videos/") && pathname.endsWith("/lifecycle")) {
        let payload = null;
        try {
          payload = request.postDataJSON();
        } catch {}
        const expectedPath = `/api/admin/videos/${activeExpectation.videoId}/lifecycle`;
        if (
          request.method() !== "PATCH" || pathname !== expectedPath ||
          !isPlainObject(payload) || payload.action !== "trash"
        ) {
          evidence.browserSafety.blockedWrites.push({ path: pathname, reason: "lifecycle_write_not_trash_for_run_video" });
          await route.abort("blockedbyclient");
          void persist();
          return;
        }
      }

      const headers = withProbeHeader(request.headers(), token);
      await route.continue({ headers });
      return;
    }

    if (["data:", "blob:", "about:"].includes(parsed.protocol)) {
      await route.continue();
      return;
    }
    evidence.browserSafety.blockedRequests.push({ method: request.method(), target: parsed.protocol || "unknown-protocol" });
    await route.abort("blockedbyclient");
    void persist();
  });

  if (typeof context.routeWebSocket === "function") {
    context.routeWebSocket("**/*", (webSocketRoute) => {
      let socketOrigin = "invalid-url";
      try {
        const socketUrl = new URL(webSocketRoute.url());
        socketOrigin = `${socketUrl.protocol === "wss:" ? "https:" : "http:"}//${socketUrl.host}`;
      } catch {}
      if (!config.origins.includes(socketOrigin)) {
        evidence.browserSafety.blockedRequests.push({ method: "WEBSOCKET", target: socketOrigin });
        webSocketRoute.close();
        void persist();
        return;
      }
      webSocketRoute.connectToServer();
    });
  }

  const responseTasks = [];
  return {
    onResponse(response, role, origin) {
      const responseUrl = response.url();
      const headers = response.headers();
      const record = {
        role,
        origin,
        method: response.request().method(),
        path: shortPath(responseUrl),
        status: response.status(),
        requestIds: responseRequestIds(new Headers(headers)),
      };
      evidence.responseLedger.push(record);
      if (isJsonResponse(new Headers(headers))) {
        const responseTask = response.json().then((body) => {
          const requestId = readRequestIdFromBody(body);
          if (requestId) record.requestIds = responseRequestIds(new Headers(headers), requestId);
          const parsed = new URL(responseUrl);
          if (parsed.pathname === "/api/video-submit") {
            const receipt = extractSubmissionReceipt(body);
            if (receipt) evidence.detectedRows.videoSubmitReceipts.push({ role, origin, ...receipt });
          }
          if (parsed.pathname === `/api/admin/videos/${activeExpectation.videoId}/lifecycle` && isPlainObject(body)) {
            evidence.detectedRows.lifecycleResponses.push({
              role,
              origin,
              ok: body.ok === true,
              lifecycleState: typeof body.lifecycle_state === "string" ? body.lifecycle_state : null,
              dailyReportsChanged: Number.isFinite(body.daily_reports_changed) ? body.daily_reports_changed : null,
            });
          }
          if (parsed.pathname.startsWith("/api/admin/content/") && isPlainObject(body)) {
            collectAdminDetailIds(body, evidence, origin, activeExpectation.videoId);
          }
          void persist();
        }).catch(() => {});
        responseTasks.push(responseTask);
      }
      void persist();
    },
    async flush() {
      await Promise.allSettled(responseTasks);
      await persist();
      if (evidence.browserSafety.evidenceWriteFailed) throw new Error("private_evidence_write_failed");
    },
  };
}

function stripPrivateInternalFields(evidence) {
  const copy = { ...evidence };
  delete copy._evidenceFile;
  delete copy._evidenceDirectory;
  delete copy._activeExpectation;
  return copy;
}

function collectAdminDetailIds(body, evidence, origin, targetVideoId) {
  const candidates = [];
  if (isPlainObject(body.video) && body.video.id === targetVideoId) candidates.push({ table: "videos", id: body.video.id });
  if (isPlainObject(body.snapshot) && body.snapshot.video_id === targetVideoId) candidates.push({ table: "video_metrics_snapshots", id: body.snapshot.id });
  if (Array.isArray(body.videos)) {
    for (const video of body.videos) if (isPlainObject(video) && video.id === targetVideoId) candidates.push({ table: "videos", id: video.id });
  }
  if (Array.isArray(body.snapshots)) {
    for (const snapshot of body.snapshots) if (isPlainObject(snapshot) && snapshot.video_id === targetVideoId) candidates.push({ table: "video_metrics_snapshots", id: snapshot.id });
  }
  for (const candidate of candidates) {
    if (typeof candidate.id !== "string" || !candidate.id) continue;
    const row = { table: candidate.table, id: candidate.id, origin };
    if (!evidence.detectedRows.readbackRowIds.some((entry) => entry.table === row.table && entry.id === row.id && entry.origin === origin)) {
      evidence.detectedRows.readbackRowIds.push(row);
    }
  }
}

function attachRecorder(page, recorder, role, origin, networkGuards) {
  page.on("response", (response) => {
    let responseOrigin = origin;
    try { responseOrigin = new URL(response.url()).origin; } catch {}
    networkGuards.onResponse(response, role, responseOrigin);
  });
  page.on("request", (request) => {
    if (shortPath(request.url()) !== "/api/usage-events" || request.method() !== "POST") return;
    let payload = null;
    try { payload = request.postDataJSON(); } catch {}
    if (!isPlainObject(payload)) return;
    recorder.usageEventAttempts ??= [];
    recorder.usageEventAttempts.push({
      role,
      origin,
      path: typeof payload.path === "string" ? payload.path : null,
      eventType: typeof payload.eventType === "string" ? payload.eventType : null,
    });
  });
  page.on("requestfailed", (request) => {
    const url = request.url();
    recorder.failedBrowserRequests.push({
      role,
      origin,
      method: request.method(),
      path: shortPath(url),
    });
  });
}

async function loginWithPassword(page, origin, credentials, flow, persist) {
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.getByLabel("邮箱", { exact: true }).fill(credentials.email);
  await page.getByLabel("密码", { exact: true }).fill(credentials.password);
  await Promise.all([
    page.waitForURL((url) => url.origin === origin && url.pathname === "/dashboard", { timeout: 45_000 }),
    page.locator('form button[type="submit"]').click(),
  ]);
  await page.locator("main").waitFor({ state: "visible", timeout: 30_000 });
  flow.login = { method: "site-password-form", landedAt: "/dashboard", completedAt: new Date().toISOString() };
  await persist();
}

async function checkRolePages(page, origin, role, checks, flow, persist) {
  flow.pageChecks = [];
  for (const check of checks) {
    await page.goto(`${origin}${check.path}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const final = new URL(page.url());
    if (final.origin !== origin) throw new Error(`${role}_page_left_configured_origin`);
    if (final.pathname !== new URL(check.expectedPath, origin).pathname) {
      throw new Error(`${role}_page_route_expectation_failed`);
    }
    await page.locator("main").waitFor({ state: "visible", timeout: 30_000 });
    if (check.openLeaderboard) {
      const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === '/api/dashboard/leaderboard', { timeout: 45000 });
      await page.getByRole('button', { name: '账号排行', exact: true }).click();
      const response = await responsePromise;
      const payload = await response.json();
      if (response.status() !== 200 || !Array.isArray(payload.leaderboardData) || payload.leaderboardData.length === 0) throw new Error('leaderboard_empty_or_failed');
      await page.getByRole('dialog').getByText('账号表现榜', { exact: true }).waitFor({ state: 'visible' });
      flow.leaderboardRows = payload.leaderboardData.length;
    }
    await page.getByText(check.visibleText, { exact: false }).first().waitFor({ state: "visible", timeout: 30_000 });
    flow.pageChecks.push({
      requestedPath: new URL(check.path, origin).pathname,
      outcome: check.outcome,
      landedPath: final.pathname,
      visibleTextVerified: true,
      verifiedAt: new Date().toISOString(),
    });
    await persist();
  }
}

async function verifySignout(page, flow, persist) {
  const statuses = await page.evaluate(async () => {
    const logout = await fetch('/api/cloudbase/auth/signout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    const identity = await fetch('/api/cloudbase/auth/user', { cache: 'no-store' });
    return { signoutStatus: logout.status, identityStatus: identity.status };
  });
  flow.signout = statuses;
  await persist();
  if (statuses.signoutStatus !== 200 || statuses.identityStatus !== 401) throw new Error('signout_or_session_rejection_failed');
}

async function selectBizDateThroughCalendar(page, origin, bizDate) {
  const target = new Date(`${bizDate}T00:00:00.000Z`);
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth() + 1;
  const targetDay = target.getUTCDate();
  const toolbarDate = page.getByRole("button", { name: /^切换填报日期：\d{4}-\d{2}-\d{2}$/ });
  await toolbarDate.waitFor({ state: "visible", timeout: 20_000 });
  const currentDateLabel = await toolbarDate.getAttribute("aria-label");
  const currentDate = currentDateLabel?.split("：").at(-1) ?? "";
  if (!validateCalendarDate(currentDate)) throw new Error("dashboard_active_date_unreadable");
  if (target > new Date(`${currentDate}T23:59:59.999Z`)) throw new Error("bizDate_is_future_in_dashboard");

  await toolbarDate.click();
  const targetMonthLabel = `${targetYear}年${targetMonth}月`;
  for (let index = 0; index < 48; index += 1) {
    const visibleMonth = await page.getByText(/^\d{4}年\d{1,2}月$/, { exact: true }).first().textContent();
    if (visibleMonth === targetMonthLabel) break;
    const visibleMatch = visibleMonth?.match(/^(\d{4})年(\d{1,2})月$/);
    if (!visibleMatch) throw new Error("dashboard_calendar_month_unreadable");
    const visibleKey = Number(visibleMatch[1]) * 12 + Number(visibleMatch[2]);
    const targetKey = targetYear * 12 + targetMonth;
    if (visibleKey > targetKey) {
      await page.getByRole("button", { name: "上个月", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "下个月", exact: true }).click();
    }
  }

  const monthKey = `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
  const calendarCell = page.locator(`[data-month-key="${monthKey}"] button[aria-label^="${targetMonth}月${targetDay}日 "]`).first();
  await calendarCell.waitFor({ state: "visible", timeout: 20_000 });
  if (!(await calendarCell.isEnabled())) throw new Error("bizDate_calendar_cell_disabled");
  if (await calendarCell.getAttribute("title")) throw new Error("bizDate_not_empty_in_dashboard_calendar");
  await calendarCell.click();
  await page.getByRole("button", { name: `切换填报日期：${bizDate}`, exact: true }).waitFor({ state: "visible", timeout: 20_000 });
  if (new URL(page.url()).origin !== origin) throw new Error("dashboard_origin_changed");
  return { date: bizDate, selection: "clicked-real-calendar-cell", calendarCellHadNoStatusTitle: true };
}

async function ensureTopicTag(page, expectedTag) {
  const form = page.locator("form#video-submit-form-v2");
  const button = form.getByRole("button", { name: expectedTag, exact: true });
  const selected = await button.evaluate((element) => element.className.includes("shadow-input"));
  if (!selected) await button.click();
  const after = await button.evaluate((element) => element.className.includes("shadow-input"));
  if (!after) throw new Error("topic_tag_ui_selection_failed");
}

async function fillSubmissionForm(page, title, content) {
  const form = page.locator("form#video-submit-form-v2");
  await page.getByRole("radio", { name: "作品异常", exact: true }).click();
  if (await page.getByRole("radio", { name: "作品异常", exact: true }).getAttribute("aria-checked") !== "true") {
    throw new Error("abnormal_status_ui_selection_failed");
  }
  for (const [selector, value] of Object.entries(METRICS)) {
    const input = form.locator(selector);
    await input.fill(value);
    await input.blur();
  }
  await form.locator("#video_title").fill(title);
  await form.locator("#content").fill(content);
  await ensureTopicTag(page, "复盘");
  await form.locator("#video_title").blur();
}

function waitForSubmissionResponse(page) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "POST" && url.pathname === "/api/video-submit";
  }, { timeout: 45_000 });
}

async function submitWithGuardRace(page, title, evidence, config) {
  let resolveGuard;
  const guardFailure = new Promise((resolve) => { resolveGuard = resolve; });
  evidence._activeExpectation.rejectGuard = resolveGuard;
  evidence._activeExpectation.currentSubmission = {
    accountId: evidence.accountId,
    bizDate: config.bizDate,
    title,
  };
  const responsePromise = waitForSubmissionResponse(page).then((response) => ({ response })).catch(() => ({ response: null }));
  await page.getByRole("button", { name: /保存修改|确认提交立卷|确认补交立卷/ }).click();
  const result = await Promise.race([
    responsePromise,
    guardFailure.then((reason) => ({ guardReason: reason })),
    delay(45_500).then(() => ({ response: null })),
  ]);
  evidence._activeExpectation.rejectGuard = null;
  if (result.guardReason) throw new Error(`submission_guard_blocked_${result.guardReason}`);
  if (!result.response) throw new Error("video_submit_response_missing_or_timed_out");
  const response = result.response;
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error("video_submit_response_not_json");
  }
  if (response.status() !== 200) throw new Error(`video_submit_http_${response.status()}`);
  const receipt = extractSubmissionReceipt(body);
  if (!receipt) throw new Error("video_submit_receipt_incomplete");
  if (receipt.anomalyStatus !== "abnormal" || receipt.storedTopicId !== null) throw new Error("video_submit_scope_or_topic_guard_failed");
  return receipt;
}

async function saveScreenshot(page, directory, name, flow, persist) {
  const filename = `${name}.png`;
  const fullPath = path.join(directory, filename);
  await page.screenshot({ path: fullPath, fullPage: true, animations: "disabled" });
  await chmod(fullPath, 0o600);
  flow.screenshots ??= [];
  flow.screenshots.push(filename);
  await persist();
}

async function runMemberFlow(browser, origin, config, secrets, runId, evidence, networkGuards, persist) {
  const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: "block" });
  const flowNetworkGuards = installBrowserNetworkGuards(context, evidence, config, secrets.probeToken, evidence._activeExpectation, persist);
  const page = await context.newPage();
  const recorder = { failedBrowserRequests: [] };
  attachRecorder(page, recorder, "member", origin, flowNetworkGuards);
  const flow = {
    login: null,
    pageChecks: [],
    mutations: [],
    screenshots: [],
    cleanupState: "kept for admin recycle-bin transition",
  };
  const domainRecord = evidence.domains.find((entry) => entry.origin === origin);
  if (domainRecord) domainRecord.member = flow;
  flow.sideEffects = { usageEventAttempts: recorder.usageEventAttempts };
  try {
    await loginWithPassword(page, origin, secrets.credentials.member, flow, persist);
    await checkRolePages(page, origin, "member", config.pagesByRole.member, flow, persist);
    await page.goto(`${origin}/dashboard`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.locator("main").waitFor({ state: "visible", timeout: 20_000 });
    flow.selectedDate = await selectBizDateThroughCalendar(page, origin, config.bizDate);
    await page.locator("#video_title").waitFor({ state: "visible", timeout: 30_000 });

    const suffix = origin.includes("direct.") ? "direct" : "primary";
    const originalTitle = `【DY验收-${runId}-${suffix}】作品日报`;
    const modifiedTitle = `${originalTitle}-已修改`;
    const content = `CloudBase 双域真实页面验收 ${runId}；仅用于员工维护窗口，可按 videoId 清理。`;
    await fillSubmissionForm(page, originalTitle, content);
    await saveScreenshot(page, evidence._evidenceDirectory, `${suffix}-member-before-create`, flow, persist);

    const created = await submitWithGuardRace(page, originalTitle, evidence, config);
    flow.mutations.push({ action: "create", ...created, title: originalTitle, responseBodyId: true, responseIds: "captured in responseLedger" });
    evidence.detectedRows.knownIds.push({ table: "videos", id: created.videoId, origin, source: "POST /api/video-submit" });
    evidence.detectedRows.knownIds.push({ table: "daily_reports", id: created.reportId, origin, source: "POST /api/video-submit" });
    evidence.newObjects.push({ origin, videoId: created.videoId, reportId: created.reportId, bizDate: created.reportDate, title: originalTitle });
    await persist();
    if (created.reportDate !== config.bizDate) throw new Error("server_report_date_mismatch");
    if (created.topicLibraryEntry?.outcome !== "skipped" || created.topicLibraryEntry?.reason !== "review_excluded" || created.topicLibraryEntry?.subTopicId) {
      throw new Error("review_classification_did_not_exclude_topic_library_write");
    }
    if (!await page.getByText("今日创作已成功立卷", { exact: false }).first().isVisible().catch(() => false)) {
      await page.getByText("今日创作已成功立卷", { exact: false }).first().waitFor({ state: "visible", timeout: 20_000 });
    }
    await saveScreenshot(page, evidence._evidenceDirectory, `${suffix}-member-created`, flow, persist);

    const receipt = page.locator("div.py-8").filter({ hasText: "今日创作已成功立卷" });
    const editResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/video-submit/edit-detail", { timeout: 45_000 });
    await receipt.getByRole("button", { name: "查看并修改", exact: true }).click();
    await page.locator("#video_title").waitFor({ state: "visible", timeout: 30_000 });
    await page.locator("#video_title").evaluate((element, expected) => {
      if (element.value !== expected) throw new Error("readback title does not match create");
    }, originalTitle);
    const editResponse = await editResponsePromise;
    if (editResponse.status() !== 200) throw new Error(`edit_detail_http_${editResponse.status()}`);
    let editBody;
    try { editBody = await editResponse.json(); } catch { throw new Error("edit_detail_response_not_json"); }
    const editDetail = isPlainObject(editBody.detail) ? editBody.detail : null;
    if (!editDetail || editDetail.videoId !== created.videoId || editDetail.reportId !== created.reportId || editDetail.bizDate !== config.bizDate) {
      throw new Error("edit_detail_readback_id_mismatch");
    }
    flow.mutations.push({ action: "readback", videoId: editDetail.videoId, reportId: editDetail.reportId, bizDate: editDetail.bizDate, titleVisibleInForm: true });
    await saveScreenshot(page, evidence._evidenceDirectory, `${suffix}-member-readback`, flow, persist);

    await page.locator("#video_title").fill(modifiedTitle);
    await page.locator("#content").fill(`${content} 修改回读验证。`);
    await ensureTopicTag(page, "复盘");
    await page.locator("#video_title").blur();
    const edited = await submitWithGuardRace(page, modifiedTitle, evidence, config);
    if (edited.videoId !== created.videoId || edited.reportId !== created.reportId || edited.reportDate !== created.reportDate) {
      throw new Error("edit_created_new_rows_or_changed_binding");
    }
    flow.mutations.push({ action: "edit", videoId: edited.videoId, reportId: edited.reportId, reportDate: edited.reportDate, title: modifiedTitle });
    evidence.newObjects[evidence.newObjects.length - 1].titleAfterEdit = modifiedTitle;
    await saveScreenshot(page, evidence._evidenceDirectory, `${suffix}-member-edited`, flow, persist);
    await verifySignout(page, flow, persist);
    return { flow, object: { ...created, originalTitle, modifiedTitle, origin } };
  } catch (error) {
    flow.failureCode = safeFailureCode(error, "member_flow_failed");
    throw error;
  } finally {
    flow.failedBrowserRequests = recorder.failedBrowserRequests;
    flow.sideEffects.usageEventAttempts = recorder.usageEventAttempts ?? [];
    await flowNetworkGuards.flush();
    await persist();
    await context.close();
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function runAdminFlow(browser, object, origin, config, secrets, evidence, networkGuards, persist) {
  const context = await browser.newContext({ acceptDownloads: false, serviceWorkers: "block" });
  evidence._activeExpectation.videoId = object.videoId;
  const flowNetworkGuards = installBrowserNetworkGuards(context, evidence, config, secrets.probeToken, evidence._activeExpectation, persist);
  const page = await context.newPage();
  const recorder = { failedBrowserRequests: [] };
  attachRecorder(page, recorder, "admin", origin, flowNetworkGuards);
  const flow = { login: null, pageChecks: [], mutations: [], screenshots: [] };
  const domainRecord = evidence.domains.find((entry) => entry.origin === origin);
  if (domainRecord) domainRecord.admin = flow;
  try {
    await loginWithPassword(page, origin, secrets.credentials.admin, flow, persist);
    await checkRolePages(page, origin, "admin", config.pagesByRole.admin, flow, persist);
    const allContentPath = `/admin/content?view=all&videoId=${encodeURIComponent(object.videoId)}`;
    await page.goto(`${origin}${allContentPath}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.getByText(object.modifiedTitle, { exact: false }).first().waitFor({ state: "visible", timeout: 40_000 });
    const visibleDetail = page.getByText(object.modifiedTitle, { exact: false }).first();
    if (!await visibleDetail.isVisible()) throw new Error("admin_content_detail_not_visible");
    await saveScreenshot(page, evidence._evidenceDirectory, `${origin.includes("direct.") ? "direct" : "primary"}-admin-content-read`, flow, persist);

    // Read the precise snapshot row through the same role-authorized app endpoint after
    // confirming the actual data-review page rendered the modified record.
    const detailRead = await page.evaluate(async (videoId) => {
      const response = await fetch(`/api/admin/content/${encodeURIComponent(videoId)}?view=all`, { credentials: "same-origin", cache: "no-store" });
      return { status: response.status, body: await response.json() };
    }, object.videoId);
    if (detailRead.status !== 200 || !isPlainObject(detailRead.body.video) || detailRead.body.video.id !== object.videoId) {
      throw new Error("admin_content_readback_failed");
    }
    const snapshotId = isPlainObject(detailRead.body.snapshot) && typeof detailRead.body.snapshot.id === "string"
      ? detailRead.body.snapshot.id
      : null;
    if (detailRead.body.video.video_title !== object.modifiedTitle || !snapshotId) throw new Error("admin_video_snapshot_readback_mismatch");
    evidence.detectedRows.knownIds.push({ table: "video_metrics_snapshots", id: snapshotId, origin, source: "GET /api/admin/content/[videoId]" });
    flow.mutations.push({ action: "admin_readback", videoId: object.videoId, snapshotId, titleMatchesEdited: true });
    await persist();

    await page.getByRole("button", { name: "移入回收站", exact: false }).click();
    await page.getByText("确认移入回收站？该作品将隐藏，关联的成员绩效日报将同步作废。", { exact: false }).waitFor({ state: "visible", timeout: 15_000 });
    const lifecycleResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return response.request().method() === "PATCH" && url.pathname === `/api/admin/videos/${object.videoId}/lifecycle`;
    }, { timeout: 45_000 });
    await page.getByRole("button", { name: "确认移入", exact: true }).click();
    const lifecycleResponse = await lifecycleResponsePromise;
    if (lifecycleResponse.status() !== 200) throw new Error(`lifecycle_http_${lifecycleResponse.status()}`);
    let lifecycleBody;
    try { lifecycleBody = await lifecycleResponse.json(); } catch { throw new Error("lifecycle_response_not_json"); }
    if (
      lifecycleBody.ok !== true || lifecycleBody.lifecycle_state !== "trashed" ||
      !Number.isFinite(lifecycleBody.daily_reports_changed) || lifecycleBody.daily_reports_changed < 1
    ) throw new Error("lifecycle_did_not_trash_and_void_report");
    flow.mutations.push({
      action: "trash_and_void_report",
      videoId: object.videoId,
      lifecycleState: lifecycleBody.lifecycle_state,
      dailyReportsChanged: lifecycleBody.daily_reports_changed,
      requestId: readRequestIdFromBody(lifecycleBody),
      physicalCleanup: "not_performed",
    });
    await persist();
    await page.getByText("作品已移入回收站，关联日报已作废", { exact: false }).waitFor({ state: "visible", timeout: 20_000 });

    await page.getByRole("button", { name: "归档", exact: true }).click();
    await page.getByRole("button", { name: new RegExp(`查看作品详情：${escapeRegExp(object.modifiedTitle)}`) }).waitFor({ state: "visible", timeout: 40_000 });
    flow.recycleBinReadback = { visible: true, title: object.modifiedTitle };
    await saveScreenshot(page, evidence._evidenceDirectory, `${origin.includes("direct.") ? "direct" : "primary"}-admin-recycle-bin`, flow, persist);
    await verifySignout(page, flow, persist);
    return flow;
  } catch (error) {
    flow.failureCode = safeFailureCode(error, "admin_flow_failed");
    throw error;
  } finally {
    flow.failedBrowserRequests = recorder.failedBrowserRequests;
    await flowNetworkGuards.flush();
    await persist();
    await context.close();
  }
}

function initialEvidence(config, runId) {
  return {
    task: "CloudBase dual-domain, dual-role browser acceptance",
    runId,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    bizDate: config.bizDate,
    accountId: config.accountId,
    origins: [...config.origins],
    status: "running",
    domains: [],
    newObjects: [],
    responseLedger: [],
    detectedRows: {
      knownIds: [],
      readbackRowIds: [],
      videoSubmitReceipts: [],
      lifecycleResponses: [],
    },
    sideEffects: {
      pageViews: "The UI may send usage_events page_view on navigation; record each /api/usage-events response RequestId below. The application response does not return usage_events row IDs.",
      reportSubmissionEvents: "The dashboard may send usage_events submit_daily_report after create and edit; record each /api/usage-events response RequestId below. The application response does not return usage_events row IDs.",
      loginAndRefresh: "Password login runs in a fresh browser context per role/domain. Closing the context discards local browser session state; server-side refresh/session expiry behavior is not revoked by this script.",
      tags: "Submission can create/update AI and manual video_tags rows. Their row IDs are not exposed by current submit/edit-detail responses; identify by the saved videoId during physical cleanup.",
      topicLibrary: "The response topic_library_entry is recorded. Classification 复盘 is excluded from automatic topic-library insertion; topic_id must stay null.",
      screenshotStorage: "No screenshot is selected or uploaded; no COS request is intentionally made.",
      profileRows: "Login/read flow is expected to use existing profile rows; no profile creation or role changes are performed by this script.",
    },
    cleanup: {
      productAction: "Admin UI moves each test video to recycle bin and voids its bound daily_report.",
      physicalDeletion: "not performed; main window performs separate physical cleanup using the IDs below.",
      usageEventIds: "not returned by /api/usage-events; RequestIds, role, origin and run time are retained for narrow follow-up lookup.",
      unknownChildRows: "video_tags rows are associated by video_id; no direct SQL or service-key database access is used by this browser harness.",
    },
    browserSafety: { blockedRequests: [], blockedWrites: [], evidenceWriteFailed: false },
  };
}

function findUsageEventSideEffects(evidence) {
  return evidence.responseLedger
    .filter((entry) => entry.path === "/api/usage-events")
    .map((entry) => ({ role: entry.role, origin: entry.origin, requestIds: entry.requestIds, status: entry.status }));
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    try {
      return await import("@playwright/test");
    } catch {
      throw new Error("playwright_package_unavailable");
    }
  }
}

async function runAcceptance(config, evidence, evidenceDir) {
  const secrets = await readSecrets(config);
  const { chromium } = await loadPlaywright();
  const proxy = await createSiteOnlyProxy();
  const browser = await chromium.launch({ headless: true, proxy: { server: proxy.url },
    args: ["--proxy-bypass-list=<-loopback>"] }).catch(async error => { await proxy.close(); throw error; });
  const persistQueue = { chain: Promise.resolve(), failed: false };
  evidence._evidenceDirectory = evidenceDir;
  evidence._activeExpectation = {
    videoId: null,
    currentSubmission: null,
    rejectGuard: null,
  };
  evidence._evidenceFile = path.join(evidenceDir, "evidence.json");
  const persist = async () => {
    persistQueue.chain = persistQueue.chain.then(() => writeEvidenceFile(evidence._evidenceFile, stripPrivateInternalFields(evidence)));
    try {
      await persistQueue.chain;
    } catch {
      persistQueue.failed = true;
      evidence.browserSafety.evidenceWriteFailed = true;
    }
  };
  const guards = {
    async flush() {
      await persistQueue.chain;
      if (persistQueue.failed || evidence.browserSafety.evidenceWriteFailed) throw new Error("private_evidence_write_failed");
    },
  };
  try {
    await persist();
    for (const origin of config.origins) {
      const healthResponse = await fetch(origin + '/api/health?check=database', { signal: AbortSignal.timeout(20000) });
      const health = await healthResponse.json();
      if (healthResponse.status !== 200 || health.checks?.cloudbase?.backend !== 'cloudbase' || health.checks?.cloudbase?.status !== 'up') throw new Error('cloudbase_database_health_failed');
      const domainFlow = { origin, member: null, admin: null, status: "running" };
      domainFlow.health = { status: healthResponse.status, backend: 'cloudbase', database: 'up', at: new Date().toISOString() };
      evidence.domains.push(domainFlow);
      await persist();
      const domainConfig = { ...config, bizDate: config.bizDatesByOrigin?.[origin] ?? config.bizDate };
      const member = await runMemberFlow(browser, origin, domainConfig, secrets, evidence.runId, evidence, guards, persist);
      domainFlow.member = member.flow;
      evidence._activeExpectation.videoId = member.object.videoId;
      await persist();
      domainFlow.admin = await runAdminFlow(browser, member.object, origin, config, secrets, evidence, guards, persist);
      domainFlow.status = "complete";
      evidence.sideEffects.usageEvents = findUsageEventSideEffects(evidence);
      await persist();
    }
    evidence.status = "complete";
  } finally {
    await browser.close().finally(() => proxy.close());
    evidence.browserSafety.proxyBlockedConnections = proxy.blockedConnections;
    evidence.finishedAt = new Date().toISOString();
    evidence.sideEffects.usageEvents = findUsageEventSideEffects(evidence);
    await persist();
    await guards.flush();
  }
}

async function main(argv) {
  const cli = getCliConfigPath(argv);
  if (cli.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (cli.error) {
    process.stderr.write("参数错误。帮助内容可用：cutover-browser-acceptance.mjs --help\n");
    return 2;
  }

  let evidence;
  let evidencePath = null;
  let config;
  const runId = `cb-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  try {
    config = await readConfigFile(cli.configPath);
    evidence = initialEvidence(config, runId);
    const location = await makeEvidenceDirectory(config, runId, evidence);
    evidencePath = location.file;
    evidence._evidenceDirectory = location.directory;
    evidence._evidenceFile = location.file;
    await writeEvidenceFile(location.file, stripPrivateInternalFields(evidence));
    await runAcceptance(config, evidence, location.directory);
    process.stdout.write(`验收完成。私有证据：${location.directory}\n`);
    return 0;
  } catch (error) {
    if (evidence) {
      evidence.status = "failed";
      evidence.failureCode = error instanceof Error && /^[a-zA-Z0-9_-]+$/.test(error.message)
        ? error.message
        : "acceptance_failed";
      evidence.finishedAt = new Date().toISOString();
      if (evidencePath) {
        try { await writeEvidenceFile(evidencePath, stripPrivateInternalFields(evidence)); } catch {}
      }
    }
    const locationText = evidencePath ? ` 私有证据：${path.dirname(evidencePath)}` : "";
    process.stderr.write(`验收失败（${evidence?.failureCode ?? safeFailureCode(error, "acceptance_failed")}）。已保留现场；未重试、未自动清理。${locationText}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  }).catch(() => {
    process.stderr.write("验收脚本异常终止。若已创建私有证据目录，请先检查其中的现场记录。\n");
    process.exitCode = 1;
  });
}
