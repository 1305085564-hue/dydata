"use client";

import React, { useEffect, useRef, useState, useTransition } from "react";
import { X, User, Shield, Check, Plus, Settings2, LogOut, Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { feedbackToast } from "@/components/ui/feedback-toast";
import {
  updateProfile,
  updateAccountName,
  createAccount,
  updateAccountRemark,
} from "@/app/(app)/dashboard/actions";
import { signOut } from "@/app/actions/auth";
import { setDashboardAccount } from "@/lib/dashboard-store";

interface Account {
  id: string;
  name: string;
  display_name: string;
  content_direction: string | null;
  remark: string | null;
}

interface PremiumSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileName: string;
  profileRole: string;
  canEnterGroupMode?: boolean;
  groupModeActive?: boolean;
  accounts: Account[];
  selectedAccountId: string;
}

export interface GroupModeSettingsControlProps {
  canEnterGroupMode: boolean;
  isGroupModeActive: boolean;
  pending: boolean;
  onChange: () => void | Promise<void>;
}

export function GroupModeSettingsControl({
  canEnterGroupMode,
  isGroupModeActive,
  pending,
  onChange,
}: GroupModeSettingsControlProps) {
  return (
    <div
      data-testid="group-mode-settings-control"
      className={cn(
        "flex items-center justify-between gap-4 p-3 rounded-xl border transition-all duration-200",
        isGroupModeActive
          ? "border-[#D97757]/40 bg-[#D97757]/5"
          : "border-zinc-200 bg-zinc-50/70",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
            isGroupModeActive
              ? "bg-[#D97757]/15 text-[#D97757]"
              : "bg-zinc-100 text-[#5F82A8]",
          )}
        >
          <Building2 className="size-4 shrink-0" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="block text-[13px] font-medium text-zinc-900">
              {isGroupModeActive ? "全集团广角视野" : "公司模式"}
            </span>
            {isGroupModeActive && (
              <span className="rounded bg-[#D97757]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#D97757]">
                已开启
              </span>
            )}
          </div>
          <span className="block text-[12px] text-zinc-500 mt-0.5">
            {isGroupModeActive
              ? "当前可查看与管理全集团所有团队数据"
              : canEnterGroupMode
                ? "当前聚焦本公司数据（可一键切换为全集团视野）"
                : "当前只管理所在公司；未获集团资格"}
          </span>
        </div>
      </div>
      {canEnterGroupMode ? (
        <button
          type="button"
          onClick={onChange}
          disabled={pending}
          className={cn(
            "shrink-0 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97757]/40 disabled:cursor-not-allowed disabled:opacity-60",
            isGroupModeActive
              ? "border-[#D97757]/30 bg-white text-[#D97757] hover:bg-[#D97757]/10"
              : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100",
          )}
        >
          {pending ? "处理中" : isGroupModeActive ? "退出" : "进入"}
        </button>
      ) : (
        <span className="shrink-0 text-[12px] font-medium text-zinc-400">
          需集团资格
        </span>
      )}
    </div>
  );
}

function roleLabel(role: string) {
  if (role === "owner" || role === "company_owner") return "公司所有者";
  if (role === "admin") return "管理员";
  return "成员";
}

