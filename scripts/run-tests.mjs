#!/usr/bin/env node
// 测试入口分两组，让"红灯"只有一种含义：
//   unit（npm test）：不依赖任何外部服务，任何环境下都必须全绿。
//   real-db（npm run test:real-db）：连本地隔离库，串行执行；库没起来就明确失败，不静默跳过。
// 背景：真实库测试曾混在 npm test 里，库没启动时固定 8 红，被当成"预存限制"放行；
// 库启动后并行执行又会因 DDL 抢锁死锁。见 docs/系统架构与设计/工程运行事实.md「测试分组」。
import { spawnSync } from "node:child_process";
import { existsSync, globSync, readFileSync } from "node:fs";
import net from "node:net";
import process from "node:process";

const mode = process.argv[2] ?? "unit";
const REAL_DB = /\.real-db\.test\.tsx?$/;
const SCRIPT_TESTS = ["scripts/maintainability-gate.test.mjs", "scripts/screenshot-storage-boundary.test.mjs"];

const srcTests = globSync(["src/**/*.test.ts", "src/**/*.test.tsx"]).map((file) => file.split("\\").join("/")).sort();
// node --test 把参数当通配符解析：路径里的 [id] 会被当成字符集，文件被静默漏跑（假绿）。
// 把方括号转义成只匹配字面字符的形式。
const literal = (file) => file.replace(/[[\]]/g, (char) => `[${char}]`);

function runTsx(files, extraArgs = [], env = process.env) {
  if (files.length === 0) {
    console.error(`[run-tests] ${mode}: 没有找到测试文件`);
    process.exit(1);
  }
  const child = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "--test", ...extraArgs, ...files.map(literal)], { stdio: "inherit", env });
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}

function readLocalEnv() {
  const file = ".env.ai-test.local";
  if (!existsSync(file)) return null;
  const values = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return values;
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: Number(port) });
    socket.setTimeout(2000);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(false));
  });
}

if (mode === "unit") {
  runTsx([...srcTests.filter((file) => !REAL_DB.test(file)), ...SCRIPT_TESTS]);
} else if (mode === "real-db") {
  const env = readLocalEnv();
  if (!env?.SUPABASE_DB_URL) {
    console.error("[run-tests] real-db: 缺少 .env.ai-test.local 或其中的 SUPABASE_DB_URL，无法连接本地隔离库");
    process.exit(1);
  }
  const dbUrl = new URL(env.SUPABASE_DB_URL);
  if (!["127.0.0.1", "localhost"].includes(dbUrl.hostname)) {
    console.error("[run-tests] real-db: SUPABASE_DB_URL 不是本机地址，拒绝运行（真实库测试会写入和改表结构）");
    process.exit(1);
  }
  if (!(await canConnect(dbUrl.hostname, dbUrl.port || "5432"))) {
    console.error(`[run-tests] real-db: 本地库 ${dbUrl.hostname}:${dbUrl.port} 连不上。先运行 \`colima start\`（容器环境）和 \`supabase start\`，再重跑。`);
    process.exit(1);
  }
  const childEnv = { ...process.env };
  // 渠道治理那一条需要显式给出本地接口地址；只从本地测试配置取，并且只接受本机地址。
  if (!childEnv.AI_GOVERNANCE_TEST_URL && /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
    childEnv.AI_GOVERNANCE_TEST_URL = env.NEXT_PUBLIC_SUPABASE_URL;
  }
  // 多个文件会改表结构（延后删列演练等），并行跑会互相死锁，必须串行。
  runTsx(srcTests.filter((file) => REAL_DB.test(file)), ["--test-concurrency=1"], childEnv);
} else {
  console.error(`[run-tests] 未知模式：${mode}（可选 unit / real-db）`);
  process.exit(1);
}
