"use client";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";

type DemoAccountCard = {
  id: string;
  display_name: string;
  content_direction: string | null;
  presentation_format: string | null;
};

type DemoTodayReport = {
  id: string;
  title: string;
  report_date: string;
  published_at: string;
  uploaded_at: string;
  play_count: number | null;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
  follower_gain: number;
  completion_rate: string | null;
  completion_rate_5s: string | null;
  avg_play_duration: string;
  content: string;
};

type Props = {
  accounts: DemoAccountCard[];
  reportsByAccountId: Record<string, DemoTodayReport | undefined>;
};

function formatDateTime(value: string) {
  return value.replace("T", " ").slice(0, 16);
}

function formatPlayCount(value: number | null) {
  if (!value) {
    return "-";
  }

  return value >= 10000 ? `${(value / 10000).toFixed(1)}万` : String(value);
}

export function DemoTodayReportPanel({ accounts, reportsByAccountId }: Props) {
  return (
    <div className="grid gap-3">
      {accounts.map((account, index) => {
        const report = reportsByAccountId[account.id];

        return (
          <Collapsible
            key={account.id}
            defaultOpen={index === 0}
            className="overflow-hidden rounded-2xl border border-white/70 bg-[rgba(255,255,255,0.86)] shadow-[var(--shadow-light)]"
          >
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-black/[0.02]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-[var(--color-text-primary)]">{account.display_name}</p>
                  <Badge variant="outline" className="rounded-full border-zinc-200/20 bg-zinc-100/8 text-[#6FAA7D]">
                    已预置
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                  {account.content_direction ?? "综合内容"} / {account.presentation_format ?? "标准表达"}
                </p>
                <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                  {report ? report.title : "演示日报已生成，点击可查看完整字段布局。"}
                </p>
              </div>
              <div className="shrink-0 text-xs font-medium text-[var(--color-text-secondary)]">展开明细</div>
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t border-[var(--color-border)] px-4 py-4">
              {report ? (
                <div className="grid gap-4">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      { label: "发布时间", value: formatDateTime(report.published_at) },
                      { label: "提报时间", value: formatDateTime(report.uploaded_at) },
                      { label: "播放", value: formatPlayCount(report.play_count) },
                      { label: "涨粉", value: `${report.follower_gain}` },
                      { label: "5秒完播", value: report.completion_rate_5s ?? "-" },
                      { label: "整体完播", value: report.completion_rate ?? "-" },
                      { label: "平均播放时长", value: report.avg_play_duration },
                      { label: "互动合计", value: `${report.likes + report.comments + report.shares + report.favorites}` },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl border border-[var(--color-border)] bg-white/80 px-3 py-3">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-secondary)]">{item.label}</div>
                        <div className="mt-2 text-sm font-semibold text-[var(--color-text-primary)]">{item.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-2xl border border-[var(--color-border)] bg-white/82 p-4">
                      <div className="text-sm font-semibold text-[var(--color-text-primary)]">日报文案</div>
                      <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">{report.content}</p>
                    </div>

                    <div className="rounded-2xl border border-[var(--color-border)] bg-white/82 p-4">
                      <div className="text-sm font-semibold text-[var(--color-text-primary)]">互动拆分</div>
                      <div className="mt-3 grid gap-2 text-sm text-[var(--color-text-secondary)]">
                        <div className="flex items-center justify-between gap-3">
                          <span>点赞</span>
                          <span className="font-medium text-[var(--color-text-primary)]">{report.likes}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>评论</span>
                          <span className="font-medium text-[var(--color-text-primary)]">{report.comments}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>转发</span>
                          <span className="font-medium text-[var(--color-text-primary)]">{report.shares}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>收藏</span>
                          <span className="font-medium text-[var(--color-text-primary)]">{report.favorites}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-[var(--color-text-secondary)]">暂无演示提报。</div>
              )}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
