#!/usr/bin/env node
/**
 * 线上云托管环境变量只读对账脚本（只读取变量名，绝不读取或打印变量值）。
 *
 * 清单唯一来源：仓库根目录 .env.example 中的 [必填] / [可选] 分区。
 * - 代码必填但线上未配置：退出码非 0（阻断发版）；
 * - 线上配置但代码不再读取：列出供后续清理核对。
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const RUNTIME_BUILTINS = new Set(["NODE_ENV", "PORT", "HOSTNAME", "NEXT_RUNTIME", "ANALYZE"]);

export function parseEnvExample(content) {
  const required = [];
  const optional = [];
  const seen = new Set();
  let section = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^#\s*==\s*\[必填\]\s*==/.test(line)) {
      section = "required";
      continue;
    }
    if (/^#\s*==\s*\[可选\]\s*==/.test(line)) {
      section = "optional";
      continue;
    }
    if (line.startsWith("#")) continue;

    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line);
    if (!match) continue;
    const key = match[1];
    if (!section) {
      throw new Error(`.env.example 中的 ${key} 未归属 [必填] 或 [可选] 分区`);
    }
    if (seen.has(key)) {
      throw new Error(`.env.example 中存在重复登记的变量：${key}`);
    }
    seen.add(key);
    if (section === "required") required.push(key);
    else optional.push(key);
  }

  return {
    requiredKeys: required.sort(),
    optionalKeys: optional.sort(),
  };
}

export function reconcileEnvKeys({ requiredKeys, optionalKeys, onlineKeys }) {
  const onlineSet = new Set(onlineKeys);
  const knownSet = new Set([...requiredKeys, ...optionalKeys, ...RUNTIME_BUILTINS]);

  const missingRequired = requiredKeys.filter((key) => !onlineSet.has(key)).sort();
  const matchedRequired = requiredKeys.filter((key) => onlineSet.has(key)).sort();
  const matchedOptional = optionalKeys.filter((key) => onlineSet.has(key)).sort();
  const unusedOnline = [...onlineSet].filter((key) => !knownSet.has(key)).sort();

  return {
    ok: missingRequired.length === 0,
    missingRequired,
    unusedOnline,
    matchedRequired,
    matchedOptional,
  };
}

export function formatReconcileReport(result) {
  const lines = [
    `[env-reconcile] 必填项核对：已配 ${result.matchedRequired.length}/${result.matchedRequired.length + result.missingRequired.length}，缺失 ${result.missingRequired.length}；可选项已配 ${result.matchedOptional.length}`,
  ];
  if (result.missingRequired.length > 0) {
    lines.push("代码必填但线上没配（阻断发版）：");
    for (const key of result.missingRequired) lines.push(`  - ${key}`);
  } else {
    lines.push("代码必填但线上没配：无");
  }
  if (result.unusedOnline.length > 0) {
    lines.push(`线上配了但代码不读（共 ${result.unusedOnline.length} 项，仅列变量名，不含值）：`);
    for (const key of result.unusedOnline) lines.push(`  - ${key}`);
  } else {
    lines.push("线上配了但代码不读：无");
  }
  return lines.join("\n");
}

export function assertOnlineEnvReady(repoRoot, onlineKeys) {
  const examplePath = path.join(repoRoot, ".env.example");
  const spec = parseEnvExample(readFileSync(examplePath, "utf8"));
  const result = reconcileEnvKeys({ ...spec, onlineKeys });
  if (!result.ok) {
    throw new Error(
      `线上云托管缺少代码必填环境变量：${result.missingRequired.join(", ")}。请先在腾讯云云托管 dydata 补齐后再发版。`,
    );
  }
  return result;
}

function resolveCloudBaseMcpModule() {
  if (process.env.CLOUDBASE_MCP_MODULE && existsSync(process.env.CLOUDBASE_MCP_MODULE)) {
    return process.env.CLOUDBASE_MCP_MODULE;
  }
  const npxRoot = path.join(homedir(), ".npm/_npx");
  if (!existsSync(npxRoot)) {
    throw new Error("未找到 @cloudbase/cloudbase-mcp，请设置 CLOUDBASE_MCP_MODULE");
  }
  const found = execFileSync("find", [npxRoot, "-path", "*/@cloudbase/cloudbase-mcp/dist/index.cjs", "-print", "-quit"], {
    encoding: "utf8",
  }).trim();
  if (!found) {
    throw new Error("未找到 @cloudbase/cloudbase-mcp，请设置 CLOUDBASE_MCP_MODULE");
  }
  return found;
}

export async function fetchOnlineCloudRunEnvKeys(repoRoot = root, serverName = "dydata") {
  const { envId } = JSON.parse(readFileSync(path.join(repoRoot, "cloudbaserc.json"), "utf8"));
  const keyPath = path.join(homedir(), ".local/share/dydata/keys/腾讯云CloudBase.txt");
  if (statSync(keyPath).mode & 0o077) throw new Error("凭据文件权限必须为 600");
  process.env.CLOUDBASE_API_KEY = readFileSync(keyPath, "utf8").trim();
  process.env.CLOUDBASE_ENV_ID = envId;

  const modulePath = resolveCloudBaseMcpModule();
  const sdk = await import(pathToFileURL(modulePath).href);
  const manager = await sdk.getCloudBaseManager({ cloudBaseOptions: { envId, region: "ap-shanghai" } });
  const service = manager.environmentManager.currentEnv.cloudRunService;
  const detail = await service.detail({ serverName });
  // 只取变量名，立即丢弃值对象，避免任何凭据残留或误打印。
  return Object.keys(JSON.parse(detail.ServerConfig.EnvParams || "{}")).sort();
}

async function main() {
  const onlineKeys = await fetchOnlineCloudRunEnvKeys(root, "dydata");
  const spec = parseEnvExample(readFileSync(path.join(root, ".env.example"), "utf8"));
  const result = reconcileEnvKeys({ ...spec, onlineKeys });
  console.log(formatReconcileReport(result));
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
