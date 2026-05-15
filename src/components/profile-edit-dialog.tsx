"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { updateProfile } from "@/app/(app)/dashboard/actions";
import { cn } from "@/lib/utils";

interface ProfileEditDialogProps {
  currentName: string;
  role: string;
  trigger?: "icon" | "menu-item";
  children?: React.ReactNode;
}

function roleLabel(role: string) {
  if (role === "owner") return "创始人";
  if (role === "admin") return "管理员";
  return "成员";
}

function roleBadgeClass(role: string) {
  if (role === "owner")
    return "border-[#D97757]/40 text-[#D97757]";
  if (role === "admin")
    return "border-zinc-200 text-zinc-700";
  return "border-zinc-200 text-zinc-500";
}

export function ProfileEditDialog({
  currentName,
  role,
  trigger = "icon",
  children,
}: ProfileEditDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const submittedName = name.trim();

    if (!submittedName) {
      feedbackToast.error("显示名称不能为空");
      return;
    }
    if (submittedName.length > 20) {
      feedbackToast.error("显示名称最多 20 个字符");
      return;
    }
    if (submittedName === currentName) {
      setOpen(false);
      return;
    }

    startTransition(async () => {
      const result = await updateProfile(submittedName);
      if (result?.error) {
        feedbackToast.error(result.error);
      } else {
        feedbackToast.success("资料已更新");
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          children ? (
            <button type="button" className="w-full text-left">
              {children}
            </button>
          ) : trigger === "icon" ? (
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg p-1 text-zinc-400 transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-px hover:bg-zinc-100 hover:text-zinc-600 active:translate-y-0"
              aria-label="编辑资料"
            >
              <Pencil className="size-3.5 stroke-[1.5]" />
            </button>
          ) : undefined
        }
      >
        {trigger === "menu-item" && !children ? "编辑资料" : undefined}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-semibold tracking-tight text-zinc-800">
            编辑个人资料
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.7] text-zinc-500">
            修改你在平台上的显示名称，所有页面将同步更新
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label
              htmlFor="profile-name"
              className="text-[13px] font-medium text-zinc-800"
            >
              显示名称
            </Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入显示名称"
              maxLength={20}
              required
              disabled={isPending}
              autoFocus
            />
            <p className="text-[12px] text-zinc-400">
              {name.length}/20 字符
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-[13px] font-medium text-zinc-800">
              当前身份
            </Label>
            <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-[10px] font-medium text-white",
                )}
              >
                {currentName.trim().slice(0, 1).toUpperCase() || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-zinc-800">
                  {currentName}
                </p>
                <p className="text-[12px] text-zinc-400">
                  {roleLabel(role)}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                  roleBadgeClass(role),
                )}
              >
                {role}
              </span>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              取消
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "保存中..." : "保存更改"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
