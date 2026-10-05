export type FaultInjectionTarget = "health:supabase-down";

const LOCAL_DB_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

// 注入生效的第三道闸：服务器实际连的库必须是本地库。
// next build 会把 NEXT_PUBLIC_* 编译期内联进 .next（DefinePlugin 同时替换服务端代码），
// 只校验 env 文件会形成假守卫——错构建产物里内联的是生产 URL。
// 这里读的是运行时值：本地 tsx 下为真实 env，构建产物里为内联字面量，两种情况都反映"本进程实际连哪"。
function isLocalDatabaseTarget() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return false;
  try {
    return LOCAL_DB_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function isLocalRuntime() {
  const isNonVercelRuntime = !process.env.VERCEL_ENV;
  return isNonVercelRuntime && (
    process.env.DYDATA_FAULT_INJECTION_LOCAL === "1"
    || process.env.NODE_ENV !== "production"
  );
}

function isPreviewRuntime() {
  return process.env.VERCEL_ENV === "preview";
}

export function isFaultInjectionRequested(
  target: FaultInjectionTarget,
  request?: Request,
) {
  if (process.env.DYDATA_FAULT_INJECTION !== target) return false;
  if (isLocalRuntime()) return isLocalDatabaseTarget();
  if (!isPreviewRuntime()) return false;

  const secret = process.env.DYDATA_FAULT_INJECTION_SECRET?.trim();
  const supplied = request?.headers.get("x-dydata-fault-injection")?.trim();
  return Boolean(secret && supplied && supplied === secret);
}
