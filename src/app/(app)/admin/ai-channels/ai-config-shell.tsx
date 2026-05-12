"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquareText, Settings2 } from "lucide-react";

import { cn } from "@/lib/utils";

import AIChannelsClient from "./ai-channels-client";
import AIRewriteClient from "../ai-rewrite/ai-rewrite-client";

export type AIConfigTabKey = "channels" | "rewrite";

const TABS: Array<{ key: AIConfigTabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "channels", label: "渠道与功能", icon: Settings2 },
  { key: "rewrite", label: "文案改写", icon: MessageSquareText },
];

function TabNav({
  active,
  onChange,
}: {
  active: AIConfigTabKey;
  onChange: (key: AIConfigTabKey) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-[12px] transition-colors",
              isActive
                ? "bg-white text-zinc-800 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700",
            )}
          >
            <Icon className="size-3.5 stroke-[1.5]" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function normalizeTab(value: string | null): AIConfigTabKey {
  return value === "rewrite" ? "rewrite" : "channels";
}

export function AIConfigShell({ initialTab }: { initialTab: AIConfigTabKey }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlTab = normalizeTab(searchParams.get("tab"));
  const [tab, setTab] = useState<AIConfigTabKey>(initialTab ?? urlTab);

  useEffect(() => {
    if (urlTab !== tab) setTab(urlTab);
  }, [urlTab, tab]);

  const handleChange = (next: AIConfigTabKey) => {
    if (next === tab) return;
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "channels") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    router.replace(qs ? `/admin/ai-channels?${qs}` : "/admin/ai-channels");
  };

  return (
    <div className="space-y-4">
      <TabNav active={tab} onChange={handleChange} />
      <div className="min-h-[320px]">
        {tab === "channels" ? <AIChannelsClient /> : <AIRewriteClient embedded />}
      </div>
    </div>
  );
}
