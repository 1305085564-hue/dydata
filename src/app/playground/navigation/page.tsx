"use client";

import React from "react";
import { DemoProvider, useDemoState } from "./components/demo-context";
import { PremiumNavbar } from "./components/premium-navbar";
import { UnifiedCommandHub } from "./components/unified-command-hub";
import { PremiumSettingsModal } from "./components/premium-settings-modal";
import { cn } from "@/lib/utils";
import { Zap, Play, ArrowRight, TrendingUp, HelpCircle, CheckCircle2, ShieldAlert, FileWarning, Sparkles, MessageCircleCode, ListTodo, Bell } from "lucide-react";
import { motion } from "framer-motion";

function DemoDashboard() {
  const {
    perspective,
    selectedAccount,
    todos,
    toggleTodo,
    notifications,
    setCommandHubOpen,
    setCommandHubTab,
  } = useDemoState();

  const activeTodos = todos.filter((t) => !t.completed);
  const unreadNotifications = notifications.filter((n) => !n.read);

  // Quick action: manually trigger a critical alert in the state to demo animations
  const triggerDemoAlert = () => {
    // In our context, this can be triggered by calling setNotifications or we can just mock it.
    // Let's add action buttons to let users trigger modal/drawer directly.
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-stone-950 text-stone-900 dark:text-stone-100 selection:bg-[#D97757]/20 transition-colors duration-300">
      
      {/* Navbar */}
      <PremiumNavbar />

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 pt-28 pb-20 sm:px-6 lg:px-8">
        
        {/* Top Hero Banner */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8 p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/60 dark:border-stone-800 shadow-sm"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#D97757] uppercase tracking-wider">
                <Sparkles className="size-3.5" />
                高保真交互式原型沙盒
              </div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-stone-900 dark:text-white mt-1">
                独立前端主架构展示：顶栏与智能工作区
              </h1>
              <p className="text-[11px] text-stone-400 dark:text-stone-500 mt-0.5 leading-relaxed">
                本页面用于演示全新设计的工业级导航模块、全局视角切换、以及整合了代办与通知的<b>智能工作中心 (Command Hub)</b>。
              </p>
            </div>
            
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[10px] font-bold text-stone-400">当前模拟账号状态:</span>
              <div className="flex items-center gap-2 bg-stone-50 dark:bg-stone-950 border px-3 py-1.5 rounded-xl border-stone-200/80 dark:border-stone-800">
                <span className={cn(
                  "size-2 rounded-full",
                  selectedAccount?.status === "active" ? "bg-emerald-500" :
                  selectedAccount?.status === "warning" ? "bg-amber-500" : "bg-rose-500"
                )} />
                <span className="text-xs font-bold">{selectedAccount?.display_name}</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEFT COLUMN: Main simulated dashboard workspace (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Live Perspective Content View */}
            <motion.div
              key={perspective}
              initial={{ opacity: 0, scale: 0.99 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/60 dark:border-stone-800 shadow-sm"
            >
              {perspective === "user" ? (
                // USER PERSPECTIVE
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b pb-4 border-stone-100 dark:border-stone-800">
                    <div>
                      <h2 className="text-sm font-black text-stone-900 dark:text-white uppercase tracking-tight">
                        员工工作台 • 日报快速填报
                      </h2>
                      <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5">
                        日常工作数据与合规问题记录平台。
                      </p>
                    </div>
                    <span className="rounded-full bg-stone-100 dark:bg-stone-800 px-3 py-1 text-[10px] font-bold text-stone-600 dark:text-stone-400">
                      正常班次
                    </span>
                  </div>

                  {/* Form Simulator */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-stone-500 dark:text-stone-400">填报账号</label>
                        <div className="p-2.5 rounded-lg border bg-stone-50/50 dark:bg-stone-950/20 text-xs font-semibold border-stone-200 dark:border-stone-800">
                          {selectedAccount?.display_name} (@{selectedAccount?.name})
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-stone-500 dark:text-stone-400">昨日视频播放量 (估计值)</label>
                        <input
                          type="text"
                          placeholder="例如: 125,400"
                          className="w-full rounded-lg border p-2 text-xs outline-none dark:border-stone-800 dark:bg-stone-950"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-stone-500 dark:text-stone-400">主要违规话术与卡点记录</label>
                      <textarea
                        rows={3}
                        placeholder="请输入昨日发布视频中出现的违规提醒或词汇限流反馈..."
                        className="w-full rounded-lg border p-2.5 text-xs outline-none resize-none dark:border-stone-800 dark:bg-stone-950"
                      />
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <span className="text-[10px] text-stone-400 flex items-center gap-1">
                        <CheckCircle2 className="size-3 text-emerald-500" />
                        草稿每隔 30 秒已自动保存
                      </span>
                      <button className="bg-gradient-to-r from-[#D97757] to-[#C9503B] hover:opacity-90 text-white font-bold text-xs py-2 px-5 rounded-lg shadow-sm">
                        提交日报
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                // ADMIN PERSPECTIVE
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b pb-4 border-stone-100 dark:border-stone-800">
                    <div>
                      <h2 className="text-sm font-black text-stone-900 dark:text-white uppercase tracking-tight">
                        管理者控制中心 • 批改台
                      </h2>
                      <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5">
                        全局异常内容复核与反馈下发面板。
                      </p>
                    </div>
                    <span className="rounded-full bg-rose-50 border border-rose-250 dark:bg-rose-950/20 px-3 py-1 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                      待处理卡点
                    </span>
                  </div>

                  {/* Summary grid */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl border border-stone-200 bg-stone-50/30 dark:border-stone-800 dark:bg-stone-900/10">
                      <div className="text-[10px] font-bold text-stone-400">今日待审核</div>
                      <div className="text-lg font-black text-stone-800 dark:text-white mt-1">4 个视频</div>
                    </div>
                    <div className="p-3 rounded-xl border border-stone-200 bg-stone-50/30 dark:border-stone-800 dark:bg-stone-900/10">
                      <div className="text-[10px] font-bold text-[#D97757]">未读违规警告</div>
                      <div className="text-lg font-black text-stone-800 dark:text-white mt-1">{unreadNotifications.length} 条</div>
                    </div>
                    <div className="p-3 rounded-xl border border-stone-200 bg-stone-50/30 dark:border-stone-800 dark:bg-stone-900/10">
                      <div className="text-[10px] font-bold text-stone-400">矩阵整体健康度</div>
                      <div className="text-lg font-black text-emerald-500 mt-1">89%</div>
                    </div>
                  </div>

                  {/* Quick Queue preview */}
                  <div className="space-y-2">
                    <div className="text-[10px] font-bold text-stone-400 dark:text-stone-500">待办批改队列 ({activeTodos.length})</div>
                    <div className="space-y-1.5">
                      {activeTodos.map((todo) => (
                        <div
                          key={todo.id}
                          className="flex items-center justify-between border rounded-xl p-3 bg-stone-50/30 dark:bg-stone-900/10 border-stone-200 dark:border-stone-800 hover:border-stone-300"
                        >
                          <div className="min-w-0">
                            <span className="block truncate text-[11px] font-bold text-stone-900 dark:text-stone-100">
                              {todo.title}
                            </span>
                            <span className="text-[9px] text-stone-400 mt-0.5 block">
                              截止时间: {todo.dueDate}
                            </span>
                          </div>
                          <button
                            onClick={() => toggleTodo(todo.id)}
                            className="bg-white hover:bg-stone-100 dark:bg-stone-800 dark:hover:bg-stone-700 border text-stone-700 dark:text-stone-200 font-semibold px-2.5 py-1 rounded-lg text-[10px]"
                          >
                            标记完成
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>

            {/* Premium details block (clutter free) */}
            <div className="p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/60 dark:border-stone-800 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-stone-400 uppercase tracking-widest">
                工业级交互交互反馈指南 (Interaction Guidelines)
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
                <div className="space-y-2">
                  <p className="font-bold text-stone-800 dark:text-stone-200">✨ 弹性视口收缩 (Scroll Shrink)</p>
                  <p className="text-[11px]">滚动页面内容查看顶部导航栏的收缩效果。导航栏会从大间距优雅地演变为毛玻璃（Backdrop-blur）超窄浮动条，最大程度释放主要工作区的空间。</p>
                </div>
                <div className="space-y-2">
                  <p className="font-bold text-stone-800 dark:text-stone-200">⚡ 共享布局动效 (Perspective Switch)</p>
                  <p className="text-[11px]">点击顶栏的「员工端 / 管理端」进行无感知的视角切换。底部的滑块带有弹簧物理惯性（Spring physics），没有任何生硬的跳转卡顿。</p>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Demo Controls & Live Activity (1/3 width) */}
          <div className="space-y-6">
            
            {/* Dynamic triggers for demoing sidebar alerts */}
            <div className="p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/60 dark:border-stone-800 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-stone-900 dark:text-white uppercase tracking-tight">
                原型交互控制面板
              </h3>
              <p className="text-[11px] text-stone-400 dark:text-stone-500">
                点击下方按钮可在顶栏的通知图标上动态生成状态，从而随时唤起抽屉测试其手势和折叠效果。
              </p>

              <div className="space-y-2 pt-2">
                <button
                  onClick={() => {
                    setCommandHubTab("todos");
                    setCommandHubOpen(true);
                  }}
                  className="w-full inline-flex items-center justify-between bg-stone-950 hover:bg-stone-800 text-white font-bold py-2 px-3.5 rounded-xl text-xs transition-colors duration-200"
                >
                  <span>打开今日待办 drawer</span>
                  <ListTodo className="size-3.5" />
                </button>

                <button
                  onClick={() => {
                    setCommandHubTab("notifications");
                    setCommandHubOpen(true);
                  }}
                  className="w-full inline-flex items-center justify-between border hover:bg-stone-50 dark:hover:bg-stone-900 font-bold py-2 px-3.5 rounded-xl text-xs transition-colors duration-200"
                >
                  <span>打开通知动态 panel</span>
                  <Bell className="size-3.5 text-[#D97757]" />
                </button>
              </div>
            </div>

            {/* Workspace Health Indicator */}
            <div className="p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200/60 dark:border-stone-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                  矩阵安全健康检查
                </span>
                <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
              </div>

              <div className="flex items-center gap-4">
                <div className="text-3xl font-black text-stone-900 dark:text-white">
                  92 <span className="text-xs font-normal text-stone-400">/ 100</span>
                </div>
                <div className="text-[10px] text-stone-400 dark:text-stone-500 leading-normal">
                  <span className="font-semibold text-emerald-500">良好。</span> 
                  本月仅触发 2 个短视频限流警告，全域转化链路正常。
                </div>
              </div>

              {/* Progress visual bar */}
              <div className="h-1.5 w-full rounded-full bg-stone-100 dark:bg-stone-800 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#D97757] to-emerald-500" style={{ width: "92%" }} />
              </div>
            </div>

          </div>

        </div>

      </main>

      {/* Unified drawers/modals */}
      <UnifiedCommandHub />
      <PremiumSettingsModal />
    </div>
  );
}

export default function PremiumNavigationDemoPage() {
  return (
    <DemoProvider>
      <DemoDashboard />
    </DemoProvider>
  );
}
