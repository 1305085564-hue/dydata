"use client";

import React, { useState, useTransition } from "react";
import { X, User, Shield, Sparkles, Check, Plus, Settings2, Trash2, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { updateProfile, updateAccountName, createAccount, updateAccountRemark } from "@/app/(app)/dashboard/actions";
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
  accounts: Account[];
  selectedAccountId: string;
}

function roleLabel(role: string) {
  if (role === "owner") return "创始人";
  if (role === "admin") return "管理员";
  return "成员";
}

export function PremiumSettingsModal({
  open,
  onOpenChange,
  profileName,
  profileRole,
  accounts,
  selectedAccountId,
}: PremiumSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"profile" | "accounts" | "system">("profile");
  const [editingName, setEditingName] = useState(profileName);
  const [isPending, startTransition] = useTransition();
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Accounts state management inside setting
  const [newAccName, setNewAccName] = useState("");
  const [newAccRemark, setNewAccRemark] = useState("");
  const [newAccDir, setNewAccDir] = useState("");
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [accountActionPending, setAccountActionPending] = useState<string | null>(null);

  // Theme or toggle state
  const [pushEnabled, setPushEnabled] = useState(true);
  const [remindHour, setRemindHour] = useState("11:15");

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
      const result = await createAccount(trimmedName, trimmedDir || undefined, trimmedRemark || undefined);
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

  const handleRenameAccount = (accountId: string, currentAccountName: string) => {
    const newName = prompt("请输入新的抖音账号名称(英文/数字/中文，建议与抖音一致):", currentAccountName);
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed) {
      feedbackToast.error("账号名称不能为空");
      return;
    }
    if (trimmed.length > 30) {
      feedbackToast.error("账号名称最多 30 个字符");
      return;
    }
    if (trimmed === currentAccountName) return;

    setAccountActionPending(accountId + "-name");
    startTransition(async () => {
      const result = await updateAccountName(accountId, trimmed);
      setAccountActionPending(null);
      if (result?.error) {
        feedbackToast.error(result.error);
      } else {
        feedbackToast.success("抖音账号名称已更新");
      }
    });
  };

  const handleEditAccountRemark = (accountId: string, currentRemark: string) => {
    const newRemark = prompt("请输入新的账号备注名 (如: 探店主理人):", currentRemark);
    if (newRemark === null) return;
    const trimmed = newRemark.trim();
    if (trimmed === currentRemark) return;

    setAccountActionPending(accountId + "-remark");
    startTransition(async () => {
      const result = await updateAccountRemark(accountId, trimmed);
      setAccountActionPending(null);
      if (result?.error) {
        feedbackToast.error(result.error);
      } else {
        feedbackToast.success("账号备注已更新");
      }
    });
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
          className="absolute inset-0 bg-stone-950/60 backdrop-blur-md"
        />

        {/* Modal content */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 15 }}
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
          className={cn(
            "relative flex h-[520px] w-full max-w-3xl overflow-hidden rounded-2xl border bg-white shadow-2xl",
            "border-stone-300 dark:border-stone-800 dark:bg-stone-950"
          )}
        >
          {/* Close button */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute right-4 top-4 z-10 flex size-7 items-center justify-center rounded-lg border border-stone-200 hover:bg-stone-200 dark:border-stone-800 dark:hover:bg-stone-800 text-stone-500 dark:text-stone-600 hover:text-stone-700 dark:hover:text-white transition-colors"
          >
            <X className="size-4" />
          </button>

          {/* Left Sidebar Tab Navigation */}
          <div className="w-52 shrink-0 border-r border-stone-300/60 dark:border-stone-800/80 bg-stone-100/50 dark:bg-stone-900/20 p-4 pt-12 flex flex-col justify-between">
            <div className="space-y-1">
              <div className="text-[9px] font-black uppercase tracking-wider text-stone-500 dark:text-stone-600 px-3 mb-2">
                账号与设置
              </div>
              
              <button
                onClick={() => setActiveTab("profile")}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-all duration-200",
                  activeTab === "profile"
                    ? "bg-stone-200 text-stone-900 dark:bg-stone-900 dark:text-white"
                    : "text-stone-600 hover:text-stone-800 dark:hover:text-stone-300"
                )}
              >
                <User className="size-4 text-[#D97757]" />
                个人资料
              </button>

              <button
                onClick={() => setActiveTab("accounts")}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-all duration-200",
                  activeTab === "accounts"
                    ? "bg-stone-200 text-stone-900 dark:bg-stone-900 dark:text-white"
                    : "text-stone-600 hover:text-stone-800 dark:hover:text-stone-300"
                )}
              >
                <Shield className="size-4 text-sky-500" />
                矩阵账号管理
              </button>

              <button
                onClick={() => setActiveTab("system")}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-all duration-200",
                  activeTab === "system"
                    ? "bg-stone-200 text-stone-900 dark:bg-stone-900 dark:text-white"
                    : "text-stone-600 hover:text-stone-800 dark:hover:text-stone-300"
                )}
              >
                <Settings2 className="size-4 text-emerald-500" />
                系统参数配置
              </button>
            </div>
            
            <div className="space-y-3">
              <form action={signOut} method="POST" className="px-1">
                <button
                  type="submit"
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all duration-200"
                >
                  <LogOut className="size-4 text-rose-500" />
                  退出当前系统
                </button>
              </form>
              <div className="text-[10px] text-stone-500 dark:text-stone-600 px-3">
                DYData v2.1 • 企业授权
              </div>
            </div>
          </div>

          {/* Right Main Details Content */}
          <div className="flex-1 p-6 pt-12 overflow-y-auto">
            
            {/* TAB 1: PROFILE */}
            {activeTab === "profile" && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6"
              >
                <div>
                  <h3 className="text-sm font-bold text-stone-900 dark:text-white tracking-tight">
                    个人资料设置
                  </h3>
                  <p className="text-[10px] text-stone-500 dark:text-stone-600 mt-0.5">
                    修改您在抖音日报平台中的显示名称。该改动将同步至批改台与团队日报底表。
                  </p>
                </div>

                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  {/* Name input */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-stone-700 dark:text-stone-300">
                      显示名称
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        placeholder="输入您的姓名"
                        maxLength={20}
                        className={cn(
                          "flex-1 rounded-lg border py-1.5 px-3 text-xs tracking-tight outline-none transition-all duration-200",
                          "border-stone-300 bg-white focus:border-stone-400 focus:ring-0",
                          "dark:border-stone-800 dark:bg-stone-900 dark:focus:border-stone-600"
                        )}
                        required
                        disabled={isPending}
                      />
                      <button
                        type="submit"
                        disabled={isPending}
                        className={cn(
                          "relative px-4 py-1.5 rounded-lg text-xs font-bold text-white transition-all duration-200 min-w-[80px]",
                          saveSuccess
                            ? "bg-emerald-500"
                            : "bg-[#D97757] hover:bg-[#C96442]"
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
                    <div className="flex justify-between items-center text-[10px] text-stone-500">
                      <span>支持中英文、字数不超过 20 位。</span>
                      <span>{editingName.length}/20 字符</span>
                    </div>
                  </div>

                  {/* Role indicator */}
                  <div className="space-y-1.5 pt-2">
                    <label className="text-[11px] font-bold text-stone-700 dark:text-stone-300">
                      当前平台身份
                    </label>
                    <div className="flex items-center gap-3 rounded-xl border border-stone-300/80 dark:border-stone-800 bg-stone-100/50 dark:bg-stone-900/20 px-3.5 py-3">
                      <div className="flex size-9 items-center justify-center rounded-xl bg-stone-900 dark:bg-stone-800 text-xs font-black text-white">
                        {editingName.trim().slice(0, 1).toUpperCase() || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-xs font-bold text-stone-800 dark:text-stone-100">
                          {editingName}
                        </p>
                        <p className="text-[10px] text-stone-500 dark:text-stone-600 mt-0.5 leading-none">
                          主系统所有者 (Platform Owner)
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-[#D97757]/30 bg-[#D97757]/5 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#D97757]">
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
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-stone-900 dark:text-white tracking-tight">
                      账号矩阵配置
                    </h3>
                    <p className="text-[10px] text-stone-500 dark:text-stone-600 mt-0.5">
                      管理绑定在该平台下的抖音企业号。你可以新增、解绑或重命名账号别称。
                    </p>
                  </div>
                  <button
                    onClick={() => setIsAddingAccount(!isAddingAccount)}
                    className="inline-flex items-center gap-1 bg-stone-200 dark:bg-stone-900 hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors"
                  >
                    <Plus className="size-3" />
                    添加新账号
                  </button>
                </div>

                {/* Add account form container */}
                <AnimatePresence>
                  {isAddingAccount && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden rounded-xl border border-stone-300 dark:border-stone-800 bg-stone-100/30 dark:bg-stone-900/10 p-3 space-y-2.5"
                    >
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder="抖音账号名 (如: dydata)"
                          value={newAccName}
                          onChange={(e) => setNewAccName(e.target.value)}
                          className="rounded-lg border py-1.5 px-3 text-[11px] outline-none dark:border-stone-800 dark:bg-stone-900"
                        />
                        <input
                          type="text"
                          placeholder="账号备注名 (如: 探店主理人)"
                          value={newAccRemark}
                          onChange={(e) => setNewAccRemark(e.target.value)}
                          className="rounded-lg border py-1.5 px-3 text-[11px] outline-none dark:border-stone-800 dark:bg-stone-900"
                        />
                        <input
                          type="text"
                          placeholder="内容方向 (如: 美食探店)"
                          value={newAccDir}
                          onChange={(e) => setNewAccDir(e.target.value)}
                          className="rounded-lg border py-1.5 px-3 text-[11px] outline-none dark:border-stone-800 dark:bg-stone-900"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setIsAddingAccount(false)}
                          className="px-2.5 py-1 text-[10px] font-bold text-stone-500 hover:text-stone-600"
                        >
                          取消
                        </button>
                        <button
                          onClick={handleAddAccount}
                          disabled={accountActionPending === "add"}
                          className="inline-flex items-center justify-center bg-stone-900 hover:bg-stone-950 dark:bg-stone-800 dark:hover:bg-stone-700 text-white px-3 py-1 rounded-lg text-[10px] font-bold min-w-[60px]"
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
                <div className="space-y-1.5">
                  {accounts.map((acc) => {
                    const isRenamePending = accountActionPending === acc.id + "-name";
                    const isRemarkPending = accountActionPending === acc.id + "-remark";
                    const isActive = acc.id === selectedAccountId;
                    return (
                      <div
                        key={acc.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-stone-300/70 dark:border-stone-800/80 px-3.5 py-2.5 hover:bg-stone-200/50 dark:hover:bg-stone-900/10"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-stone-900 dark:text-stone-50 truncate">
                              {acc.display_name}
                            </span>
                            <span className="text-[9px] font-semibold text-stone-500 truncate">
                              @{acc.name}
                            </span>
                          </div>
                          <span className="block text-[10px] text-stone-500 dark:text-stone-600 mt-0.5 truncate">
                            方向: {acc.content_direction || "未设置内容方向"}
                          </span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3 shrink-0">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-extrabold bg-[#D97757]/10 text-[#D97757] dark:bg-[#D97757]/20 px-2.5 py-1 rounded-lg">
                              当前活跃
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setDashboardAccount(acc.id);
                              }}
                              className="text-[9px] font-bold border border-stone-300 dark:border-stone-800 hover:bg-stone-200 dark:hover:bg-stone-900 px-2.5 py-1 rounded-lg transition-colors"
                            >
                              切换为该账号
                            </button>
                          )}
                          
                          <button
                            type="button"
                            onClick={() => handleRenameAccount(acc.id, acc.name)}
                            disabled={isRenamePending}
                            className="text-[10px] font-bold text-[#D97757] hover:opacity-85"
                          >
                            {isRenamePending ? "正在重命名..." : "修改账号名"}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleEditAccountRemark(acc.id, acc.remark || "")}
                            disabled={isRemarkPending}
                            className="text-[10px] font-bold text-stone-600 hover:text-stone-900"
                          >
                            {isRemarkPending ? "正在保存..." : "修改备注"}
                          </button>
                        </div>
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
                className="space-y-6"
              >
                <div>
                  <h3 className="text-sm font-bold text-stone-900 dark:text-white tracking-tight">
                    系统参数配置
                  </h3>
                  <p className="text-[10px] text-stone-500 dark:text-stone-600 mt-0.5">
                    配置日常催交、违规提醒和周月报统计参数。该改动影响所有团队内成员。
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Cron Remind Setting */}
                  <div className="flex items-center justify-between gap-4 p-3 rounded-xl border border-stone-300/80 dark:border-stone-800 bg-stone-100/50 dark:bg-stone-900/20">
                    <div>
                      <span className="text-xs font-bold text-stone-800 dark:text-stone-200">
                        启用每日催交动态提醒
                      </span>
                      <span className="block text-[9px] text-stone-500 dark:text-stone-600 mt-0.5">
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
                      <div className="w-9 h-5 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:bg-stone-800 peer-checked:bg-[#D97757]" />
                    </label>
                  </div>

                  {/* Scheduled cron input */}
                  {pushEnabled && (
                    <div className="space-y-1.5 p-3 rounded-xl border border-dashed border-stone-300 dark:border-stone-800">
                      <label className="text-[10px] font-bold text-stone-700 dark:text-stone-300">
                        提醒定时设置 (24小时制)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="time"
                          value={remindHour}
                          onChange={(e) => setRemindHour(e.target.value)}
                          className={cn(
                            "rounded-lg border py-1 px-2.5 text-xs outline-none dark:border-stone-800 dark:bg-stone-900 dark:text-white"
                          )}
                        />
                        <span className="text-[10px] text-stone-500 flex items-center">
                          配置与系统 Cron 进程对齐，将在每日 {remindHour} 准时执行。
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Global configuration status */}
                  <div className="p-3.5 rounded-xl bg-gradient-to-r from-stone-50 to-stone-100/50 dark:from-stone-900 dark:to-stone-900/60 border border-stone-300/50 dark:border-stone-800 text-[10px] text-stone-600 dark:text-stone-500 leading-relaxed">
                    ⚙️ <span className="font-bold text-stone-700 dark:text-stone-300">主库参数：</span>
                    当前连接 Supabase Singapore 实例，服务状态正常。所有 API 接口已自动检测环境变量 `SUPABASE_SERVICE_ROLE_KEY` 并适配权限。
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
