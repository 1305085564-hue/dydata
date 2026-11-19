import { cn } from "@/lib/utils";
import type { CompanyRole } from "@/types";

/**
 * 成员的两个定位锚（《效率美学》定律 1）：头像首字圆让人在名单里一眼找到人，
 * 身份色让人一眼分出老板 / 组长 / 组员。类别色，不是异常色。
 */
export function MemberAvatar({ name, size = "sm" }: { name: string | null | undefined; size?: "sm" | "lg" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-[#E2E2DF]/60 bg-[#F1F1F0] text-[#1F1E1D]",
        size === "lg" ? "size-9 text-[14px]" : "size-7 text-[12px]",
      )}
    >
      {name ? name.slice(0, 1) : "?"}
    </span>
  );
}

const ROLE_TONE: Record<CompanyRole, string> = {
  company_owner: "bg-[#D97757]/10 text-[#C46A4D]",
  admin: "bg-status-info-bg text-status-info-text",
  member: "bg-[#F1F1F0] text-[#78716C]",
};

export function RoleChip({ role, label }: { role: CompanyRole | null; label: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-md px-2 text-[12px]",
        role ? ROLE_TONE[role] : "bg-[#F1F1F0] text-[#78716C]",
      )}
    >
      {label}
    </span>
  );
}

export function QuietChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center rounded-md bg-[#F1F1F0] px-2 text-[12px] text-[#78716C]">
      {children}
    </span>
  );
}
