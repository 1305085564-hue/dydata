export function toPriority(value: unknown, fallback = 100) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function toChannelPriority(value: unknown, fallback = 50) {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return fallback;
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 999) {
    throw new Error("渠道优先级必须是 1-999 的整数");
  }
  return parsed;
}
