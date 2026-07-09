"use client";

import React, { useEffect, useState } from "react";
import { ListTodo, Bell, Settings, LogOut, Zap, LayoutDashboard, Compass, BarChart3, ShieldAlert, Video, FileEdit, LineChart, Library, CalendarDays, Search } from "lucide-react";
import { useDemoState } from "./demo-context";
import { WorkspacePicker } from "./workspace-picker";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export function PremiumNavbar() {
  const {
    perspective,
    setPerspective,
    commandHubOpen,
    setCommandHubOpen,
    commandHubTab,
    setCommandHubTab,
    settingsOpen,
    setSettingsOpen,
    todos,
    notifications,
    profileName,
  } = useDemoState();

  const [isScrolled, setIsScrolled] = useState(false);
  const [activeSubItem, setActiveSubItem] = useState("dashboard");

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 15) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Compute pending todo items + unread notifications count
  const todoCount = todos.filter((t) => !t.completed).length;
  const unreadNotificationsCount = notifications.filter((n) => !n.read).length;
  const totalAlertsCount = todoCount + unreadNotificationsCount;

  // Nav Items depending on active perspective
  const userNavItems = [
    { id: "dashboard", label: "日报填报", icon: LayoutDashboard },
    { id: "growth", label: "成长分析", icon: Compass },
    { id: "analytics", label: "数据分析", icon: BarChart3 },
    { id: "violations", label: "违规话术", icon: ShieldAlert },
    { id: "video-review", label: "视频审核", icon: Video },
  ];

  const adminNavItems = [
    { id: "content", label: "批改台", icon: FileEdit },
    { id: "analytics", label: "经营分析", icon: LineChart },
    { id: "videos", label: "素材库", icon: Library },
    { id: "fulfillment", label: "发布履约", icon: CalendarDays },
  ];

  const currentNavItems = perspective === "user" ? userNavItems : adminNavItems;

  return (
    <motion.header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300 ease-in-out border-b",
        isScrolled
          ? "py-2 bg-white/75 dark:bg-stone-950/75 backdrop-blur-xl border-stone-200/60 dark:border-stone-800/50 shadow-sm"
          : "py-4 bg-transparent border-transparent"
      )}
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          
          {/* LEFT: Branding & Primary Navigation Links */}
          <div className="flex items-center gap-4 lg:gap-6 min-w-0">
            {/* Logo */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#D97757] to-[#C9503B] text-white shadow-md shadow-[#D97757]/20">
                <Zap className="size-[18px] stroke-[2] fill-current" />
              </div>
              <div className="hidden sm:block">
                <div className="text-xs font-black tracking-tight text-stone-950 dark:text-white uppercase leading-none">
                  DYData <span className="text-[#D97757] font-semibold text-[10px]">PREMIUM</span>
                </div>
                <div className="text-[9px] font-medium tracking-[0.18em] text-stone-400 dark:text-stone-500 uppercase leading-none mt-1">
                  短视频管理控制台
                </div>
              </div>
            </div>

            {/* Separator */}
            <div className="hidden lg:block h-5 w-[1px] bg-stone-200 dark:bg-stone-800" />

            {/* Primary Navigation Links */}
            <nav className="hidden lg:flex items-center gap-1" aria-label="页面主导航">
              {currentNavItems.map((item) => {
                const isActive = activeSubItem === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSubItem(item.id)}
                    className={cn(
                      "relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-all duration-200",
                      isActive
                        ? "text-stone-950 dark:text-white"
                        : "text-stone-400 hover:text-stone-700 dark:hover:text-stone-300"
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeNavBackground"
                        transition={{ type: "spring", stiffness: 300, damping: 28 }}
                        className="absolute inset-0 bg-stone-100/80 dark:bg-stone-900/60 rounded-lg"
                      />
                    )}
                    <Icon className={cn("size-3.5 stroke-[1.8] relative z-10", isActive ? "text-[#D97757]" : "")} />
                    <span className="relative z-10">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* RIGHT: Switchers / Alerts / Settings / Avatar */}
          <div className="flex items-center gap-3 shrink-0 ml-auto">
            {/* Perspective Switcher Capsule */}
            <div className="relative flex items-center bg-stone-100 dark:bg-stone-900 p-0.5 rounded-xl border border-stone-200/20 shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)]">
              {/* Sliding Pill */}
              <button
                onClick={() => {
                  setPerspective("user");
                  setActiveSubItem("dashboard");
                }}
                className={cn(
                  "relative z-10 px-3 py-1 text-[11px] font-semibold rounded-lg transition-colors duration-200",
                  perspective === "user" ? "text-stone-900 dark:text-white" : "text-stone-500 hover:text-stone-700"
                )}
              >
                {perspective === "user" && (
                  <motion.div
                    layoutId="activePerspectivePill"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    className="absolute inset-0 bg-white dark:bg-stone-800 rounded-lg shadow-sm border border-stone-200/10"
                  />
                )}
                <span className="relative z-10">员工</span>
              </button>

              <button
                onClick={() => {
                  setPerspective("admin");
                  setActiveSubItem("content");
                }}
                className={cn(
                  "relative z-10 px-3 py-1 text-[11px] font-semibold rounded-lg transition-colors duration-200",
                  perspective === "admin" ? "text-stone-900 dark:text-white" : "text-stone-500 hover:text-stone-700"
                )}
              >
                {perspective === "admin" && (
                  <motion.div
                    layoutId="activePerspectivePill"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    className="absolute inset-0 bg-white dark:bg-stone-800 rounded-lg shadow-sm border border-stone-200/10"
                  />
                )}
                <span className="relative z-10">管理</span>
              </button>
            </div>

            {/* Separator */}
            <div className="hidden md:block h-5 w-[1px] bg-stone-200 dark:bg-stone-800" />

            {/* Workspace Selector */}
            <div className="hidden md:block shrink-0">
              <WorkspacePicker />
            </div>

            {/* Separator */}
            <div className="hidden sm:block h-5 w-[1px] bg-stone-200 dark:bg-stone-800" />

            {/* Combined Alerts and Todo Bell */}
            <button
              onClick={() => {
                setCommandHubTab(todoCount > 0 ? "todos" : "notifications");
                setCommandHubOpen(true);
              }}
              className={cn(
                "relative flex h-8 w-8 items-center justify-center rounded-xl border transition-all duration-200",
                "border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-950 dark:hover:border-stone-700 dark:hover:bg-stone-900 active:scale-95"
              )}
              title="待办与通知中心"
            >
              <Bell className="size-4 stroke-[1.8] text-stone-500 dark:text-stone-400" />
              {totalAlertsCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-gradient-to-br from-[#D97757] to-[#C9503B] px-1 text-[9px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-stone-950 tabular-nums">
                  {totalAlertsCount > 99 ? "99+" : totalAlertsCount}
                </span>
              )}
            </button>

            {/* Quick settings gear */}
            <button
              onClick={() => setSettingsOpen(true)}
              className={cn(
                "relative flex h-8 w-8 items-center justify-center rounded-xl border transition-all duration-200",
                "border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-950 dark:hover:border-stone-700 dark:hover:bg-stone-900 active:scale-95"
              )}
              title="个人与账号设置"
            >
              <Settings className="size-4 stroke-[1.8] text-stone-500 dark:text-stone-400" />
            </button>

            {/* User profile capsule with custom display */}
            <div className="h-5 w-[1px] bg-stone-200 dark:bg-stone-800" />
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-2 text-left rounded-lg hover:opacity-85 focus:outline-none"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-stone-950 text-[11px] font-black text-white dark:bg-stone-800 shadow-sm border border-stone-200/10">
                {profileName.trim().slice(0, 1).toUpperCase()}
              </div>
              <div className="hidden lg:flex flex-col">
                <span className="text-[10px] font-bold text-stone-800 dark:text-stone-200 leading-tight">
                  {profileName.split(" ")[0]}
                </span>
                <span className="text-[8px] font-semibold text-stone-400 leading-none mt-0.5 tracking-wider uppercase">
                  创始人
                </span>
              </div>
            </button>
          </div>
          
        </div>
      </div>
    </motion.header>
  );
}
