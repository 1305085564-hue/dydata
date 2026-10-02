import { createWriteStream, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const port = process.env.PORT || "3100";
const logPath = process.env.DYDATA_ROLE_GATE_LOG_FILE || resolve(process.cwd(), "output/审批九类/服务端.log");

/**
 * 服务端与种子必须指向同一套本地隔离环境。
 * 曾经真实踩坑：在门禁之外先跑了一次 `next build`（没带 .env.ai-test.local），
 * 生产 Supabase 地址被编译进浏览器包，3100 上的服务随后拿测试密钥查本地库，
 * 三个角色的数据管理页全 500、写接口从 403 变 500 —— 一屏假红。
 */
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
function assertLocalOnly() {
  const missing = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_DB_URL"].filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`角色门禁服务端缺少 ${missing.join(" / ")}：请用 npm run gate:roles（或先 source .env.ai-test.local）启动`);
  }
  const hosts = {
    api: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname,
    db: new URL(process.env.SUPABASE_DB_URL).hostname,
  };
  if (!LOCAL_HOSTS.has(hosts.api) || !LOCAL_HOSTS.has(hosts.db)) {
    throw new Error(`角色门禁服务端只允许本地隔离库：api=${hosts.api}, db=${hosts.db}`);
  }
}
assertLocalOnly();

mkdirSync(dirname(logPath), { recursive: true });
const log = createWriteStream(logPath, { flags: "w" });
const nextBin = resolve(process.cwd(), "node_modules/next/dist/bin/next");
const child = spawn(process.env.NODE_BINARY || "node", [nextBin, "start", "-p", port], {
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

function forward(stream, output) {
  stream.on("data", (chunk) => {
    log.write(chunk);
    output.write(chunk);
  });
}

forward(child.stdout, process.stdout);
forward(child.stderr, process.stderr);

const stop = (signal) => {
  if (!child.killed) child.kill(signal);
};
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
child.on("exit", (code, signal) => {
  log.end();
  process.exit(code ?? (signal ? 1 : 0));
});
