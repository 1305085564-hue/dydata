import type { ExemptionRequest, GroupedApprovalItem } from "@/lib/exemption-approvals";

export type ApprovalCard =
  | { type: "exemption"; group: GroupedApprovalItem; id: string }
  | { type: "appeal"; appeal: ExemptionRequest; id: string };

export type ApprovalFilterNature = "all" | "leave" | "waive" | "appeal";

export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "";
  const diff = Date.now() - ts;
  const hr = Math.floor(diff / 3_600_000);
  if (hr < 24) return `${Math.max(0, hr)} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}
