"use client";

import React, { useRef, useEffect } from "react";
import { X, CheckCircle2, Circle, AlertCircle, Bell, ArrowRight, Trash2, CalendarDays, Inbox } from "lucide-react";
import { useDemoState } from "./demo-context";
import { PremiumTodo, PremiumNotification } from "./mock-data";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

export function UnifiedCommandHub() {
  const {
    commandHubOpen,
    setCommandHubOpen,
    commandHubTab,
    setCommandHubTab,
    todos,
    toggleTodo,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
  } = useDemoState();

  const drawerRef = useRef<HTMLDivElement>(null);

  // Close drawer on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && commandHubOpen) {
        setCommandHubOpen(false);
      }
    };
    if (commandHubOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [commandHubOpen, setCommandHubOpen]);

  // Click outside to close
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
      setCommandHubOpen(false);
    }
  };

  const activeTodos = todos.filter((t) => !t.completed);
  const completedTodos = todos.filter((t) => t.completed);
  
  const getSeverityBadge = (severity: PremiumTodo["severity"]) => {
    switch (severity) {
      case "critical":
        return "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border-rose-200/50 dark:border-rose-900/30";
      case "warning":
        return "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200/50 dark:border-amber-900/30";
      case "info":
        return "bg-stone-50 text-stone-700 dark:bg-stone-900 dark:text-stone-500 border-stone-200 dark:border-stone-800";
      default:
        return "bg-stone-50 text-stone-700";
    }
  };

  return (
    <AnimatePresence>
      {commandHubOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop Blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleOverlayClick}
            className="absolute inset-0 bg-stone-950/40 dark:bg-stone-950/60 backdrop-blur-sm"
          />

          {/* Drawer Sidebar */}
          <motion.div
            ref={drawerRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className={cn(
              "relative flex h-full w-full max-w-[460px] flex-col border-l bg-stone-50 dark:bg-stone-950 shadow-xl",
              "border-stone-200 dark:border-stone-800"
            )}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b bg-white dark:bg-stone-900 px-5 py-4 border-stone-200 dark:border-stone-800">
              <div>
                <div className="text-[12px] font-medium tracking-widest text-[#D97757] uppercase">
                  Command Hub
                </div>
                <h2 className="text-[13px] font-medium text-stone-900 dark:text-white tracking-tight mt-0.5">
                  智能工作中心
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {commandHubTab === "notifications" && notifications.some((n) => !n.read) && (
                  <button
                    onClick={markAllNotificationsRead}
                    className="text-[12px] font-medium text-stone-500 hover:text-stone-900 dark:text-stone-500 dark:hover:text-white px-2 py-1 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                  >
                    全部已读
                  </button>
                )}
                <button
                  onClick={() => setCommandHubOpen(false)}
                  className="flex size-7 items-center justify-center rounded-lg border border-stone-200 dark:border-stone-800 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-500 dark:text-stone-500 hover:text-stone-900 dark:hover:text-white transition-all duration-200"
                >
                  <X className="size-4 stroke-[1.8]" />
                </button>
              </div>
            </div>

            {/* Tab switch navigation */}
            <div className="flex shrink-0 border-b border-stone-200 dark:border-stone-800 px-5 bg-white dark:bg-stone-900">
              <button
                onClick={() => setCommandHubTab("todos")}
                className={cn(
                  "relative py-3 text-[12px] font-medium transition-colors duration-200 mr-6",
                  commandHubTab === "todos" ? "text-stone-900 dark:text-white" : "text-stone-500 hover:text-stone-700"
                )}
              >
                今日待办
                {activeTodos.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-[#D97757]/10 dark:bg-[#D97757]/20 text-[#D97757] px-1.5 py-0.5 text-[12px] font-medium">
                    {activeTodos.length}
                  </span>
                )}
                {commandHubTab === "todos" && (
                  <motion.div
                    layoutId="commandHubActiveTabIndicator"
                    className="absolute bottom-0 inset-x-0 h-0.5 bg-[#D97757]"
                  />
                )}
              </button>

              <button
                onClick={() => setCommandHubTab("notifications")}
                className={cn(
                  "relative py-3 text-[12px] font-medium transition-colors duration-200",
                  commandHubTab === "notifications" ? "text-stone-900 dark:text-white" : "text-stone-500 hover:text-stone-700"
                )}
              >
                系统动态
                {notifications.filter((n) => !n.read).length > 0 && (
                  <span className="ml-1.5 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 text-[12px] font-medium">
                    {notifications.filter((n) => !n.read).length}
                  </span>
                )}
                {commandHubTab === "notifications" && (
                  <motion.div
                    layoutId="commandHubActiveTabIndicator"
                    className="absolute bottom-0 inset-x-0 h-0.5 bg-[#D97757]"
                  />
                )}
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              
              {/* TODOS TAB */}
              {commandHubTab === "todos" && (
                <div className="space-y-4">
                  {/* Active Todos List */}
                  {activeTodos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="flex size-12 items-center justify-center rounded-2xl bg-stone-100 dark:bg-stone-900 text-stone-500 dark:text-[#E7E5E4] mb-3 shadow-inner">
                        <CheckCircle2 className="size-6 text-emerald-500" />
                      </div>
                      <h3 className="text-[12px] font-medium text-stone-900 dark:text-[#FAFAF9]">
                        今日待办已全部完成
                      </h3>
                      <p className="text-[12px] text-stone-500 dark:text-stone-500 mt-1 max-w-[200px] leading-relaxed">
                        团队目前没有未处理的违规审核或履约卡点，状态良好。
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-[12px] font-medium text-stone-500 dark:text-stone-500 mb-1">
                        进行中 ({activeTodos.length})
                      </div>
                      <AnimatePresence initial={false}>
                        {activeTodos.map((todo) => (
                          <motion.div
                            key={todo.id}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -50, height: 0, marginBottom: 0 }}
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                            className={cn(
                              "group flex items-start gap-3 rounded-xl border p-3.5 bg-white dark:bg-stone-900 transition-colors",
                              "border-stone-200/80 dark:border-stone-800"
                            )}
                          >
                            <button
                              onClick={() => toggleTodo(todo.id)}
                              className="mt-0.5 text-stone-500 hover:text-[#D97757] transition-colors shrink-0 outline-none"
                            >
                              <Circle className="size-4" />
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className={cn(
                                  "inline-flex border px-1.5 py-0.5 rounded text-[12px] font-medium uppercase tracking-wider",
                                  getSeverityBadge(todo.severity)
                                )}>
                                  {todo.severity === "critical" ? "P0 急需" : todo.severity === "warning" ? "P1 高优" : "P2 常规"}
                                </span>
                                <span className="text-[12px] text-stone-500 dark:text-stone-500 flex items-center gap-1">
                                  <CalendarDays className="size-2.5" />
                                  {todo.dueDate}
                                </span>
                              </div>
                              <h4 className="text-[12px] font-medium text-stone-900 dark:text-stone-50 leading-tight mt-1.5">
                                {todo.title}
                              </h4>
                              <p className="text-[12px] text-stone-500 dark:text-stone-500 leading-normal mt-1">
                                {todo.description}
                              </p>
                              
                              <div className="mt-2.5 flex items-center justify-end">
                                <button className="inline-flex items-center gap-1 text-[12px] font-medium text-[#D97757] hover:opacity-85 transition-opacity">
                                  立即批改
                                  <ArrowRight className="size-3" />
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Completed List (if any) */}
                  {completedTodos.length > 0 && (
                    <div className="pt-2 border-t border-stone-200/50 dark:border-stone-800/50">
                      <div className="text-[12px] font-medium text-stone-500 dark:text-stone-500 mb-2">
                        已完成 ({completedTodos.length})
                      </div>
                      <div className="space-y-1.5 opacity-60">
                        {completedTodos.map((todo) => (
                          <div
                            key={todo.id}
                            className="flex items-center gap-3 rounded-lg border border-dashed border-stone-200 dark:border-stone-800 p-2.5 bg-stone-100/50 dark:bg-stone-900/30"
                          >
                            <button
                              onClick={() => toggleTodo(todo.id)}
                              className="text-emerald-500 shrink-0"
                            >
                              <CheckCircle2 className="size-4 fill-emerald-500 text-white" />
                            </button>
                            <span className="text-[12px] font-medium text-stone-500 dark:text-stone-500 line-through truncate flex-1">
                              {todo.title}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* NOTIFICATIONS TAB */}
              {commandHubTab === "notifications" && (
                <div className="space-y-4">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="flex size-12 items-center justify-center rounded-2xl bg-stone-100 dark:bg-stone-900 text-stone-500 dark:text-[#E7E5E4] mb-3 shadow-inner">
                        <Inbox className="size-6 text-stone-500" />
                      </div>
                      <h3 className="text-[12px] font-medium text-stone-900 dark:text-[#FAFAF9]">
                        目前没有任何动态
                      </h3>
                      <p className="text-[12px] text-stone-500 dark:text-stone-500 mt-1 max-w-[200px] leading-relaxed">
                        当系统有新的合规提示、账号限流预警或发布情况时，将在此汇总。
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <AnimatePresence initial={false}>
                        {notifications.map((notif) => (
                          <motion.div
                            key={notif.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, x: 50, height: 0, marginBottom: 0 }}
                            transition={{ type: "spring", stiffness: 450, damping: 28 }}
                            className={cn(
                              "relative rounded-xl border p-3.5 bg-white dark:bg-stone-900 transition-colors",
                              notif.read ? "border-stone-200/50 dark:border-stone-800/50 opacity-70" : "border-stone-200 dark:border-stone-700/80"
                            )}
                          >
                            <div className="flex items-start gap-2.5">
                              {/* Read Status Dot */}
                              {!notif.read && (
                                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#D97757]" />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className={cn(
                                    "text-[12px] font-medium uppercase px-1 rounded-sm",
                                    notif.severity === "critical" ? "text-rose-600 bg-rose-50 dark:bg-rose-950/20" :
                                    notif.severity === "warning" ? "text-amber-600 bg-amber-50 dark:bg-amber-950/20" :
                                    notif.severity === "success" ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20" :
                                    "text-stone-500 bg-stone-100"
                                  )}>
                                    {notif.severity === "critical" ? "违规警告" : notif.severity === "warning" ? "批改意见" : "动态"}
                                  </span>
                                  <span className="text-[12px] text-stone-500 dark:text-stone-500">{notif.created_at}</span>
                                </div>
                                <h4 className={cn(
                                  "text-[12px] leading-snug mt-1.5",
                                  notif.read ? "font-medium text-stone-700 dark:text-stone-500" : "font-medium text-stone-900 dark:text-stone-50"
                                )}>
                                  {notif.title}
                                </h4>
                                {notif.body && (
                                  <p className="text-[12px] text-stone-500 dark:text-stone-500 leading-normal mt-1">
                                    {notif.body}
                                  </p>
                                )}

                                {/* Interactive Actions */}
                                <div className="mt-2.5 flex items-center justify-between border-t border-stone-100 dark:border-stone-800/60 pt-2">
                                  {!notif.read ? (
                                    <button
                                      onClick={() => markNotificationRead(notif.id)}
                                      className="text-[12px] font-medium text-[#D97757] hover:opacity-80 transition-opacity"
                                    >
                                      标为已读
                                    </button>
                                  ) : (
                                    <span className="text-[12px] font-medium text-stone-500">已处理</span>
                                  )}
                                  <button
                                    onClick={() => deleteNotification(notif.id)}
                                    className="text-stone-500 hover:text-rose-500 transition-colors"
                                    title="删除动态"
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer summary */}
            <div className="shrink-0 border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 text-center text-[12px] text-stone-500 dark:text-stone-500">
              <span className="font-medium">DYData Premium Console</span> • 所有待处理项目将同步同步至移动钉群
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
