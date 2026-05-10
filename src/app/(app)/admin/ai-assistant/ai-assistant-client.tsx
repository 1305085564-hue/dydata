"use client";

import { useState } from "react";
import { PanelLeftClose, PanelLeft, Plus } from "lucide-react";
import ChatPanel from "./chat-panel";
import HistorySidebar from "./history-sidebar";
import { cn } from "@/lib/utils";

type Props = {
  actorRole: "admin" | "owner";
};

export default function AIAssistantClient({ actorRole }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [sessionKey, setSessionKey] = useState(0);

  const refreshHistory = () => setRefreshKey((v) => v + 1);
  const startNewSession = () => setSessionKey((v) => v + 1);

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#F9F9FB]">
      {/* Top bar */}
      <header className="relative z-10 flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 bg-[#F9F9FB] px-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="hidden lg:inline-flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
            title={historyOpen ? "收起历史" : "展开历史"}
          >
            {historyOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeft className="h-3.5 w-3.5" />}
          </button>
          <div className="flex items-center gap-2 px-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#6FAA7D] opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#6FAA7D]" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              AI Workstation
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={startNewSession}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 shadow-[0_1px_0_rgba(0,0,0,0.02)] transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:border-zinc-300 hover:text-zinc-800 hover:shadow-sm active:translate-y-0"
            title="开启新对话"
          >
            <Plus className="h-3 w-3" />
            <span className="tracking-wide">新对话</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: History */}
        <aside
          className={cn(
            "relative hidden shrink-0 flex-col border-r border-zinc-200 bg-[#F9F9FB] transition-[width] duration-300 ease-out lg:flex",
            historyOpen ? "w-[200px]" : "w-0 overflow-hidden"
          )}
        >
          <HistorySidebar actorRole={actorRole} refreshKey={refreshKey} />
        </aside>

        {/* Center: Chat */}
        <main className="relative flex min-w-0 flex-1 flex-col bg-[#FAFAFB]">
          <ChatPanel
            key={sessionKey}
            actorRole={actorRole}
            onHistoryRefresh={refreshHistory}
            onOpenHistory={() => setMobileHistoryOpen(true)}
          />
        </main>


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
