"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { History, PanelLeftClose, PanelLeft } from "lucide-react";
import ChatPanel from "./chat-panel";
import HistorySidebar from "./history-sidebar";

 type Props = {
  actorRole: "admin" | "owner";
};

export default function AIAssistantClient({ actorRole }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const refreshHistory = () => setRefreshKey((value) => value + 1);

  return (
    <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden bg-[#F9F9FB]">
      {/* Left sidebar - 200px, collapsible */}
      <aside
        className={
          sidebarCollapsed
            ? "hidden lg:flex w-0 overflow-hidden border-r border-zinc-200 bg-white transition-all duration-300"
            : "hidden lg:flex w-[200px] shrink-0 flex-col border-r border-zinc-200 bg-white transition-all duration-300"
        }
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <History className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              操作历史
            </span>
          </div>
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
            title="收起侧边栏"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <HistorySidebar actorRole={actorRole} refreshKey={refreshKey} />
        </div>
      </aside>

      {/* Collapsed sidebar trigger */}
      {sidebarCollapsed && (
        <div className="hidden lg:flex flex-col items-center border-r border-zinc-200 bg-white py-3 px-1">
          <button
            onClick={() => setSidebarCollapsed(false)}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
            title="展开侧边栏"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex min-w-0 flex-1 flex-col bg-white">
        <ChatPanel
          actorRole={actorRole}
          onHistoryRefresh={refreshHistory}
          onOpenHistory={() => setMobileHistoryOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
        />
      </div>

      {/* Mobile Drawer */}
      <HistorySidebar
        actorRole={actorRole}
        mobile
        mobileOpen={mobileHistoryOpen}
        onMobileOpenChange={setMobileHistoryOpen}
        refreshKey={refreshKey}
      />
    </div>
  );
}
