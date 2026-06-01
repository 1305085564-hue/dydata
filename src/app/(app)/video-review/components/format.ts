/** 截取话术开头展示用，按你 UI 期望取前 N 字 */
export function getScriptOpening(text: string, max = 30): string {
  if (!text) return "";
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

/** 把 ISO 时间格式化成本地短日期 yyyy-MM-dd */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 等待时长：用于审核队列 — 简短显示如 2h / 35m / 3d */
export function formatWaitDuration(iso: string): string {
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return "—";
  const ms = Date.now() - start;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/** 状态点配色 — 与美学规范四态对齐 */
export function statusDotColor(status: "pending" | "approved" | "rejected"): string {
  if (status === "approved") return "#6FAA7D";
  if (status === "rejected") return "#C9604D";
  return "#D99E55";
}

export function statusLabel(status: "pending" | "approved" | "rejected"): string {
  if (status === "approved") return "已通过";
  if (status === "rejected") return "待整改";
  return "审核中";
}
