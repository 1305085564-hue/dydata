"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquareText, Settings2 } from "lucide-react";

import { cn } from "@/lib/utils";

import AIChannelsClient from "./ai-channels-client";
import AIRewriteClient from "../ai-rewrite/ai-rewrite-client";

export type AIConfigTabKey = "channels" | "rewrite";

type OverviewCounts = {
  channels: number;
  channelsEnabled: number;
  features: number;
  featuresEnabled: number;
  rewriteTotal: number;
};

const TABS: Array<{ key: AIConfigTabKey; label: string; hint: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: "channels", label: "渠道与功能", hint: "渠道池 + 功能绑定 + 系统提示词", icon: Settings2 },
  { key: "rewrite", label: "文案改写", hint: "固定套餐 / 展示模型 / 真实路线", icon: MessageSquareText },
];

function useOverview() {
  const [data, setData] = useState<OverviewCounts | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/ai-unified/overview", { credentials: "include" });
        if (!res.ok) return;
        const json = (await res.json()) as {
          channels: Array<{ is_enabled?: boolean }>;
          features: Array<{ is_enabled?: boolean }>;
          rewrite?: {
            modes?: unknown[];
            fixed_modes?: unknown[];
            length_presets?: unknown[];
            workflows?: unknown[];
            model_views?: unknown[];
          };
        };
        if (!active) return;
        const rewriteTotal =
          (json.rewrite?.modes?.length ?? 0) +
          (json.rewrite?.fixed_modes?.length ?? 0) +
          (json.rewrite?.length_presets?.length ?? 0) +
          (json.rewrite?.workflows?.length ?? 0);
        setData({
          channels: json.channels?.length ?? 0,
          channelsEnabled: (json.channels ?? []).filter((c) => c.is_enabled !== false).length,
          features: json.features?.length ?? 0,
          featuresEnabled: (json.features ?? []).filter((f) => f.is_enabled !== false).length,
          rewriteTotal,
        });
      } catch {}
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);
  return data;
}

function StatusStrip({ counts }: { counts: OverviewCounts | null }) {
  const items = useMemo(
    () => [
      {
        label: "渠道",
        value: counts?.channels ?? "—",
        sub: counts ? `已启用 ${counts.channelsEnabled}` : "",
      },
      {
        label: "功能绑定",
        value: counts?.features ?? "—",
        sub: counts ? `生效 ${counts.featuresEnabled}` : "",
      },
      {
        label: "改写配置",
        value: counts?.rewriteTotal ?? "—",
        sub: "套餐 / 模式 / 预设 / 流程",
      },
    ],
    [counts],
  );

  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-y border-zinc-100 py-3">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">{item.label}</span>
          <span className="text-[18px] font-semibold tabular-nums tracking-tight text-zinc-800">{item.value}</span>
          {item.sub ? <span className="text-[12px] text-zinc-400">{item.sub}</span> : null}
        </div>
      ))}
    </div>
  );
}

function TabNav({
  active,
  onChange,
}: {
  active: AIConfigTabKey;
  onChange: (key: AIConfigTabKey) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] tracking-tight transition-colors",
              isActive ? "bg-white text-zinc-800 shadow-sm" : "text-zinc-500 hover:text-zinc-700",
            )}
          >
            <Icon className="size-4 stroke-[1.5]" />
            <span>{tab.label}</span>
            <span className="hidden text-[11px] text-zinc-400 md:inline">· {tab.hint}</span>
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
  const counts = useOverview();

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
    <div className="space-y-5">
      <StatusStrip counts={counts} />
      <TabNav active={tab} onChange={handleChange} />
      <div className="min-h-[320px]">
        {tab === "channels" ? <AIChannelsClient /> : <AIRewriteClient embedded />}
      </div>
    </div>
  );
}