export function PremiumSettingsModal({
  open,
  onOpenChange,
  profileName,
  profileRole,
  canEnterGroupMode = false,
  groupModeActive = false,
  accounts,
  selectedAccountId,
}: PremiumSettingsModalProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "accounts" | "system">(
    "profile",
  );
  const [editingName, setEditingName] = useState(profileName);
  const [isPending, startTransition] = useTransition();
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isGroupModeActive, setIsGroupModeActive] = useState(groupModeActive);
  const [groupModePending, setGroupModePending] = useState(false);

  // Accounts state management inside setting
  const [newAccName, setNewAccName] = useState("");
  const [newAccRemark, setNewAccRemark] = useState("");
  const [newAccDir, setNewAccDir] = useState("");
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [accountActionPending, setAccountActionPending] = useState<
    string | null
  >(null);

  // Inline editing state for account name & remark (replacing prompt)
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<"name" | "remark" | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  // Theme or toggle state
  const [pushEnabled, setPushEnabled] = useState(true);
  const [remindHour, setRemindHour] = useState("11:15");

  useEffect(() => {
    if (!open) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusFrame = requestAnimationFrame(() =>
      closeButtonRef.current?.focus(),
    );
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open || !canEnterGroupMode) return;
    let active = true;
    void fetch("/api/group-mode/status", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (active && payload) setIsGroupModeActive(payload.active === true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [canEnterGroupMode, open]);

  if (!open) return null;

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submittedName = editingName.trim();
    if (!submittedName) {
      feedbackToast.error("显示名称不能为空");
      return;
    }
    if (submittedName.length > 20) {
      feedbackToast.error("显示名称最多 20 个字符");
      return;
    }
    if (submittedName === profileName) {
      onOpenChange(false);
      return;
    }

    startTransition(async () => {
      const result = await updateProfile(submittedName);
      if (result?.error) {
        feedbackToast.error(result.error);
      } else {
        feedbackToast.success("个人资料已更新");
        setSaveSuccess(true);
        setTimeout(() => {
          setSaveSuccess(false);
          onOpenChange(false);
        }, 1200);
      }
    });
  };

  const handleGroupModeChange = async () => {
    if (groupModePending) return;
    setGroupModePending(true);
    try {
      const response = await fetch(
        isGroupModeActive ? "/api/group-mode/exit" : "/api/group-mode/enter",
        { method: "POST" },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        feedbackToast.error(typeof payload.error === "string" ? payload.error : "集团模式切换失败");
        return;
      }
      setIsGroupModeActive(!isGroupModeActive);
      feedbackToast.success(isGroupModeActive ? "已退出集团模式" : "已进入集团模式");
      router.refresh();
    } catch {
      feedbackToast.error("集团模式切换失败");
    } finally {
      setGroupModePending(false);
    }
  };

  const handleAddAccount = () => {
    const trimmedName = newAccName.trim();
    const trimmedRemark = newAccRemark.trim();
    const trimmedDir = newAccDir.trim();
    if (!trimmedName) {
      feedbackToast.error("请填写抖音账号名称");
      return;
    }
    if (trimmedName.length > 30) {
      feedbackToast.error("抖音账号名称最多 30 个字符");
      return;
    }
    if (trimmedRemark.length > 30) {
      feedbackToast.error("账号备注名最多 30 个字符");
      return;
    }

    setAccountActionPending("add");
    startTransition(async () => {
      const result = await createAccount(
        trimmedName,
        trimmedDir || undefined,
        trimmedRemark || undefined,
      );
      setAccountActionPending(null);
      if (result?.error) {
        feedbackToast.error(result.error);
      } else {
        feedbackToast.success("账号已成功添加");
        setNewAccName("");
        setNewAccRemark("");
        setNewAccDir("");
        setIsAddingAccount(false);
      }
    });
  };

  const startEditAccountName = (acc: Account) => {
    setEditingAccountId(acc.id);
    setEditingField("name");
    setEditValue(acc.name);
  };

  const startEditAccountRemark = (acc: Account) => {
    setEditingAccountId(acc.id);
    setEditingField("remark");
    setEditValue(acc.remark || "");
  };

  const handleCancelInlineEdit = () => {
    setEditingAccountId(null);
    setEditingField(null);
    setEditValue("");
  };

  const handleSaveInlineEdit = (accountId: string) => {
    if (!editingField) return;
    const trimmed = editValue.trim();
    if (editingField === "name") {
      if (!trimmed) {
        feedbackToast.error("账号名称不能为空");
        return;
      }
      if (trimmed.length > 30) {
        feedbackToast.error("账号名称最多 30 个字符");
        return;
      }
      setAccountActionPending(accountId + "-name");
      startTransition(async () => {
        const result = await updateAccountName(accountId, trimmed);
        setAccountActionPending(null);
        if (result?.error) {
          feedbackToast.error(result.error);
        } else {
          feedbackToast.success("抖音账号名称已更新");
          setEditingAccountId(null);
          setEditingField(null);
        }
      });
    } else if (editingField === "remark") {
      if (trimmed.length > 30) {
        feedbackToast.error("账号备注名最多 30 个字符");
        return;
      }
      setAccountActionPending(accountId + "-remark");
      startTransition(async () => {
        const result = await updateAccountRemark(accountId, trimmed);
        setAccountActionPending(null);
        if (result?.error) {
          feedbackToast.error(result.error);
        } else {
          feedbackToast.success("账号备注已更新");
          setEditingAccountId(null);
          setEditingField(null);
        }
      });
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => onOpenChange(false)}
          aria-hidden="true"
          className="absolute inset-0 bg-zinc-950/60 backdrop-blur-md"
        />

        {/* Modal content */}
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="premium-settings-title"
          tabIndex={-1}
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
          className={cn(
            "relative flex h-[min(620px,calc(100dvh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl sm:h-[520px] sm:flex-row",
            "border-zinc-200",
          )}
        >
          {/* Close button */}
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="关闭设置"
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 z-10 flex size-7 items-center justify-center rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-500 hover:text-zinc-950 transition-colors"
          >
            <X className="size-4" />
          </button>

          {/* Left Sidebar Tab Navigation */}
          <div className="w-full shrink-0 border-b border-zinc-200 bg-zinc-50/70 p-3 pt-11 sm:flex sm:w-52 sm:flex-col sm:justify-between sm:border-b-0 sm:border-r sm:p-4 sm:pt-12">
            <div className="flex gap-1 overflow-x-auto sm:block sm:space-y-1">
              <h2
                id="premium-settings-title"
                className="sr-only sm:not-sr-only sm:mb-2 sm:block sm:px-3 sm:text-[12px] sm:font-medium sm:uppercase sm:tracking-wider sm:text-zinc-400"
              >
                账号与设置
              </h2>

              <button
                type="button"
                onClick={() => setActiveTab("profile")}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-all duration-150 sm:w-full",
                  activeTab === "profile"
                    ? "bg-zinc-200/80 text-zinc-900 font-semibold"
                    : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/70",
                )}
              >
                <User className="size-4 text-[#D97757]" />
                个人资料
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("accounts")}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-all duration-150 sm:w-full",
                  activeTab === "accounts"
                    ? "bg-zinc-200/80 text-zinc-900 font-semibold"
                    : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/70",
                )}
              >
                <Shield className="size-4 text-[#5F82A8]" />
                矩阵账号管理
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("system")}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-medium transition-all duration-150 sm:w-full",
                  activeTab === "system"
                    ? "bg-zinc-200/80 text-zinc-900 font-semibold"
                    : "text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100/70",
                )}
              >
                <Settings2 className="size-4 text-[#16A34A]" />
                系统参数配置
              </button>
            </div>

            <div className="mt-2 space-y-2 sm:mt-0">
              <form action={signOut} method="POST" className="px-1">
                <button
                  type="submit"
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-medium text-zinc-600 hover:text-[#DC2626] hover:bg-zinc-100 transition-all duration-150"
                >
                  <LogOut className="size-4 text-zinc-400 group-hover:text-[#DC2626]" />
                  退出当前系统
                </button>
              </form>
            </div>
          </div>

          {/* Right Main Details Content */}
          <div className="min-w-0 flex-1 overflow-y-auto p-4 pt-5 sm:p-6 sm:pt-10">
            {/* TAB 1: PROFILE */}
            {activeTab === "profile" && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-5"
              >
                <div>
                  <h3 className="text-[14px] font-semibold text-zinc-900 tracking-tight">
                    个人资料设置
                  </h3>
                  <p className="text-[12px] text-zinc-500 mt-1">
                    修改您在抖音日报平台中的显示名称。该改动将同步至视频复盘与团队日报底表。
                  </p>
                </div>

                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  {/* Name input - Flat & Minimal */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-medium text-zinc-700">
                      显示名称
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        placeholder="输入您的姓名"
                        maxLength={20}
                        className="flex-1 rounded-lg border border-zinc-300 bg-white py-1.5 px-3 text-[12px] tracking-tight text-zinc-900 outline-none transition-all duration-150 focus:border-zinc-400"
                        required
                        disabled={isPending}
                      />
                      <button
                        type="submit"
                        disabled={isPending}
                        className={cn(
                          "relative px-4 py-1.5 rounded-lg text-[12px] font-medium text-white transition-all duration-150 min-w-[80px]",
                          saveSuccess
                            ? "bg-[#16A34A]"
                            : "bg-[#D97757] hover:bg-[#C46A4D]",
                        )}
                      >
                        {isPending ? (
                          <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
                        ) : saveSuccess ? (
                          <Check className="size-4 mx-auto" />
                        ) : (
                          "保存"
                        )}
                      </button>
                    </div>
                    <div className="flex justify-between items-center text-[12px] text-zinc-400">
                      <span>支持中英文、字数不超过 20 位。</span>
                      <span>{editingName.length}/20 字符</span>
                    </div>
                  </div>

                  {/* Role indicator */}
                  <div className="space-y-1.5 pt-2">
                    <label className="text-[12px] font-medium text-zinc-700">
                      当前平台身份
                    </label>
                    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 px-3.5 py-3">
                      <div className="flex size-9 items-center justify-center rounded-xl bg-zinc-900 text-[12px] font-medium text-white shrink-0">
                        {editingName.trim().slice(0, 1).toUpperCase() || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-[12px] font-medium text-zinc-900">
                          {editingName}
                        </p>
                        <p className="text-[12px] text-zinc-500 mt-0.5 leading-none">
                          {profileRole === "owner" || profileRole === "company_owner"
                            ? "公司所有者"
                            : profileRole === "admin"
                              ? "团队管理员"
                              : "团队成员"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-[12px] font-medium text-zinc-700">
                        {roleLabel(profileRole)}
                      </span>
                    </div>
                  </div>
                </form>
              </motion.div>
            )}

            {/* TAB 2: ACCOUNTS */}
            {activeTab === "accounts" && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] font-semibold text-zinc-900 tracking-tight">
                      账号矩阵配置
                    </h3>
                    <p className="text-[12px] text-zinc-500 mt-0.5">
                      管理绑定在该平台下的抖音企业号。你可以新增、解绑或重命名账号别称。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddingAccount(!isAddingAccount)}
                    className="inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors"
                  >
                    <Plus className="size-3.5" />
                    新账号
                  </button>
                </div>

                {/* Add account form container */}
                <AnimatePresence>
                  {isAddingAccount && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 space-y-2.5"
                    >
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder="抖音账号名 (如: dydata)"
                          value={newAccName}
                          onChange={(e) => setNewAccName(e.target.value)}
                          className="rounded-lg border border-zinc-200 bg-white py-1.5 px-3 text-[12px] text-zinc-900 outline-none focus:border-zinc-300"
                        />
                        <input
                          type="text"
                          placeholder="账号备注名 (如: 探店主理人)"
                          value={newAccRemark}
                          onChange={(e) => setNewAccRemark(e.target.value)}
                          className="rounded-lg border border-zinc-200 bg-white py-1.5 px-3 text-[12px] text-zinc-900 outline-none focus:border-zinc-300"
                        />
                        <input
                          type="text"
                          placeholder="内容方向 (如: 美食探店)"
                          value={newAccDir}
                          onChange={(e) => setNewAccDir(e.target.value)}
                          className="rounded-lg border border-zinc-200 bg-white py-1.5 px-3 text-[12px] text-zinc-900 outline-none focus:border-zinc-300"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setIsAddingAccount(false)}
                          className="px-2.5 py-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-700"
                        >
                          取消
                        </button>
                        <button
                          onClick={handleAddAccount}
                          disabled={accountActionPending === "add"}
                          className="inline-flex items-center justify-center bg-zinc-900 hover:bg-zinc-950 text-white px-3 py-1 rounded-lg text-[12px] font-medium min-w-[60px]"
                        >
                          {accountActionPending === "add" ? (
                            <div className="size-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            "确认添加"
                          )}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Accounts list */}
                <div className="space-y-2">
                  {accounts.map((acc) => {
                    const isEditing = editingAccountId === acc.id;
                    const isActive = acc.id === selectedAccountId;
                    return (
                      <div
                        key={acc.id}
                        className={cn(
                          "rounded-xl border px-3.5 py-2.5 transition-colors",
                          isEditing
                            ? "border-zinc-300 bg-zinc-50/80"
                            : "border-zinc-200 bg-white hover:bg-zinc-50/60",
                        )}
                      >
                        {isEditing ? (
                          /* Inline Edit Form */
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-[12px] text-zinc-600">
                              <span className="font-medium">
                                {editingField === "name"
                                  ? "修改抖音账号名称"
                                  : "修改账号备注名"}
                              </span>
                              <span className="text-[11px] text-zinc-400">
                                按 Enter 保存，Esc 取消
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                autoFocus
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleSaveInlineEdit(acc.id);
                                  } else if (e.key === "Escape") {
                                    e.preventDefault();
                                    handleCancelInlineEdit();
                                  }
                                }}
                                placeholder={
                                  editingField === "name"
                                    ? "如: dydata"
                                    : "如: 探店主理人"
                                }
                                className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-[12px] text-zinc-900 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-200"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveInlineEdit(acc.id)}
                                disabled={accountActionPending !== null}
                                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-zinc-950 transition-colors disabled:opacity-60"
                              >
                                {accountActionPending ? "保存中..." : "保存"}
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelInlineEdit}
                                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-zinc-600 hover:bg-zinc-100 transition-colors"
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Normal Display Row */
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-medium text-zinc-900 truncate">
                                  {acc.display_name}
                                </span>
                                <span className="text-[12px] font-normal text-zinc-400 truncate">
                                  @{acc.name}
                                </span>
                              </div>
                              <span className="block text-[12px] text-zinc-500 mt-0.5 truncate">
                                方向: {acc.content_direction || "未设置内容方向"}
                              </span>
                            </div>

                            {/* Actions - Crisp, Deep, Lean (400 Weight + High Ink Contrast) */}
                            <div className="flex items-center gap-3 shrink-0">
                              {isActive ? (
                                <span className="inline-flex items-center text-[12px] font-normal bg-[#5F82A8]/10 text-[#2E557E] px-2.5 py-0.5 rounded-md">
                                  当前活跃
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDashboardAccount(acc.id);
                                  }}
                                  className="text-[12px] font-normal border border-zinc-300/80 bg-white hover:bg-zinc-50 text-zinc-800 hover:text-zinc-950 px-2.5 py-1 rounded-lg transition-colors shadow-2xs"
                                >
                                  切换为该账号
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => startEditAccountName(acc)}
                                className="text-[12px] font-normal text-zinc-700 hover:text-zinc-950 transition-colors"
                              >
                                修改账号名
                              </button>

                              <button
                                type="button"
                                onClick={() => startEditAccountRemark(acc)}
                                className="text-[12px] font-normal text-zinc-700 hover:text-zinc-950 transition-colors"
                              >
                                修改备注
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* TAB 3: SYSTEM SETTINGS */}
            {activeTab === "system" && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-5"
              >
                <div>
                  <h3 className="text-[14px] font-semibold text-zinc-900 tracking-tight">
                    系统参数配置
                  </h3>
                  <p className="text-[12px] text-zinc-500 mt-1">
                    配置日常催交、违规提醒和周月报统计参数。该改动影响所有团队内成员。
                  </p>
                </div>

                <div className="space-y-3.5">
                  <GroupModeSettingsControl
                    canEnterGroupMode={canEnterGroupMode}
                    isGroupModeActive={isGroupModeActive}
                    pending={groupModePending}
                    onChange={handleGroupModeChange}
                  />

                  {/* Combined Dynamic Reminder Card (Eliminating Dashed Borders) */}
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 space-y-3 transition-all">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <span className="text-[13px] font-medium text-zinc-900">
                          启用每日催交动态提醒
                        </span>
                        <span className="block text-[12px] text-zinc-500 mt-0.5">
                          开启后系统将定期在选定时间点推送待办事项给所有未交日报的成员。
                        </span>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={pushEnabled}
                          onChange={() => setPushEnabled(!pushEnabled)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#D97757]" />
                      </label>
                    </div>

                    {/* Integrated nested scheduling setting */}
                    {pushEnabled && (
                      <div className="border-t border-zinc-200/80 pt-3 flex items-center justify-between gap-4 animate-in fade-in duration-200">
                        <div>
                          <span className="block text-[12px] font-medium text-zinc-700">
                            提醒定时设置 (24小时制)
                          </span>
                          <span className="block text-[11px] text-zinc-400 mt-0.5">
                            将在每日 {remindHour} 准时执行推送
                          </span>
                        </div>
                        <input
                          type="time"
                          value={remindHour}
                          onChange={(e) => setRemindHour(e.target.value)}
                          className="rounded-lg border border-zinc-200 bg-white py-1 px-2.5 text-[12px] font-medium text-zinc-900 outline-none focus:border-zinc-300 shadow-2xs"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
