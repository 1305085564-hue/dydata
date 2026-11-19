"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ArrowUpToLine, Pause, Play, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { rowSelectionClass } from "@/components/ui/selection";
import { formatLatency } from "@/lib/ai-config/presentation";
import { CALL_RECORDING_SINCE_LABEL, type CallStatsWindow, type ChannelCallStats } from "@/lib/ai-config/call-stats-contract";
import { cn } from "@/lib/utils";
import { useAiConfig } from "../hooks/use-ai-config";
import { useAvailabilityReport } from "../hooks/use-availability";
import { useChannelCommands } from "../hooks/use-channel-commands";
import type { CallStatsState } from "../hooks/use-call-stats";
import { buildModelUsage } from "../ai-config-view";
import {
  buildFailureList,
  buildModelCards,
  formatAgo,
  formatRate,
  modelUsageText,
  rateTone,
  type ChannelFailureState,
  type ChannelLine,
  type ModelCard,
  type RateTone,
} from "../duty-view";
import { ChannelStatusChip } from "./channel-status-chip";
import { DangerousActionDialog } from "./dangerous-action-dialog";

const TONE_TEXT: Record<Exclude<RateTone, null>, string> = {
  danger: "text-status-danger-text",
  warn: "text-[#8A6A2F]",
};

const FAILURES_COLLAPSED = 10;
const COLUMN_COUNT = 8;

const shanghaiTime = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function RateText({ win, kind, statsReady }: { win: CallStatsWindow | undefined; kind: "recent" | "recent1000"; statsReady: boolean }) {
  if (!statsReady) return <span className="text-[#A8A29E]">—</span>;
  const text = formatRate(win);
  if (!text) return <span className="text-[#A8A29E]">没调用</span>;
  const tone = rateTone(win, kind);
  return (
    <span
      className={cn("tabular-nums", tone ? TONE_TEXT[tone] : "text-[#141413]")}
      title={`${kind === "recent" ? "近 3 天最近" : "最近"} ${win?.calls ?? 0} 次`}
    >
      {text}
    </span>
  );
}

function avgOf(stats: ChannelCallStats | null | undefined, win?: CallStatsWindow): string | null {
  const ms = win ? win.avgMs : stats?.recent.avgMs ?? stats?.recent1000.avgMs ?? null;
  return ms === null || ms === undefined ? null : formatLatency(ms);
}

/** 模型一行汇总：近期 · 近 1000 次 · 平均；还没记录时直说 */
function ModelSummary({ card, statsReady }: { card: ModelCard; statsReady: boolean }) {
  if (!statsReady) return null;
  if (card.recent1000.calls === 0) return <span className="text-[#A8A29E]">还没有调用记录</span>;
  const avg = avgOf(null, card.recent.calls > 0 ? card.recent : card.recent1000);
  return (
    <span className="tabular-nums text-[#78716C]">
      近期 <RateText win={card.recent} kind="recent" statsReady />
      <span className="mx-1.5 text-[#E2E2DF]">|</span>
      近 1000 次 <RateText win={card.recent1000} kind="recent1000" statsReady />
      {avg && (
        <>
          <span className="mx-1.5 text-[#E2E2DF]">|</span>
          平均 <span className="text-[#141413]">{avg}</span>
        </>
      )}
    </span>
  );
}

