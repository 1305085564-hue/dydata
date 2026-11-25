#!/usr/bin/env node
/**
 * 一条命令发版：npm run release
 *
 * 把「推送 → 门禁 → 上传 → 发版 → 线上核对」收成一条命令，中间不再需要人盯：
 *   ① 前置：工作树必须干净、必须在 main；
 *   ② 本地领先 origin/main 时自动 `git push`（pre-push 门禁照跑，禁用 --no-verify 的前提不变）；
 *   ③ 自动定位本机已安装的 @cloudbase/cloudbase-mcp，调用 deploy-service.mjs 上传并发版；
 *   ④ 轮询线上 /deployment.json 与 /api/health，直到线上提交号等于本地 HEAD 且健康检查为 up。
 *
 * 退出码 0 只在「线上真的跑起这一笔提交」时返回；超时或健康检查不通过返回 1，由调用方如实报错。
 */
import { execFileSync } from 'node:child_process';
import { globSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const site = process.env.DYDATA_SITE_ORIGIN || 'https://dydata.cc';
const waitMinutes = Number(process.env.RELEASE_WAIT_MINUTES || 20);
const pollMs = 15_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const say = (line) => console.log(line);

function git(...args) {
  return execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString().trim();
}

function stop(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

async function getJson(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { status: res.status, body: null };
    return { status: res.status, body: await res.json() };
  } catch (error) {
    return { status: 0, body: null, error: String(error?.message || error) };
  }
}

function findMcpModule() {
  const fromEnv = process.env.CLOUDBASE_MCP_MODULE;
  if (fromEnv) return fromEnv;
  const found = globSync(`${homedir()}/.npm/_npx/*/node_modules/@cloudbase/cloudbase-mcp/dist/index.cjs`);
  if (!found.length) {
    stop('本机找不到 @cloudbase/cloudbase-mcp。先跑一次 `npx -y @cloudbase/cloudbase-mcp@latest --version` 装上，再执行 npm run release');
  }
  return found[0];
}

// ── ① 前置检查 ────────────────────────────────────────────
const dirty = git('status', '--porcelain');
if (dirty) stop(`工作树有未提交改动，先提交再发版：\n${dirty}`);
if (git('branch', '--show-current') !== 'main') stop('只发布 main，当前不在 main');

const head = git('rev-parse', 'HEAD');
try {
  execFileSync('git', ['fetch', 'origin', 'main', '--quiet'], { cwd: root });
} catch {
  say('  （拉取远端失败，按本地记录的 origin/main 继续，发版脚本还会再核对一次）');
}
const remoteAfterFetch = git('rev-parse', 'origin/main');

const isBehind = (() => {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', remoteAfterFetch, head], { cwd: root });
    return false;
  } catch {
    return true;
  }
})();
if (isBehind) stop('远端 main 比本地新（本地落后或分叉）。先 git pull --rebase 对齐再发版');

// ── ② 本地有未推送提交就自动推送（门禁照跑）─────────────────
if (head !== remoteAfterFetch) {
  const pending = git('log', '--oneline', `origin/main..HEAD`).split('\n').filter(Boolean);
  say(`▶ 先推送 ${pending.length} 笔本地提交（门禁会自动跑，约 1–2 分钟）：`);
  for (const line of pending) say(`  · ${line}`);
  execFileSync('git', ['push', 'origin', 'main'], { cwd: root, stdio: 'inherit' });
  if (git('rev-parse', 'origin/main') !== head) stop('推送后 origin/main 与本地 HEAD 不一致，停止发版');
} else {
  say('▶ 代码已在远端 main，无需推送');
}

// ── ③ 上传并发版 ──────────────────────────────────────────
const modulePath = findMcpModule();
const startedAt = Date.now();
say('▶ 开始上传并发布云托管新版本（平台构建通常 3–9 分钟）');

let deploy;
try {
  const out = execFileSync(process.execPath, ['scripts/cloudbase/deploy-service.mjs'], {
    cwd: root,
    env: { ...process.env, CLOUDBASE_MCP_MODULE: modulePath },
    maxBuffer: 32 * 1024 * 1024,
  }).toString();
  const lastJson = out.trim().split('\n').filter((line) => line.trim().startsWith('{')).pop();
  deploy = JSON.parse(lastJson);
} catch (error) {
  const detail = error?.stdout?.toString().trim() || error?.stderr?.toString().trim() || String(error);
  stop(`发版请求失败：\n${detail}`);
}

say(`  已提交发布请求：packageVersion=${deploy.packageVersion} requestId=${deploy.requestId}`);

// ── ④ 等线上真正换成这一笔 ────────────────────────────────
say('▶ 等待线上切到新版本（每 15 秒核对一次 /deployment.json）');
const deadline = Date.now() + waitMinutes * 60_000;
let lastDep = '未知';
let lastHealth = '未知';
let healthy = false;

while (Date.now() < deadline) {
  const [dep, health] = await Promise.all([
    getJson(`${site}/deployment.json`),
    getJson(`${site}/api/health?check=cloudbase`),
  ]);

  lastDep = dep.body?.commit ? dep.body.commit.slice(0, 8) : dep.error || `HTTP ${dep.status}`;
  const dbStatus = health.body?.checks?.cloudbase?.status;
  lastHealth = health.status ? `${health.status}${dbStatus ? ` ${dbStatus}` : ''}` : '连不上';
  if (dbStatus === 'up') healthy = true;

  if (dep.body?.commit === head) {
    if (!healthy) {
      // 新版本已切流但健康检查没起来，再给两轮机会，避免瞬时波动误报
      say(`  版本已切换，等待健康检查恢复（当前 ${lastHealth}）`);
      await sleep(pollMs);
      continue;
    }
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    say('');
    say('✅ 已上线');
    say(`   线上提交：${head.slice(0, 8)}（与本地 HEAD 一致）`);
    say(`   健康检查：${lastHealth}`);
    say(`   用时：${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`);
    process.exit(0);
  }

  await sleep(pollMs);
}

say('');
say(`✖ 超时：${waitMinutes} 分钟内线上没切到 ${head.slice(0, 8)}`);
say(`   最后一次看到：/deployment.json = ${lastDep}，健康检查 = ${lastHealth}`);
say('   排查：控制台看云托管版本列表与构建日志；确需止血可在流量配置把上一版切回 100%');
process.exit(1);
