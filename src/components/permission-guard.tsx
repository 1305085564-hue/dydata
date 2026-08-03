"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldAlert, ArrowLeft, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { feedbackToast } from "@/components/ui/feedback-toast";

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
        feedbackToast.success("已通知管理员，请等待处理。");
      }
    } catch {
      feedbackToast.error("申请发送失败，请联系管理员。");
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] w-full flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-200">
      <div className="mx-auto max-w-md space-y-6 rounded-3xl border border-zinc-200 bg-white/90 p-8 shadow-xl shadow-zinc-900/5 backdrop-blur-xl">
        {/* 顶部微图标舱 */}
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-zinc-100/80 text-zinc-700 ring-1 ring-black/5">
          <ShieldAlert className="size-7 stroke-[1.5]" />
        </div>

        {/* 说明文本 */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-[11.5px] font-semibold text-zinc-600">
            <span>需访问权限</span>
          </div>
          <h2 className="text-[20px] font-semibold tracking-tight text-zinc-900">
            暂无「{moduleTitle}」权限
          </h2>
          <p className="text-[13px] leading-relaxed text-zinc-500">
            {description || `该功能属于系统受控模块，当前仅对${requiredRoleLabel}开放。如有业务需要，请联系管理员开通对应权限。`}
          </p>
        </div>

        {/* 快捷操作组 */}
        <div className="flex flex-col gap-2.5 pt-2 sm:flex-row sm:items-center sm:justify-center">
          <Button
            type="button"
            onClick={handlePermissionApply}
            disabled={isApplying}
            className="h-10 rounded-xl bg-[#D97757] px-5 text-[13px] font-semibold text-white shadow-md shadow-[#D97757]/20 hover:bg-[#C96442] active:scale-95 transition-all disabled:opacity-70"
          >
            <Send className="mr-1.5 size-4 stroke-[1.8]" />
            {isApplying ? "正在发送…" : "申请查看权限"}
          </Button>

          <Link href="/dashboard">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl border-zinc-200 bg-white px-4 text-[13px] font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 transition-all"
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
