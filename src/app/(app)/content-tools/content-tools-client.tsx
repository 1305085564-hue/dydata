"use client";

import { useMemo, useState } from "react";
import { Lightbulb, LibraryBig, Clock3 } from "lucide-react";

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
}

export function ContentToolsClient({ accounts }: ContentToolsClientProps) {
  const [tab, setTab] = useState<TabKey>("topic");

  const currentTab = useMemo(() => TABS.find((item) => item.key === tab) ?? TABS[0], [tab]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-2 sm:px-6 lg:px-8">
      <section className="glass-card-static overflow-hidden p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
              3F 内容生产辅助
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">内容工具台</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                基于近期爆款、标签分布、热点板块和发布时间数据，给出更直接的内容生产建议。
              </p>
            </div>
          </div>
          <div className="rounded-3xl border border-border/60 bg-background/70 p-1 ring-1 ring-foreground/8 backdrop-blur">
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
                      "flex min-w-[92px] flex-col items-center gap-1 rounded-[20px] px-4 py-3 text-center text-xs transition-all sm:min-w-[132px]",
                      active
                        ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/8"
                        : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="font-medium">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-border/60 bg-background/80 p-5 shadow-sm ring-1 ring-foreground/5 backdrop-blur-xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4 border-b border-border/60 pb-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{currentTab.label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{currentTab.description}</p>
          </div>
          <div className="hidden rounded-2xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground md:block">
            账号数 {accounts.length}
          </div>
        </div>

        <div className="space-y-4">
          {tab === "topic" ? <TopicSuggest accounts={accounts} /> : null}
          {tab === "template" ? <TemplateLibrary accounts={accounts} /> : null}
          {tab === "publish" ? <PublishRecommend accounts={accounts} /> : null}
        </div>
      </section>
    </div>
  );
}
