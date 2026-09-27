"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldAlert, ArrowLeft, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { SectionHeading } from "@/components/ui/section-heading";

interface PermissionGuardProps {
  moduleTitle: string;
  requiredRoleLabel?: string;
  description?: string;
  showApplyButton?: boolean;
}

export function PermissionGuard({
  moduleTitle,
  requiredRoleLabel = "组长 · 管理",
  description,
  showApplyButton = true,
}: PermissionGuardProps) {
  const pathname = usePathname();
  const [isApplying, setIsApplying] = useState(false);

  const handlePermissionApply = async () => {
    if (isApplying) return;
    setIsApplying(true);
    try {
      const res = await fetch("/api/permission-requests/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleTitle, currentPath: pathname }),
      });
      if (!res.ok) throw new Error("申请失败");
      const payload = await res.json();
      if (payload.warning) {
        feedbackToast.error(payload.warning);
      } else {
        feedbackToast.success("已通知公司管理方，等待处理中。");
      }
    } catch {
      feedbackToast.error("申请发送失败，请联系公司所有者或组长。");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] w-full flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-200">
      <div className="mx-auto max-w-md space-y-6 rounded-2xl border border-[#E2E2DF] bg-white/90 p-8 shadow-claude-dialog backdrop-blur-xl">
        {/* 顶部微图标舱 */}
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#F1F1F0]/80 text-[#1F1E1D] ring-1 ring-black/5">
          <ShieldAlert className="size-7 stroke-[1.5]" />
        </div>

        {/* 说明文本 */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1 rounded-full bg-[#F1F1F0] px-3 py-1 text-[12px] font-normal text-[#1F1E1D]">
            <span>需访问权限</span>
          </div>
          <SectionHeading as="h2" className="tracking-tight">
            还没有「{moduleTitle}」权限
          </SectionHeading>
          <p className="text-[13px] leading-relaxed text-[#1F1E1D]">
            {description ||
              (showApplyButton
                ? `该功能属于系统受控模块，当前仅对${requiredRoleLabel}开放。如有业务需要，请联系公司所有者或组长开通对应权限。`
                : `该功能属于系统受控模块，当前仅对${requiredRoleLabel}开放。如需访问，请联系企业主账号管理员。`)}
          </p>
        </div>

        {/* 快捷操作组 */}
        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-center">
          {showApplyButton && (
            <Button
              type="button"
              size="l"
              onClick={handlePermissionApply}
              disabled={isApplying}
              className="rounded-xl px-5 text-[13px]"
            >
              <Send className="mr-1.5 size-4 stroke-[1.8]" />
              {isApplying ? "正在发送…" : "申请查看权限"}
            </Button>
          )}

          <Link href="/dashboard">
            <Button
              type="button"
              variant="outline"
              size="l"
              className="rounded-xl px-4 text-[13px]"
            >
              <ArrowLeft className="mr-1.5 size-4 stroke-[1.8]" />
              返回工作台
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
