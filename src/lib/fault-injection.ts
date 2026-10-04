export type FaultInjectionTarget = "health:supabase-down";

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
  if (isLocalRuntime()) return true;
  if (!isPreviewRuntime()) return false;

  const secret = process.env.DYDATA_FAULT_INJECTION_SECRET?.trim();
  const supplied = request?.headers.get("x-dydata-fault-injection")?.trim();
  return Boolean(secret && supplied && supplied === secret);
}
