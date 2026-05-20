"use client";

import { useMemo, useState } from "react";
import { Lightbulb, LibraryBig, Clock3 } from "lucide-react";
import { AppShell, AppShellHero, AppShellMetricStrip, AppShellSection } from "@/components/app-shell";
import { cn } from "@/lib/utils";
import { TopicSuggest } from "./topic-suggest";
import { TemplateLibrary } from "./template-library";
import { PublishRecommend } from "./publish-recommend";
import type { ContentToolAccount } from "./types";

type TabKey = "topic" | "template" | "publish";

const TABS: Array<{ key: TabKey; label: string; icon: typeof Lightbulb; description: string }> = [
  { key: "topic", label: "选题建议", icon: Lightbulb, description: "结合爆款样本和市场热点生成下一批选题。" },
  { key: "template", label: "模板库", icon: LibraryBig, description: "从爆款样本提炼高复用的文案结构。" },
  { key: "publish", label: "发布时间", icon: Clock3, description: "按账号和题材推荐历史最优发布时段。" },
];

interface ContentToolsClientProps {
  accounts: ContentToolAccount[];
  summary: {
    accountCount: number;
    directionCount: number;
  };
}

export function ContentToolsClient({ accounts, summary }: ContentToolsClientProps) {
  const [tab, setTab] = useState<TabKey>("topic");
  const currentTab = useMemo(() => TABS.find((item) => item.key === tab) ?? TABS[0], [tab]);

  return (
    <AppShell width="wide" className="pb-8">
      <AppShellHero
        eyebrow="3F 内容生产辅助"
        title="内容工具台"
        description="基于近期爆款、标签分布、热点板块和发布时间数据，给出更直接的内容生产建议。"
        actions={
          <div className="rounded-2xl border border-zinc-200 bg-white p-1 ring-1 ring-zinc-950/5">
            <div className="grid grid-cols-3 gap-1">
              {TABS.map((item) => {
                const Icon = item.icon;
                const active = item.key === tab;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setTab(item.key)}
                    className={cn(
                      "flex min-w-[92px] flex-col items-center gap-1 rounded-[10px] px-4 py-3 text-center text-xs transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] sm:min-w-[132px]",
                      active
                        ? "bg-zinc-50 text-zinc-800 shadow-sm ring-1 ring-zinc-950/5"
                        : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        }
      >
        <AppShellMetricStrip
          columns={3}
          items={[
            { label: "接入账号", value: `${summary.accountCount} 个`, hint: "当前可分析账号", tone: "primary" },
            { label: "内容方向", value: `${summary.directionCount} 类`, hint: "已识别方向数", tone: "neutral" },
            { label: "当前工具", value: currentTab.label, hint: currentTab.description, tone: "success" },
          ]}
        />
      </AppShellHero>

      <AppShellSection
        eyebrow="工具工作区"
        title={currentTab.label}
        description={currentTab.description}
        meta={<div className="glass-chip hidden md:inline-flex">账号数 {accounts.length}</div>}
      >
        <div className="space-y-4">
          {tab === "topic" ? <TopicSuggest accounts={accounts} /> : null}
          {tab === "template" ? <TemplateLibrary accounts={accounts} /> : null}
          {tab === "publish" ? <PublishRecommend accounts={accounts} /> : null}
        </div>
      </AppShellSection>
    </AppShell>
  );
}
