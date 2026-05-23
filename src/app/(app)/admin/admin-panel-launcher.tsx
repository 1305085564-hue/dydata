"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  AdminSecondaryNav,
  getAdminSecondaryNavItems,
  type AdminPanelKey,
  type AdminSecondaryNavItem,
} from "@/components/admin-secondary-nav";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UserRole } from "@/types";

const loadAnalyticsPanel = () =>
  import("./analytics/analytics-modal-panel").then((module) => module.AnalyticsModalPanel);

const AnalyticsPanel = dynamic(loadAnalyticsPanel, {
  ssr: false,
  loading: () => <PanelSkeleton />,
});

const panelPreloaders: Partial<Record<Exclude<AdminPanelKey, "overview">, () => Promise<unknown>>> = {
  analytics: loadAnalyticsPanel,
};

function PanelSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-16 rounded-xl bg-zinc-100 animate-pulse" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-56 rounded-xl bg-zinc-100 animate-pulse" />
        <div className="h-56 rounded-xl bg-zinc-100 animate-pulse" />
      </div>
      <div className="h-80 rounded-xl bg-zinc-100 animate-pulse" />
    </div>
  );
}

interface AdminPanelLauncherProps {
  initialPanel: AdminPanelKey | null;
  userRole: UserRole;
  canManageAdmin: boolean;
  canManageMembers?: boolean;
  overviewContent: ReactNode;
}

function sanitizePanel(
  panel: string | null | undefined,
  items: AdminSecondaryNavItem[],
): AdminPanelKey | null {
  if (!panel) return null;
  return items.some((item) => item.panel === panel) ? (panel as AdminPanelKey) : null;
}

export function AdminPanelLauncher({
  initialPanel,
  userRole,
  canManageAdmin,
  canManageMembers,
  overviewContent,
}: AdminPanelLauncherProps) {
  const allItems = useMemo(
    () => getAdminSecondaryNavItems({ canManageAdmin, canManageMembers, userRole }),
    [canManageAdmin, canManageMembers, userRole],
  );
  const [activePanel, setActivePanel] = useState<AdminPanelKey | null>(
    sanitizePanel(initialPanel, allItems),
  );

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setActivePanel(sanitizePanel(params.get("panel"), allItems));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [allItems]);

  function updateUrl(nextPanel: AdminPanelKey | null, mode: "push" | "replace") {
    const url = new URL(window.location.href);
    if (nextPanel) {
      url.searchParams.set("panel", nextPanel);
    } else {
      url.searchParams.delete("panel");
    }
    const historyMethod = mode === "push" ? window.history.pushState : window.history.replaceState;
    historyMethod.call(window.history, {}, "", url);
  }

  function openPanel(item: AdminSecondaryNavItem) {
    if (!(item.panel in panelPreloaders)) {
      window.location.href = item.href;
      return;
    }
    setActivePanel(item.panel);
    updateUrl(item.panel, activePanel ? "replace" : "push");
  }

  function closePanel() {
    setActivePanel(null);
    updateUrl(null, "replace");
  }

  function preloadPanel(item: AdminSecondaryNavItem) {
    if (item.panel === "overview") return;
    const preloader = panelPreloaders[item.panel];
    if (preloader) void preloader();
  }

  const activeItem = allItems.find((item) => item.panel === activePanel) ?? null;

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[13px] font-medium tracking-tight text-zinc-600">日常管理</h2>
        </div>
        <AdminSecondaryNav
          pathname="/admin"
          canManageAdmin={canManageAdmin}
          canManageMembers={canManageMembers}
          userRole={userRole}
          renderMode="button"
          groupFilter="daily"
          activePanel={activePanel}
          onItemSelect={openPanel}
          onItemPreload={preloadPanel}
        />
      </div>

      <Dialog open={Boolean(activePanel)} onOpenChange={(open) => (!open ? closePanel() : null)}>
        <DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[96dvh] sm:w-[calc(100vw-24px)] sm:max-w-none sm:rounded-2xl 2xl:w-[min(100vw-32px,1880px)]">
          {activeItem ? (
            <>
              <div className="border-b border-zinc-200 bg-white px-5 py-5 sm:px-6 lg:px-7">
                <DialogHeader className="gap-3 pr-10">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <DialogTitle className="text-[18px] font-semibold tracking-tight text-zinc-800">
                        团队管理
                      </DialogTitle>
                      <DialogDescription className="max-w-3xl text-[13px] leading-[1.7] text-zinc-500">
                        在同一个工作台里切换模块，不跳页、不改顶部标题，直接处理当前团队任务。
                      </DialogDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-[10px] border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[12px] font-medium text-zinc-500">
                        当前模块：{activeItem.label}
                      </span>
                      <Link
                        href={activeItem.href}
                        className="inline-flex items-center rounded-[10px] border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-800 shadow-sm transition-[background-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] active:translate-y-0"
                      >
                        打开独立页面
                      </Link>
                    </div>
                  </div>
                </DialogHeader>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 lg:px-7">
                <div className="mx-auto w-full max-w-[1760px]">
                  <div className="mb-4 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
                    <p className="text-[13px] font-semibold text-zinc-800">{activeItem.label}</p>
                    <p className="mt-1 text-[13px] leading-[1.7] text-zinc-500">{activeItem.description}</p>
                  </div>

                  {activePanel === "overview" ? overviewContent : null}
                  {activePanel === "analytics" ? <AnalyticsPanel initialPreset="30d" /> : null}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
