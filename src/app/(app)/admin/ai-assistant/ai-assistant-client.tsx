"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PanelRightOpen } from "lucide-react";
import ChatPanel from "./chat-panel";
import HistorySidebar from "./history-sidebar";

export default function AIAssistantClient() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);

  const refreshHistory = () => setRefreshKey((value) => value + 1);

  return (
    <div className="grid h-[calc(100vh-4rem)] gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 overflow-hidden">
        <ChatPanel
          onHistoryRefresh={refreshHistory}
          onOpenHistory={() => setMobileHistoryOpen(true)}
        />
      </div>
      <div className="hidden overflow-hidden rounded-3xl border border-border/60 bg-background/85 shadow-sm backdrop-blur lg:block">
        <HistorySidebar refreshKey={refreshKey} />
      </div>
      <div className="fixed right-4 top-20 z-20 lg:hidden">
        <Button size="sm" variant="outline" onClick={() => setMobileHistoryOpen(true)}>
          <PanelRightOpen className="h-4 w-4" />
          历史
        </Button>
      </div>
      <HistorySidebar
        mobile
        mobileOpen={mobileHistoryOpen}
        onMobileOpenChange={setMobileHistoryOpen}
        refreshKey={refreshKey}
      />
    </div>
  );
}
