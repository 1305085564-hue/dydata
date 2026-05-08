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
const loadModulesPanel = () =>
  import("./modules/modules-modal-panel").then((module) => module.ModulesModalPanel);
const loadAiChannelsPanel = () =>
  import("./ai-channels/ai-channels-client").then((module) => module.default);
const loadAiRewritePanel = () =>
  import("./ai-rewrite/ai-rewrite-client").then((module) => module.default);

const AnalyticsPanel = dynamic(loadAnalyticsPanel, {
  ssr: false,
  loading: () => <PanelSkeleton />,
});
const ModulesPanel = dynamic(loadModulesPanel, {
  ssr: false,
  loading: () => <PanelSkeleton />,
});
const AiChannelsPanel = dynamic(loadAiChannelsPanel, {
  ssr: false,
  loading: () => <PanelSkeleton />,
});
const AiRewritePanel = dynamic(loadAiRewritePanel, {
  ssr: false,
  loading: () => <PanelSkeleton />,
});

const panelPreloaders: Record<Exclude<AdminPanelKey, "overview">, () => Promise<unknown>> = {
  analytics: loadAnalyticsPanel,
  modules: loadModulesPanel,
  "ai-channels": loadAiChannelsPanel,
  "ai-rewrite": loadAiRewritePanel,
};

function PanelSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-16 animate-pulse rounded-[20px] bg-slate-100/80" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-56 animate-pulse rounded-[24px] bg-slate-100/80" />
        <div className="h-56 animate-pulse rounded-[24px] bg-slate-100/80" />
      </div>
      <div className="h-80 animate-pulse rounded-[28px] bg-slate-100/80" />
    </div>
  );
}

interface AdminPanelLauncherProps {
  initialPanel: AdminPanelKey | null;
  userRole: UserRole;
  canManageAdmin: boolean;
  initialDate: string;
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
  initialDate,
  overviewContent,
}: AdminPanelLauncherProps) {
  const items = useMemo(
    () => getAdminSecondaryNavItems({ canManageAdmin, userRole }),
    [canManageAdmin, userRole],
  );
  const [activePanel, setActivePanel] = useState<AdminPanelKey | null>(
    sanitizePanel(initialPanel, items),
  );

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setActivePanel(sanitizePanel(params.get("panel"), items));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [items]);

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
    setActivePanel(item.panel);
    updateUrl(item.panel, activePanel ? "replace" : "push");
  }

  function closePanel() {
    setActivePanel(null);
    updateUrl(null, "replace");
  }

  function preloadPanel(item: AdminSecondaryNavItem) {
    if (item.panel === "overview") return;
    void panelPreloaders[item.panel]();
  }

  const activeItem = items.find((item) => item.panel === activePanel) ?? null;

  return (
    <>
      <AdminSecondaryNav
        pathname="/admin"
        canManageAdmin={canManageAdmin}
        userRole={userRole}
        renderMode="button"
        activePanel={activePanel}
        onItemSelect={openPanel}
        onItemPreload={preloadPanel}
      />

      <Dialog open={Boolean(activePanel)} onOpenChange={(open) => (!open ? closePanel() : null)}>
        <DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[96dvh] sm:w-[calc(100vw-24px)] sm:max-w-none sm:rounded-[var(--radius-dialog)] 2xl:w-[min(100vw-32px,1880px)]">
          {activeItem ? (
            <>
              <div className="border-b border-[var(--color-border)]/50 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(245,248,255,0.95))] px-5 py-5 sm:px-6 lg:px-7">
                <DialogHeader className="gap-3 pr-10">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <DialogTitle className="text-2xl font-semibold tracking-[-0.03em] text-[var(--color-text-primary)]">
                        管理员中控台
                      </DialogTitle>
                      <DialogDescription className="max-w-3xl text-sm leading-6 text-[var(--color-text-secondary)]">
                        在同一个工作台里切换模块，不跳页、不改顶部标题，直接处理当前后台任务。
                      </DialogDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-primary/15 bg-primary/8 px-3 py-1.5 text-xs font-medium text-primary">
                        当前模块：{activeItem.label}
                      </span>
                      <Link
                        href={activeItem.href}
                        className="inline-flex items-center rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-[var(--color-text-primary)] shadow-[var(--shadow-light)]"
                      >
                        打开独立页面
                      </Link>
                    </div>
                  </div>
                </DialogHeader>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6 lg:px-7">
                <div className="mx-auto w-full max-w-[1760px]">
                  <div className="mb-4 rounded-[22px] border border-white/80 bg-white/86 px-4 py-3 shadow-[var(--shadow-light)]">
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">{activeItem.label}</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-text-secondary)]">{activeItem.description}</p>
                  </div>

                  {activePanel === "overview" ? overviewContent : null}
                  {activePanel === "analytics" ? <AnalyticsPanel initialPreset="30d" /> : null}
                  {activePanel === "modules" ? <ModulesPanel initialDate={initialDate} /> : null}
                  {activePanel === "ai-channels" ? <AiChannelsPanel /> : null}
                  {activePanel === "ai-rewrite" ? <AiRewritePanel /> : null}
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
