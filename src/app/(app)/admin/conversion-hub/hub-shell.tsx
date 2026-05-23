"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ClipboardList,
  FileX2,
  FilePlus2,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { AdminWorkspaceLayout } from "@/components/admin-workspace-layout";
import { cn } from "@/lib/utils";

import type { InboxBucketEntry, InboxCounts, InboxData, ScriptsTabData, ScriptsTopRow } from "./data";

export type HubTabKey = "inbox" | "scripts" | "violations" | "weekly" | "analytics" | "advice";

export interface HubShellProps {
  weekStart: string;
  inbox: InboxData;
  inboxCounts: InboxCounts;
  scripts: ScriptsTabData | null;
  basePath?: string;
  layoutVariant?: "page" | "embedded";
  eyebrow?: string;
  title?: string;
  description?: string;
}

const RISK_TONE: Record<string, string> = {
  high: "text-[#C9604D] bg-[#C9604D]/10",
  medium: "text-[#D99E55] bg-[#D99E55]/10",
  low: "text-[#6FAA7D] bg-[#6FAA7D]/10",
};

const RISK_LABEL: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const MISSING_LABEL: Record<string, string> = {
  screenshot: "截图",
  scene_description: "场景描述",
};

function formatTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatNumber(value: number | null | undefined) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatRate(rate: number | null | undefined) {
  if (rate == null) return "—";
  return `${(Number(rate) * 100).toFixed(1)}%`;
}

interface KpiTile {
  key: string;
  label: string;
  hint: string;
  count: number;
  tone: "warm" | "danger" | "positive" | "neutral";
  icon: React.ComponentType<{ className?: string }>;
}

function KpiCard({ tile }: { tile: KpiTile }) {
  const accent =
    tile.tone === "danger"
      ? { bar: "bg-[#C9604D]", iconBg: "bg-[#C9604D]/10 text-[#C9604D]", text: "text-[#9A4836]" }
      : tile.tone === "positive"
        ? { bar: "bg-[#6FAA7D]", iconBg: "bg-[#6FAA7D]/10 text-[#6FAA7D]", text: "text-[#3F6F4F]" }
        : tile.tone === "warm"
          ? { bar: "bg-[#D97757]", iconBg: "bg-[#D97757]/10 text-[#D97757]", text: "text-[#A85638]" }
          : { bar: "bg-zinc-300", iconBg: "bg-zinc-100 text-zinc-500", text: "text-zinc-700" };
  const Icon = tile.icon;
  return (
    <div className="relative flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
      <span className={cn("absolute inset-y-0 left-0 w-[2px] rounded-r-full", accent.bar)} aria-hidden />
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", accent.iconBg)}>
        <Icon className="size-4 stroke-[1.5]" />
      </span>
      <div className="leading-tight">
        <p className="text-[12px] font-medium text-zinc-500">{tile.label}</p>
        <p className={cn("mt-0.5 text-[24px] font-semibold tabular-nums", accent.text)}>{tile.count}</p>
        <p className="text-[12px] text-zinc-400">{tile.hint}</p>
      </div>
    </div>
  );
}

function ScriptItemRow({ entry, suffix }: { entry: InboxBucketEntry; suffix?: React.ReactNode }) {
  return (
    <Link
      href={`/violations/${entry.id}`}
      className="active:translate-y-0 group flex items-start gap-3 rounded-xl border border-transparent px-2.5 py-2 transition-colors hover:border-zinc-200 hover:bg-zinc-50"
    >
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-[13px] font-medium text-zinc-800">{entry.script_text}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-zinc-500">
          <span>{entry.submitted_by_name}</span>
          <span className="text-zinc-300">·</span>
          <span>{formatTime(entry.created_at)}</span>
          {entry.risk_level && entry.risk_level !== "low" ? (
            <>
              <span className="text-zinc-300">·</span>
              <span className={cn("rounded-full px-1.5 py-0.5 text-[12px] font-semibold", RISK_TONE[entry.risk_level] ?? "")}>
                {RISK_LABEL[entry.risk_level] ?? entry.risk_level}风险
              </span>
            </>
          ) : null}
          {suffix}
        </div>
      </div>
      <ArrowRight className="size-3.5 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-700" />
    </Link>
  );
}