/**
 * 在用的模型（阿禅 2026-11-19：模型是主角——绝大多数功能跟随默认，要看的是模型稳不稳）。
 * 每个模型：现在走哪条渠道、备用几条稳不稳、整体近期与近 1000 次成功率；出问题的排前，默认排第一。
 * 下面是最近失败流水，点一条渠道只看它的失败。
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

  const cards = useMemo(() => {
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
    return buildModelCards({
      families: report?.modelFamilies ?? [],
      usage: buildModelUsage(report?.businessAssurances ?? []),
      statsByKeyModelId,
      failureByKeyModelId,
    });
  }, [bundle, report, stats]);

  const names = useMemo(() => {
    const channel: Record<string, { label: string; modelName: string }> = {};
    for (const family of report?.modelFamilies ?? []) {
      for (const ch of family.channels) channel[ch.keyModelId] = { label: ch.label || ch.providerName, modelName: family.displayName };
    }
    const feature: Record<string, string> = {};
    for (const control of bundle?.featureControls ?? []) feature[control.key] = control.label;
    return { channel, feature };
  }, [bundle, report]);

  const failures = useMemo(() => buildFailureList(stats?.recentFailures ?? null, cards), [stats, cards]);
  const visibleFailures = selectedKeyModelId ? failures.filter((f) => f.keyModelId === selectedKeyModelId) : failures;
  const shownFailures = showAllFailures ? visibleFailures : visibleFailures.slice(0, FAILURES_COLLAPSED);

  const toggleSelected = (keyModelId: string) =>
    setSelectedKeyModelId((current) => (current === keyModelId ? null : keyModelId));

  const statsNote =
    callStats.status === "loading"
      ? "正在读取调用记录…"
      : callStats.status === "unavailable"
      ? callStats.reason === "not_ready"
        ? "调用记录还没接上，成功率和耗时先空着"
        : "调用记录读取失败，成功率和耗时先空着，点刷新再试"
      : `近期 = 近 3 天内最近 50 次 · 调用记录从 ${CALL_RECORDING_SINCE_LABEL}开始攒 · 手动检测不算`;

  const renderLine = (card: ModelCard, line: ChannelLine, role: "current" | "backup") => {
    const keyModelId = line.channel.keyModelId;
    const selected = selectedKeyModelId === keyModelId;
    const isTesting = testingKeyModelId === keyModelId;
    const avg = avgOf(line.stats);
    const canPromote = role === "backup" && line.channel.isSchedulable && card.current !== null;
    return (
      <tr
        key={keyModelId}
        tabIndex={0}
        aria-selected={selected}
        onClick={() => toggleSelected(keyModelId)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleSelected(keyModelId);
          }
        }}
        className={cn("h-9 cursor-pointer border-t border-[#E2E2DF]/60 transition-colors", rowSelectionClass(selected))}
      >
        <td className="pl-4">
          {role === "current" ? (
            <span className="text-[#141413]">现在走</span>
          ) : (
            <span className="text-[#A8A29E]">备用</span>
          )}
        </td>
        <td className="max-w-0 pr-3">
          <span
            className={cn("block truncate", role === "current" ? "text-[14px] text-[#141413]" : "text-[13px] text-[#1F1E1D]")}
            title={`${line.channel.label || line.channel.providerName}（${line.channel.providerName}）`}
          >
            {line.channel.label || line.channel.providerName}
          </span>
        </td>
        <td>
          <RateText win={line.stats?.recent} kind="recent" statsReady={statsReady} />
        </td>
        <td>
          <RateText win={line.stats?.recent1000} kind="recent1000" statsReady={statsReady} />
        </td>
        <td className="tabular-nums text-[#1F1E1D]">{statsReady && avg ? avg : <span className="text-[#A8A29E]">—</span>}</td>
        <td className="max-w-0 pr-3">
          {line.lastFailure ? (
            <span
              className={cn("block truncate", line.lastFailure.recoveredAfter ? "text-[#78716C]" : "text-status-danger-text")}
              title={line.lastFailure.reason}
            >
              {formatAgo(line.lastFailure.at, now)}失败 · {line.lastFailure.reason}
              {line.lastFailure.recoveredAfter && " · 之后已恢复"}
            </span>
          ) : (
            <span className="text-[#A8A29E]">没有失败记录</span>
          )}
        </td>
        <td>
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <ChannelStatusChip identity={line.channel.identity} sleepUntil={line.channel.sleepUntil} />
            {line.consecutiveFailures >= 2 && line.channel.identity !== "active" && (
              <span className="text-[#78716C]">连续失败 {line.consecutiveFailures} 次</span>
            )}
          </span>
        </td>
        <td className="pr-4">
          <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon-s"
              disabled={isTesting}
              onClick={() => void testSupply(line.channel.keyId, line.channel.modelId)}
              className="size-7 text-[#78716C] hover:text-[#141413]"
              title="测试这条渠道"
              aria-label="测试这条渠道"
            >
              <Play className={cn("size-3.5", isTesting && "animate-spin")} />
            </Button>
            {role === "backup" && (
              <Button
                variant="ghost"
                size="icon-s"
                disabled={!canPromote}
                onClick={() => card.current && void swapOrder(card.family.modelId, keyModelId, card.current.channel.keyModelId)}
                className="size-7 text-[#78716C] hover:text-[#141413] disabled:opacity-30"
                title={canPromote ? "改成现在走这条（和现在走的互换顺位）" : "这条渠道现在不能调度，不能改成现在走"}
                aria-label="改成现在走这条"
              >
                <ArrowUpToLine className="size-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-s"
              onClick={() => void toggleSupply(keyModelId, false)}
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
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-[#E2E2DF] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-2 pb-1.5">
          <h2 className="text-[14px] text-[#141413]">在用的模型</h2>
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
        {cards.length === 0 ? (
          <p className="px-4 pb-4 text-[12px] text-[#78716C]">还没有在用的模型。</p>
        ) : (
          <table className="w-full min-w-[920px] text-[12px]">
            <thead>
              <tr className="border-y border-[#E2E2DF] bg-[#F7F7F6]/60 text-left text-[#78716C]">
                <th className="h-8 w-[64px] pl-4 font-normal" />
                <th className="font-normal">渠道</th>
                <th className="w-[88px] font-normal">近期成功率</th>
                <th className="w-[80px] font-normal">近 1000 次</th>
                <th className="w-[72px] font-normal">平均耗时</th>
                <th className="font-normal">最近一次失败</th>
                <th className="w-[176px] font-normal">现在状态</th>
                <th className="w-[104px] pr-4 text-right font-normal">操作</th>
              </tr>
            </thead>
            {cards.map((card) => {
              const usageText = modelUsageText(card.usage);
              const failingBackups = card.backups.length - card.stableBackupCount;
              return (
                <tbody key={card.family.modelId} className="border-b-4 border-[#F7F7F6] last:border-b-0">
                  <tr className="border-t border-[#E2E2DF]">
                    <td colSpan={COLUMN_COUNT} className="px-4 pt-2.5 pb-2">
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[14px] text-[#141413]">{card.family.displayName}</span>
                          {card.isFallback && (
                            <span className="inline-flex h-5 items-center rounded-md bg-[#D97757]/10 px-1.5 text-[12px] text-[#C46A4D]">默认</span>
                          )}
                          {usageText && <span className="text-[#78716C]">{usageText}</span>}
                        </div>
                        <ModelSummary card={card} statsReady={statsReady} />
                      </div>
                      {card.risk && (
                        <p
                          className={cn(
                            "mt-1 inline-flex items-center gap-1",
                            card.risk.tone === "danger" ? "text-status-danger-text" : "text-[#8A6A2F]",
                          )}
                        >
                          <AlertCircle className="size-3.5" />
                          {card.risk.text}
                        </p>
                      )}
                    </td>
                  </tr>
                  {card.current ? (
                    renderLine(card, card.current, "current")
                  ) : (
                    <tr className="border-t border-[#E2E2DF]/60">
                      <td className="pl-4 text-[#141413]">现在走</td>
                      <td colSpan={COLUMN_COUNT - 1} className="h-9 text-status-danger-text">
                        没有能走的渠道，去下面「渠道维护」为它找渠道
                      </td>
                    </tr>
                  )}
                  <tr className="border-t border-[#E2E2DF]/60 bg-[#FCFCFB]">
                    <td colSpan={COLUMN_COUNT} className="h-7 pl-4 text-[#78716C]">
                      {card.backups.length === 0 ? (
                        "没有备用渠道"
                      ) : (
                        <>
                          备用 {card.backups.length} 条：
                          {card.stableBackupCount > 0 && <span className="text-[#4B6B4E]">{card.stableBackupCount} 条稳</span>}
                          {card.stableBackupCount > 0 && failingBackups > 0 && "、"}
                          {failingBackups > 0 && <span className="text-[#8A6A2F]">{failingBackups} 条在出错或待复测</span>}
                        </>
                      )}
                    </td>
                  </tr>
                  {card.backups.map((line) => renderLine(card, line, "backup"))}
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
            {statsReady ? "最近 100 条：调用记录里的失败 + 渠道上记下的最后一次失败" : "调用记录接上前，每条渠道只看得到最后一次失败"}
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
