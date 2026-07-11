"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, X } from "lucide-react";
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
import { updateProfile, updateAccountName, createAccount } from "@/app/(app)/dashboard/actions";
import { cn } from "@/lib/utils";

interface Account {
  id: string;
  name: string;
}

interface ProfileEditDialogProps {
  currentName: string;
  role: string;
  accounts?: Account[];
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
    return "border-stone-200 text-stone-700";
  return "border-stone-200 text-stone-500";
}

export function ProfileEditDialog({
  currentName,
  role,
  accounts = [],
  trigger = "icon",
  children,
}: ProfileEditDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [isPending, startTransition] = useTransition();
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingAccountName, setEditingAccountName] = useState("");
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountDirection, setNewAccountDirection] = useState("");

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

  function handleEditAccount(account: Account) {
    setEditingAccountId(account.id);
    setEditingAccountName(account.name);
  }

  function handleCancelEditAccount() {
    setEditingAccountId(null);
    setEditingAccountName("");
  }

  function handleSaveAccountName(accountId: string) {
    const trimmed = editingAccountName.trim();
    if (!trimmed) {
      feedbackToast.error("账号名称不能为空");
      return;
    }
    if (trimmed.length > 30) {
      feedbackToast.error("账号名称最多 30 个字符");
      return;
    }

    const originalAccount = accounts.find((a) => a.id === accountId);
    if (originalAccount && trimmed === originalAccount.name) {
      setEditingAccountId(null);
      return;
    }

    startTransition(async () => {
      const result = await updateAccountName(accountId, trimmed);
      if (result?.error) {
        feedbackToast.error(result.error);
      } else {
        feedbackToast.success("账号名称已更新");
        setEditingAccountId(null);
      }
    });
  }

  function handleStartAddAccount() {
    setIsAddingAccount(true);
    setNewAccountName("");
    setNewAccountDirection("");
  }

  function handleCancelAddAccount() {
    setIsAddingAccount(false);
    setNewAccountName("");
    setNewAccountDirection("");
  }

  function handleConfirmAddAccount() {
    const trimmedName = newAccountName.trim();
    const trimmedDirection = newAccountDirection.trim();
    if (!trimmedName) {
      feedbackToast.error("请填写账号备注名");
      return;
    }
    if (trimmedName.length > 30) {
      feedbackToast.error("账号备注名最多 30 个字符");
      return;
    }
    startTransition(async () => {
      const result = await createAccount(trimmedName, trimmedDirection || undefined);
      if (result?.error) {
        feedbackToast.error(result.error);
        return;
      }
      feedbackToast.success("账号已添加");
      setIsAddingAccount(false);
      setNewAccountName("");
      setNewAccountDirection("");
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
              className="inline-flex items-center justify-center rounded-lg p-1 text-stone-500 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-stone-100 hover:text-stone-700 active:translate-y-0"
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
          <DialogTitle className="text-[18px] font-medium tracking-tight text-stone-900">
            编辑个人资料
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-[1.7] text-stone-500">
            修改你在平台上的显示名称，所有页面将同步更新
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label
              htmlFor="profile-name"
              className="text-[13px] font-medium text-stone-900"
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
            <p className="text-[12px] text-stone-500">
              {name.length}/20 字符
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-[13px] font-medium text-stone-900">
              当前身份
            </Label>
            <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg bg-stone-800 text-[12px] font-medium text-white",
                )}
              >
                {currentName.trim().slice(0, 1).toUpperCase() || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-stone-900">
                  {currentName}
                </p>
                <p className="text-[12px] text-stone-500">
                  {roleLabel(role)}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-0.5 text-[12px] font-medium uppercase tracking-wider",
                  roleBadgeClass(role),
                )}
              >
                {role}
              </span>
            </div>
          </div>

          {accounts.length > 0 && (
            <div className="space-y-2">
              <Label className="text-[13px] font-medium text-stone-900">
                抖音账号名
              </Label>
              <div className="space-y-2">
                {accounts.map((account) => (
                  <div
                    key={account.id}
                    className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3"
                  >
                    {editingAccountId === account.id ? (
                      <>
                        <Input
                          value={editingAccountName}
                          onChange={(e) => setEditingAccountName(e.target.value)}
                          placeholder="请输入账号名称"
                          maxLength={30}
                          disabled={isPending}
                          autoFocus
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleSaveAccountName(account.id)}
                          disabled={isPending}
                        >
                          {isPending ? "保存中..." : "保存"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleCancelEditAccount}
                          disabled={isPending}
                        >
                          取消
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#D97757] text-[12px] font-medium text-white">
                          {account.name.trim().slice(0, 1).toUpperCase() || "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-stone-900">
                            {account.name}
                          </p>
                          <p className="text-[12px] text-stone-500">
                            抖音账号
                          </p>
                        </div>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-lg p-1 text-stone-500 transition-[background-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-stone-100 hover:text-stone-700 active:translate-y-0"
                          onClick={() => handleEditAccount(account)}
                          disabled={isPending}
                          aria-label={`编辑 ${account.name}`}
                        >
                          <Pencil className="size-3.5 stroke-[1.5]" />
                        </button>
                      </>
                    )}
                  </div>
                ))}

                {isAddingAccount ? (
                  <div className="space-y-3 rounded-xl border border-[#D97757]/35 bg-[#FDF9F7] px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#C96442]">
                        <span className="size-1.5 rounded-full bg-[#D97757]" />
                        新增抖音账号
                      </span>
                      <button
                        type="button"
                        onClick={handleCancelAddAccount}
                        disabled={isPending}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-stone-500 transition-[background-color,color] duration-150 hover:bg-white hover:text-stone-700"
                        aria-label="取消添加账号"
                      >
                        <X className="size-3.5 stroke-[1.6]" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      <Input
                        value={newAccountName}
                        onChange={(e) => setNewAccountName(e.target.value)}
                        placeholder="账号备注名(例:主账号、矩阵号A)"
                        maxLength={30}
                        disabled={isPending}
                        autoFocus
                      />
                      <Input
                        value={newAccountDirection}
                        onChange={(e) => setNewAccountDirection(e.target.value)}
                        placeholder="出镜 / 图文方向(选填)"
                        maxLength={30}
                        disabled={isPending}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleCancelAddAccount}
                        disabled={isPending}
                      >
                        取消
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleConfirmAddAccount}
                        disabled={isPending}
                      >
                        {isPending ? "添加中..." : "确认添加"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartAddAccount}
                    disabled={isPending}
                    className="group flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 bg-white px-4 py-3 text-[12px] font-medium text-stone-500 transition-[background-color,border-color,color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:border-[#D97757]/45 hover:bg-[#FDF9F7] hover:text-[#C96442] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="size-3.5 stroke-[1.6]" />
                    添加抖音账号
                  </button>
                )}
              </div>
              <p className="text-[12px] text-stone-500">
                修改后将同步更新所有相关数据
              </p>
            </div>
          )}

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