function CollapsibleSection({
  title,
  hint,
  count,
  tone,
  icon: Icon,
  entries,
  renderItem,
  emptyHint,
  defaultOpen = true,
}: {
  title: string;
  hint: string;
  count: number;
  tone: "warm" | "danger" | "positive" | "neutral";
  icon: React.ComponentType<{ className?: string }>;
  entries: InboxBucketEntry[];
  renderItem: (entry: InboxBucketEntry) => React.ReactNode;
  emptyHint: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(false);
  const accent =
    tone === "danger"
      ? { bar: "bg-[#C9604D]", iconBg: "bg-[#C9604D]/10 text-[#C9604D]" }
      : tone === "positive"
        ? { bar: "bg-[#6FAA7D]", iconBg: "bg-[#6FAA7D]/10 text-[#6FAA7D]" }
        : tone === "warm"
          ? { bar: "bg-[#D97757]", iconBg: "bg-[#D97757]/10 text-[#D97757]" }
          : { bar: "bg-zinc-300", iconBg: "bg-zinc-100 text-zinc-500" };
  const visible = expanded ? entries : entries.slice(0, 5);
  const hasMore = entries.length > 5;

  return (
    <section className="relative rounded-2xl border border-zinc-200 bg-white">
      <span className={cn("absolute inset-y-0 left-0 w-[2px] rounded-r-full", accent.bar)} aria-hidden />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl", accent.iconBg)}>
            <Icon className="size-4 stroke-[1.5]" />
          </span>
          <div className="leading-tight">
            <p className="text-[14px] font-semibold text-zinc-800">
              {title}
              <span className="ml-2 font-mono text-[12px] tabular-nums text-zinc-400">{count}</span>
            </p>
            <p className="text-[12px] text-zinc-500">{hint}</p>
          </div>
        </div>
        <ChevronDown
          className={cn("size-4 stroke-[1.5] text-zinc-400 transition-transform", open ? "" : "-rotate-90")}
        />
      </button>
      {open ? (
        <div className="border-t border-zinc-100 px-3 py-3">
          {entries.length === 0 ? (
            <p className="px-2 py-3 text-[12px] text-zinc-400">{emptyHint}</p>
          ) : (
            <div className="space-y-1">
              {visible.map((entry) => renderItem(entry))}
              {hasMore ? (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-1 inline-flex items-center gap-1 px-2 text-[12px] font-medium text-zinc-500 transition-colors hover:text-zinc-800"
                >
                  {expanded ? "收起" : `展开剩余 ${entries.length - 5} 条`}
                  <ArrowRight className="size-3 stroke-[1.5]" />
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

function ScriptsAssetSummary({ scripts }: { scripts: ScriptsTabData }) {
  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 border-l-2 border-[#D97757] pl-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-zinc-800">话术资产</h2>
          <span className="text-[12px] text-zinc-500">展示/涨粉/转化由员工填报后自动汇总</span>
        </div>
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ScriptKpi label="入库案例" value={scripts.totalCases} />
        <ScriptKpi label="转化话术" value={scripts.conversionCases} />
        <ScriptKpi label="累计使用" value={formatNumber(scripts.usageCount)} />
        <ScriptKpi label="本周新记录" value={scripts.weeklyNewUsageRecords} />
      </div>

      <div className="space-y-2">
        <header className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-zinc-800">
            TOP 转化话术
            <span className="ml-2 text-[12px] font-normal text-zinc-500">加权转化率，使用 ≥3 且展示 ≥1k</span>
          </h3>
        </header>
        {scripts.topScripts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/60 py-8 text-center text-[12px] text-zinc-400">
            暂无符合阈值的话术数据
          </div>
        ) : (
          <div className="space-y-1">
            {scripts.topScripts.slice(0, 10).map((row, idx) => (
              <TopScriptRow key={row.id} row={row} rank={idx} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function TopScriptRow({ row, rank }: { row: ScriptsTopRow; rank: number }) {
  const medal = rank === 0 ? "🥇" : rank === 1 ? "🥈" : rank === 2 ? "🥉" : null;
  return (
    <Link
      href={`/violations/${row.id}`}
      className="active:translate-y-0 group flex items-start gap-2 rounded-xl border border-transparent px-2 py-2 transition-colors hover:border-zinc-200 hover:bg-zinc-50"
    >
      <span className="mt-0.5 w-6 shrink-0 text-center text-[12px] font-medium text-zinc-400">
        {medal ?? `#${rank + 1}`}
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-1 text-[13px] leading-snug text-zinc-800">{row.script_text}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-zinc-500">
          <span>展示 {formatNumber(row.total_views)}</span>
          <span>涨粉 {formatNumber(row.total_follows)}</span>
          <span>使用 {row.usage_count ?? 0}</span>
          <span className="font-medium text-[#6FAA7D]">转化率 {formatRate(row.weighted_conversion_rate)}</span>
        </div>
      </div>
    </Link>
  );
}

function ScriptKpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50/50 px-3 py-3">
      <p className="text-[12px] font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-[18px] font-semibold tabular-nums text-zinc-800">{value}</p>
    </div>
  );
}

export function ConversionHubShell(props: HubShellProps) {
  const { inbox, inboxCounts, scripts } = props;
  const layoutVariant = props.layoutVariant ?? "page";

  const tiles: KpiTile[] = [
    {
      key: "pending",
      label: "待审核",
      hint: "员工提交，等你判断能否使用",
      count: inboxCounts.pending_review,
      tone: "warm",
      icon: ClipboardList,
    },
    {
      key: "high",
      label: "高风险待确认",
      hint: "标了高风险，优先处理避免误用",
      count: inboxCounts.high_risk_pending,
      tone: "danger",
      icon: AlertTriangle,
    },
    {
      key: "missing",
      label: "缺数据",
      hint: "缺截图/场景描述，无法判断",
      count: inboxCounts.missing_data,
      tone: "neutral",
      icon: FileX2,
    },
    {
      key: "promote",
      label: "推广候选",
      hint: "样本足够、转化亮眼，可置顶推荐",
      count: inboxCounts.promotion_candidates,
      tone: "positive",
      icon: Sparkles,
    },
  ];

  const content = (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <KpiCard key={tile.key} tile={tile} />
        ))}
      </section>

      <CollapsibleSection
        title="高风险待确认"
        hint="先处理掉，避免团队误用"
        count={inboxCounts.high_risk_pending}
        tone="danger"
        icon={AlertTriangle}
        entries={inbox.high_risk_pending}
        emptyHint="目前没有高风险案例待处理"
        renderItem={(entry) => <ScriptItemRow key={entry.id} entry={entry} />}
      />

      <CollapsibleSection
        title="待审核"
        hint="员工新提交的案例，过一遍决定是否纳入"
        count={inboxCounts.pending_review}
        tone="warm"
        icon={ClipboardList}
        entries={inbox.pending_review}
        emptyHint="目前没有待审核的提交"
        renderItem={(entry) => <ScriptItemRow key={entry.id} entry={entry} />}
      />

      <CollapsibleSection
        title="缺数据"
        hint="缺截图或场景描述，先催员工补"
        count={inboxCounts.missing_data}
        tone="neutral"
        icon={FileX2}
        entries={inbox.missing_data}
        emptyHint="所有提交资料齐全"
        defaultOpen={false}
        renderItem={(entry) => (
          <ScriptItemRow
            key={entry.id}
            entry={entry}
            suffix={
              entry.missing_fields && entry.missing_fields.length > 0 ? (
                <>
                  <span className="text-zinc-300">·</span>
                  <span className="text-[12px] text-zinc-400">
                    缺 {entry.missing_fields.map((field) => MISSING_LABEL[field] ?? field).join(" / ")}
                  </span>
                </>
              ) : null
            }
          />
        )}
      />

      <CollapsibleSection
        title="推广候选"
        hint="转化数据稳定，决定要不要置顶"
        count={inboxCounts.promotion_candidates}
        tone="positive"
        icon={Sparkles}
        entries={inbox.promotion_candidates}
        emptyHint="暂无推广候选话术"
        defaultOpen={false}
        renderItem={(entry) => (
          <ScriptItemRow
            key={entry.id}
            entry={entry}
            suffix={
              <>
                <span className="text-zinc-300">·</span>
                <span className="text-[12px] text-zinc-500">展示 {formatNumber(entry.total_views)}</span>
                <span className="font-medium text-[#6FAA7D]">转化率 {formatRate(entry.weighted_conversion_rate)}</span>
              </>
            }
          />
        )}
      />

      {scripts ? <ScriptsAssetSummary scripts={scripts} /> : null}
    </div>
  );

  if (layoutVariant === "embedded") {
    return content;
  }

  return (
    <AdminWorkspaceLayout
      eyebrow={props.eyebrow ?? "话术案例库"}
      title={props.title ?? "管理工作台"}
      description={
        props.description ??
        "审核员工提交，把有价值的话术沉淀进知识库；高风险先处理，再补缺数据，最后看推广候选。"
      }
      indexItems={[]}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/violations"
            className="active:translate-y-0 inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-[12px] font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-800"
          >
            <TrendingUp className="size-3.5 stroke-[1.5]" />
            员工视角
          </Link>
          <Link
            href="/violations/submit"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#D97757] px-3 text-[12px] font-medium text-white transition-colors hover:bg-[#C96442] active:translate-y-0"
          >
            <FilePlus2 className="size-3.5 stroke-[1.5]" />
            替员工提交
          </Link>
        </div>
      }
    >
      {content}
    </AdminWorkspaceLayout>
  );
}
