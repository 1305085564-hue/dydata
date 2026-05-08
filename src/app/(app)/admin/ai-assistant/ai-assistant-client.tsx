"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TerminalSquare, History } from "lucide-react";
import ChatPanel from "./chat-panel";
import HistorySidebar from "./history-sidebar";

type Props = {
  actorRole: "admin" | "owner";
};

export default function AIAssistantClient({ actorRole }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);

  const refreshHistory = () => setRefreshKey((value) => value + 1);

  return (
    <div className="grid h-[calc(100vh-6rem)] gap-4 lg:grid-cols-[20rem_minmax(0,1fr)] text-sm antialiased">
      {/* Sidebar - Moved to Left for a classic terminal/IDE layout */}
      <div className="hidden overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-sm lg:flex lg:flex-col relative">
        <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
          <History className="h-4 w-4 text-zinc-400" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">历史记录</h2>
        </div>
        <HistorySidebar actorRole={actorRole} refreshKey={refreshKey} />
      </div>

      {/* Main Terminal Window */}
      <div className="min-w-0 overflow-hidden flex flex-col rounded-[2rem] border border-zinc-200 bg-white shadow-sm relative">
         {/* Terminal Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2 bg-zinc-50">
           <div className="flex items-center gap-3">
             <div className="flex gap-1.5">
               <div className="h-2.5 w-2.5 rounded-full bg-zinc-200"></div>
               <div className="h-2.5 w-2.5 rounded-full bg-zinc-200"></div>
               <div className="h-2.5 w-2.5 rounded-full bg-zinc-200"></div>
             </div>
             <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
               <TerminalSquare className="h-3.5 w-3.5" />
               AI助手
             </span>
           </div>

           {/* Mobile trigger */}
           <div className="lg:hidden">
              <Button size="sm" variant="ghost" className="h-6 px-2 text-zinc-500 hover:text-zinc-950" onClick={() => setMobileHistoryOpen(true)}>
                <History className="h-3 w-3 mr-1.5" />
                日志
              </Button>
           </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-hidden relative">

           <ChatPanel
             actorRole={actorRole}
             onHistoryRefresh={refreshHistory}
             onOpenHistory={() => setMobileHistoryOpen(true)}
           />
        </div>
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
