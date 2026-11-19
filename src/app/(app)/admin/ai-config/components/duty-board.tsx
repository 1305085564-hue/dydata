"use client";

import { useMemo, useState } from "react";
import { ArrowUpToLine, Pause, Play, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { rowSelectionClass } from "@/components/ui/selection";
import { formatLatency } from "@/lib/ai-config/presentation";
import type { CallStatsWindow, ChannelCallStats } from "@/lib/ai-config/call-stats-contract";
import { cn } from "@/lib/utils";
import { useAiConfig } from "../hooks/use-ai-config";
import { useAvailabilityReport } from "../hooks/use-availability";
import { useChannelCommands } from "../hooks/use-channel-commands";
import type { CallStatsState } from "../hooks/use-call-stats";
import { buildModelUsage, familyNeedsAction, formatModelUsage } from "../ai-config-view";
import {
  buildDutyGroups,
  failureKindLabel,
  formatAgo,
  formatRate,
  rateTone,
  type ChannelFailureState,
  type DutyRow,
  type RateTone,
} from "../duty-view";
import { ChannelStatusChip } from "./channel-status-chip";
import { DangerousActionDialog } from "./dangerous-action-dialog";

const TONE_TEXT: Record<Exclude<RateTone, null>, string> = {
  danger: "text-status-danger-text",
  warn: "text-[#8A6A2F]",
};

const FAILURES_COLLAPSED = 10;

const shanghaiTime = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function RateCell({
  win,
  kind,
  statsReady,
  windowTitle,
}: {
  win: CallStatsWindow | undefined;
  kind: "recent" | "recent1000";
  statsReady: boolean;
  windowTitle: string;
}) {
  if (!statsReady) return <span className="text-[#A8A29E]">—</span>;
  const text = formatRate(win);
  if (!text) return <span className="text-[#A8A29E]">{kind === "recent" ? "近 3 天没调用" : "没调用"}</span>;
  const tone = rateTone(win, kind);
  return (
    <span className={cn("tabular-nums", tone ? TONE_TEXT[tone] : "text-[#141413]")} title={`${windowTitle} ${win?.calls ?? 0} 次`}>
      {text}
    </span>
  );
}

function avgText(stats: ChannelCallStats | null): string | null {
  const ms = stats?.recent.avgMs ?? stats?.recent1000.avgMs ?? null;
  return ms === null ? null : formatLatency(ms);
}

/**
 * 「最近调用」值班表 +「最近失败」流水：出事时第一眼看这里（《效率美学》§1.1 一页一问）。
 * 每行一条在用的渠道，按模型分组，有问题的组排最前；点一行，失败流水只看这条渠道。
 */
export function DutyBoard({ callStats, onRefresh }: { callStats: CallStatsState; onRefresh?: () => void }) {
  const { bundle } = useAiConfig();
  const report = useAvailabilityReport(bundle);
  const { toggleSupply, swapOrder, testSupply, testingKeyModelId, impactConfirm, closeImpactConfirm } = useChannelCommands();
  const [selectedKeyModelId, setSelectedKeyModelId] = useState<string | null>(null);
  const [showAllFailures, setShowAllFailures] = useState(false);
  const [mountedAt] = useState(() => Date.now());

  const stats = callStats.status === "ready" ? callStats.stats : null;
  const statsReady = stats !== null;
  const now = stats ? Date.parse(stats.generatedAt) || mountedAt : mountedAt;

  const usage = useMemo(() => buildModelUsage(report?.businessAssurances ?? []), [report]);

  const groups = useMemo(() => {
    const statsByKeyModelId: Record<string, ChannelCallStats> = {};
    for (const channel of stats?.channels ?? []) statsByKeyModelId[channel.keyModelId] = channel;
    const failureByKeyModelId: Record<string, ChannelFailureState> = {};
    for (const model of bundle?.models ?? []) {
      failureByKeyModelId[model.id] = {
        lastFailureAt: model.last_failure_at ?? null,
        lastSuccessAt: model.last_success_at ?? null,
        lastErrorMessage: model.last_error_message ?? null,
        consecutiveFailures: model.consecutive_failures ?? 0,
      };
    }
    return buildDutyGroups({ families: report?.modelFamilies ?? [], usage, statsByKeyModelId, failureByKeyModelId });
  }, [bundle, report, stats, usage]);

  // 渠道与模型的名字，失败流水要用
  const names = useMemo(() => {
    const channel: Record<string, { label: string; modelName: string; modelId: string }> = {};
    for (const family of report?.modelFamilies ?? []) {
      for (const ch of family.channels) {
        channel[ch.keyModelId] = { label: ch.label || ch.providerName, modelName: family.displayName, modelId: family.modelId };
      }
    }
    const feature: Record<string, string> = {};
    for (const control of bundle?.featureControls ?? []) feature[control.key] = control.label;
    return { channel, feature };
  }, [bundle, report]);

  const toggleSelected = (keyModelId: string) =>
    setSelectedKeyModelId((current) => (current === keyModelId ? null : keyModelId));

  const setAsFirst = async (row: DutyRow, rows: DutyRow[]) => {
    const first = rows.find((candidate) => candidate.channel.isSchedulable);
    if (!first || first.channel.keyModelId === row.channel.keyModelId) return;
    await swapOrder(row.channel.modelId, row.channel.keyModelId, first.channel.keyModelId);
  };

  // 失败流水：有调用记录用记录；没接上时退回每条渠道上记的最后一次失败，并说清楚
  type FailureItem = {
    id: string; at: string; keyModelId: string; featureKey: string | null;
    reason: string; detail: string | null; outcome: "rescued" | "lost" | "probe" | "recovered" | "open";
  };
  const failures: FailureItem[] = useMemo(() => {
    if (stats) {
      return stats.recentFailures.map((f, index) => ({
        id: `${f.at}-${f.keyModelId}-${index}`,
        at: f.at,
        keyModelId: f.keyModelId,
        featureKey: f.featureKey,
        reason: failureKindLabel(f.kind),
        detail: f.message || null,
        outcome: f.isProbe ? "probe" : f.rescued ? "rescued" : "lost",
      }));
    }
    const items: FailureItem[] = [];
    for (const group of groups) {
      for (const row of group.rows) {
        if (!row.lastFailure) continue;
        items.push({
          id: row.channel.keyModelId,
          at: row.lastFailure.at,
          keyModelId: row.channel.keyModelId,
          featureKey: null,
          reason: row.lastFailure.reason,
          detail: null,
          outcome: row.lastFailure.recoveredAfter ? "recovered" : "open",
        });
      }
    }
    return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }, [stats, groups]);

  const visibleFailures = selectedKeyModelId ? failures.filter((f) => f.keyModelId === selectedKeyModelId) : failures;
  const shownFailures = showAllFailures ? visibleFailures : visibleFailures.slice(0, FAILURES_COLLAPSED);

  const statsNote =
    callStats.status === "loading"
      ? "正在读取调用记录…"
      : callStats.status === "unavailable"
      ? callStats.reason === "not_ready"
        ? "调用记录还没接上：成功率和平均耗时先空着，状态和最后一次失败是渠道上记的"
        : "调用记录读取失败：成功率和平均耗时先空着，点右上角刷新再试"
      : "近期 = 近 3 天内最近 50 次；手动检测不算在内";

  return (
    <div className="space-y-3">
      {/* 值班表 */}
      <div className="overflow-x-auto rounded-xl border border-[#E2E2DF] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-2 pb-1.5">
          <h2 className="text-[14px] text-[#141413]">最近调用</h2>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#78716C]">{statsNote}</span>
            {onRefresh && (
              <Button
                variant="ghost"
                size="icon-s"
                onClick={onRefresh}
                className="size-7 text-[#78716C] hover:text-[#141413]"
                title="刷新配置和调用记录"
                aria-label="刷新配置和调用记录"
              >
                <RefreshCw className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
        {groups.length === 0 ? (
          <p className="px-4 pb-4 text-[12px] text-[#78716C]">还没有在用的模型。</p>
        ) : (
          <table className="w-full min-w-[880px] text-[12px]">
            <thead>
              <tr className="border-y border-[#E2E2DF] bg-[#F7F7F6]/60 text-left text-[#78716C]">
                <th className="h-8 pl-4 font-normal">渠道</th>
                <th className="w-[96px] font-normal">近期成功率</th>
                <th className="w-[88px] font-normal">近 1000 次</th>
                <th className="w-[80px] font-normal">平均耗时</th>
                <th className="font-normal">最近一次失败</th>
                <th className="w-[132px] font-normal">现在状态</th>
                <th className="w-[104px] pr-4 text-right font-normal">操作</th>
              </tr>
            </thead>
            {groups.map((group) => {
              const usageText = formatModelUsage(group.usage);
              const noUsable = familyNeedsAction(group.family) && group.family.identityCounts.active === 0;
              return (
                <tbody key={group.family.modelId} className="border-b border-[#E2E2DF] last:border-b-0">
                  <tr className="bg-[#FCFCFB]">
                    <td colSpan={7} className="h-8 pl-4 pr-4">
                      <span className="text-[13px] text-[#141413]">{group.family.displayName}</span>
                      {group.isFallback && (
                        <span className="ml-2 inline-flex h-5 items-center rounded-md bg-[#EBEBE9] px-1.5 text-[12px] text-[#78716C]">兜底</span>
                      )}
                      {usageText && <span className="ml-2 text-[#78716C]">{usageText}</span>}
                      {noUsable && <span className="ml-2 text-status-danger-text">· 没有能用的渠道</span>}
                    </td>
                  </tr>
                  {group.rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="h-9 pl-4 text-[#78716C]">没有接入渠道，去下面「渠道维护」为它找渠道。</td>
                    </tr>
                  ) : (
                    group.rows.map((row) => {
                      const selected = selectedKeyModelId === row.channel.keyModelId;
                      const avg = avgText(row.stats);
                      const isTesting = testingKeyModelId === row.channel.keyModelId;
                      return (
                        <tr
                          key={row.channel.keyModelId}
                          tabIndex={0}
                          aria-selected={selected}
                          onClick={() => toggleSelected(row.channel.keyModelId)}
                          onKeyDown={(e) => {
                            if (e.target !== e.currentTarget) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleSelected(row.channel.keyModelId);
                            }
                          }}
                          className={cn("h-9 cursor-pointer border-t border-[#E2E2DF]/60 transition-colors", rowSelectionClass(selected))}
                        >
                          <td className="pl-4">
                            <span className="text-[13px] text-[#141413]">{row.channel.label || row.channel.providerName}</span>
                            <span className="ml-1.5 text-[#A8A29E]">{row.channel.providerName}</span>
                            {row.isFirst && <span className="ml-1.5 text-[#78716C]">· 首选</span>}
                          </td>
                          <td>
                            <RateCell win={row.stats?.recent} kind="recent" statsReady={statsReady} windowTitle="近 3 天最近" />
                          </td>
                          <td>
                            <RateCell win={row.stats?.recent1000} kind="recent1000" statsReady={statsReady} windowTitle="最近" />
                          </td>
                          <td className="tabular-nums text-[#1F1E1D]">
                            {statsReady ? avg ?? <span className="text-[#A8A29E]">—</span> : <span className="text-[#A8A29E]">—</span>}
                          </td>
                          <td className="max-w-0 pr-3">
                            {row.lastFailure ? (
                              <span
                                className={cn("block truncate", row.lastFailure.recoveredAfter ? "text-[#78716C]" : "text-status-danger-text")}
                                title={row.lastFailure.reason}
                              >
                                {formatAgo(row.lastFailure.at, now)} · {row.lastFailure.reason}
                                {row.lastFailure.recoveredAfter && " · 之后已恢复"}
                              </span>
                            ) : (
                              <span className="text-[#A8A29E]">没有失败记录</span>
                            )}
                          </td>
                          <td>
                            <span className="inline-flex items-center gap-2">
                              <ChannelStatusChip identity={row.channel.identity} sleepUntil={row.channel.sleepUntil} />
                              {row.consecutiveFailures >= 2 && row.channel.identity !== "active" && (
                                <span className="text-[#78716C]">连败 {row.consecutiveFailures}</span>
                              )}
                            </span>
                          </td>
                          <td className="pr-4">
                            <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="icon-s"
                                disabled={isTesting}
                                onClick={() => void testSupply(row.channel.keyId, row.channel.modelId)}
                                className="size-7 text-[#78716C] hover:text-[#141413]"
                                title="测试这条渠道"
                                aria-label="测试这条渠道"
                              >
                                <Play className={cn("size-3.5", isTesting && "animate-spin")} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-s"
                                disabled={row.isFirst || !row.channel.isSchedulable}
                                onClick={() => void setAsFirst(row, group.rows)}
                                className="size-7 text-[#78716C] hover:text-[#141413] disabled:opacity-30"
                                title={row.isFirst ? "已经是首选" : row.channel.isSchedulable ? "设为首选（和现在的首选互换顺位）" : "这条渠道现在不能调度，不能设为首选"}
                                aria-label="设为首选"
                              >
                                <ArrowUpToLine className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-s"
                                onClick={() => void toggleSupply(row.channel.keyModelId, false)}
                                className="size-7 text-[#78716C] hover:text-status-danger"
                                title="暂停这条渠道（只停它给这个模型供货）"
                                aria-label="暂停这条渠道"
                              >
                                <Pause className="size-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              );
            })}
          </table>
        )}
      </div>

      {/* 最近失败流水 */}
      <div className="overflow-x-auto rounded-xl border border-[#E2E2DF] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] text-[#141413]">最近失败</h2>
            {selectedKeyModelId && (
              <button
                type="button"
                onClick={() => setSelectedKeyModelId(null)}
                className="inline-flex h-6 items-center gap-1 rounded-md bg-[#E4E4E1] px-2 text-[12px] text-[#1F1E1D]"
              >
                只看 {names.channel[selectedKeyModelId]?.label ?? "这条渠道"}
                <X className="size-3" />
              </button>
            )}
          </div>
          <span className="text-[12px] text-[#78716C]">
            {statsReady ? "最近 100 条，含手动检测" : "调用记录接上前，每条渠道只看得到最后一次失败"}
          </span>
        </div>
        {visibleFailures.length === 0 ? (
          <p className="px-4 pb-4 text-[12px] text-[#78716C]">{selectedKeyModelId ? "这条渠道近期没有失败。" : "近期没有失败。"}</p>
        ) : (
          <>
            <table className="w-full min-w-[760px] text-[12px]">
              <thead>
                <tr className="border-y border-[#E2E2DF] bg-[#F7F7F6]/60 text-left text-[#78716C]">
                  <th className="h-8 w-[104px] pl-4 font-normal">时间</th>
                  <th className="w-[120px] font-normal">功能</th>
                  <th className="w-[240px] font-normal">模型 · 渠道</th>
                  <th className="font-normal">原因</th>
                  <th className="w-[88px] pr-4 text-right font-normal">结果</th>
                </tr>
              </thead>
              <tbody>
                {shownFailures.map((failure) => {
                  const channel = names.channel[failure.keyModelId];
                  return (
                    <tr key={failure.id} className="h-9 border-t border-[#E2E2DF]/60">
                      <td className="pl-4 tabular-nums text-[#78716C]" title={formatAgo(failure.at, now)}>
                        {shanghaiTime.format(new Date(failure.at))}
                      </td>
                      <td className="text-[#1F1E1D]">
                        {failure.featureKey ? names.feature[failure.featureKey] ?? failure.featureKey : <span className="text-[#A8A29E]">—</span>}
                      </td>
                      <td className="max-w-0 pr-3">
                        <span className="block truncate text-[#1F1E1D]">
                          {channel ? `${channel.modelName} · ${channel.label}` : "已移除的渠道"}
                        </span>
                      </td>
                      <td className="max-w-0 pr-3">
                        <span className="block truncate" title={failure.detail ?? failure.reason}>
                          <span className="text-[#1F1E1D]">{failure.reason}</span>
                          {failure.detail && <span className="text-[#78716C]"> · {failure.detail}</span>}
                        </span>
                      </td>
                      <td className="pr-4 text-right">
                        {failure.outcome === "rescued" && <span className="text-[#4B6B4E]">已救回</span>}
                        {failure.outcome === "lost" && <span className="text-status-danger-text">没救回</span>}
                        {failure.outcome === "probe" && <span className="text-[#78716C]">手动检测</span>}
                        {failure.outcome === "recovered" && <span className="text-[#78716C]">之后已恢复</span>}
                        {failure.outcome === "open" && <span className="text-status-danger-text">还没恢复</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visibleFailures.length > FAILURES_COLLAPSED && (
              <button
                type="button"
                onClick={() => setShowAllFailures((v) => !v)}
                className="w-full border-t border-[#E2E2DF]/60 py-2 text-[12px] text-[#78716C] hover:bg-[#F7F7F6] hover:text-[#141413]"
              >
                {showAllFailures ? "收起" : `展开全部 ${visibleFailures.length} 条`}
              </button>
            )}
          </>
        )}
      </div>

      <DangerousActionDialog state={impactConfirm} onClose={closeImpactConfirm} />
    </div>
  );
}
