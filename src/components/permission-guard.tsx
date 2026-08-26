"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { DraftRecalibrateIllustration } from "@/components/editorial/editorial-illustrations";

interface PermissionGuardProps {
  moduleTitle: string;
  requiredRoleLabel?: string;
  description?: string;
}

export function PermissionGuard({
  moduleTitle,
  requiredRoleLabel = "团队管理员或组长",
  description,
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
        feedbackToast.success("已通知管理员，等待处理中。");
      }
    } catch {
      feedbackToast.error("申请发送失败，请联系管理员。");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] w-full flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-200 select-none">
      <div className="mx-auto max-w-md space-y-5 rounded-3xl border border-[#E5E0D6] bg-white/95 p-8 shadow-claude-dialog backdrop-blur-xl">
        {/* 单线蚀刻手稿插图（图以表意：重新校准罗盘与手稿） */}
        <div className="flex justify-center -mt-2 -mb-1">
          <DraftRecalibrateIllustration size={88} />
        </div>

        {/* 说明文本 */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#F5F3EE] px-3 py-1 text-[12px] font-medium text-[#78716C]">
            <span className="size-1.5 rounded-full bg-[#D97757]" />
            <span>需访问权限</span>
          </div>
          <h2 className="font-serif text-[18px] font-medium tracking-tight text-[#1C1917]">
            还没有「{moduleTitle}」权限
          </h2>
          <p className="text-[13px] leading-relaxed text-[#78716C]">
            {description || `该功能属于系统受控模块，当前仅对${requiredRoleLabel}开放。如有业务需要，请联系管理员开通对应权限。`}
          </p>
        </div>

        {/* 快捷操作组 */}
        <div className="flex flex-col gap-2.5 pt-2 sm:flex-row sm:items-center sm:justify-center">
          <Button
            type="button"
            onClick={handlePermissionApply}
            disabled={isApplying}
            className="h-10 rounded-xl bg-[#D97757] px-5 text-[13px] font-medium text-white shadow-md shadow-[#D97757]/20 hover:bg-[#C96442] active:scale-[0.985] active:duration-75 transition-all disabled:opacity-70"
          >
            <Send className="mr-1.5 size-4 stroke-[1.8]" />
            {isApplying ? "正在发送…" : "申请查看权限"}
          </Button>

          <Link href="/dashboard">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl border-[#E5E0D6] bg-white px-4 text-[13px] font-medium text-[#292524] hover:bg-[#F5F3EE] hover:text-[#1C1917] transition-all"
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
