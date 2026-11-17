"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ItemHeading } from "@/components/ui/item-heading";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CollaborationDiagnosisContextValue } from "@/components/admin/collaboration-work-review-link";
import { CollaborationWorkReviewLink } from "@/components/admin/collaboration-work-review-link";
import type { CollaborationRoleTab, PersonDetailData } from "./types";
import { formatBigNumber } from "./types";
import { formatAnomalyStatusText } from "@/lib/video-anomaly";
import { BREAKOUT_GRADE_TEXT_CLASS } from "@/lib/breakout-rating";
import {
  getContentQualityStatusText,
  retentionSubMetricDetails,
  type ContentQualityRules,
  type ContentQualitySummary,
  type WorkContentQuality,
} from "@/lib/collaboration/content-quality-contract";

interface PersonalCardWorksProps {
  data: PersonDetailData;
  activeTab?: CollaborationRoleTab;
  diagnosisContext: CollaborationDiagnosisContextValue | null;
}

interface QualityWorkRow {
  reportId: string;
  reportDate: string;
  accountName: string;
  title: string;
  playCount: number | null;
  dataSource?: "ai" | "manual" | null;
  contentQuality?: WorkContentQuality | null;
}

export function shouldShowWorkAccountNames(
  ownerName: string,
  works: ReadonlyArray<{ accountName: string }>,
): boolean {
  const owner = ownerName.trim();
  const names = works.map((w) => w.accountName.trim()).filter(Boolean);
  if (names.length === 0) return false;
  if (new Set(names).size >= 2) return true;
  return names.some((name) => name !== owner);
}

function formatShortDate(dateStr: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr.slice(5) : dateStr;
}

function getTopicLabel(q: WorkContentQuality | null | undefined): string {
  if (q?.topicKind === "dry_goods") return "干货 · 收藏";
  if (q?.topicKind === "review") return "复盘 · 点赞";
  if (q?.topicKind === "other") return "其他 · 点赞";
  return "未识别话题";
}

function QualityMonthSummaryBar({ summary }: { summary: ContentQualitySummary }) {
  const hasInteraction = summary.avgInteractionAchievement != null;
  const hasContent = summary.avgContentAchievement != null;
  const rateText =
    summary.goodExcellentRate == null
      ? "—"
      : `${Math.round(summary.goodExcellentRate * 100)}% (${summary.ratedCount}/${summary.totalCount}篇)`;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-[#78716C] tabular-nums">
      {hasInteraction ? (
        <span>
          互动均值{" "}
          <span className="text-[#141413]">
            {Math.round(summary.avgInteractionAchievement!)}%
          </span>
        </span>
      ) : null}
      {hasContent ? (
        <span>
          留存均值{" "}
          <span className="text-[#141413]">
            {Math.round(summary.avgContentAchievement!)}%
          </span>
        </span>
      ) : null}
      <span>
        良优率 <span className="text-[#141413]">{rateText}</span>
      </span>
    </div>
  );
}

function WorkTitleCell({
  work,
  subtitle,
  diagnosisContext,
}: {
  work: Pick<QualityWorkRow, "reportId" | "title" | "accountName" | "playCount" | "reportDate" | "dataSource">;
  subtitle: string | null;
  diagnosisContext: CollaborationDiagnosisContextValue | null;
}) {
  const displayTitle = work.title || "未命名作品";
  const isManual = work.dataSource === "manual";

  return (
    <td className="py-2.5 px-3 min-w-0">
      <div className="min-w-0">
        {diagnosisContext ? (
          <span
            className="block min-w-0 truncate text-[13px] text-[#1F1E1D] group-hover:text-[#141413]"
            title={displayTitle}
          >
            {displayTitle}
          </span>
        ) : (
          <CollaborationWorkReviewLink
            reportId={work.reportId}
            preview={{
              title: work.title,
              accountName: work.accountName,
              playCount: work.playCount,
              reportDate: work.reportDate,
              dataSource: work.dataSource,
            }}
            className="min-w-0 truncate text-left text-[13px] text-[#1F1E1D] group-hover:text-[#141413] group-hover:underline disabled:cursor-wait disabled:opacity-60 block"
          >
            {displayTitle}
          </CollaborationWorkReviewLink>
        )}
      </div>
      {subtitle || isManual ? (
        <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] text-[#78716C]">
          {subtitle ? (
            <span className="min-w-0 truncate" title={subtitle}>
              {subtitle}
            </span>
          ) : null}
          {isManual ? (
            <Badge title="该数据由人工填写或修改" className="shrink-0">
              手工
            </Badge>
          ) : null}
        </div>
      ) : null}
    </td>
  );
}

function InteractionTooltipCell({
  quality,
  playCount,
  rules,
}: {
  quality: WorkContentQuality | null | undefined;
  playCount: number | null;
  rules: ContentQualityRules | null | undefined;
}) {
  if (quality?.interactionAchievement == null) {
    return <span className="text-[12px] text-[#A8A29E]">—</span>;
  }

  const achPct = Math.round(quality.interactionAchievement);
  const rateText =
    quality.interactionValue != null
      ? `${(quality.interactionValue * 100).toFixed(2)}%`
      : null;
  const targetRate =
    rules == null
      ? null
      : quality.topicKind === "dry_goods"
        ? rules.dryGoods.interaction
        : rules.review.interaction;
  const effectivePlay = quality.snapshotPlayCount ?? playCount;
  const m = quality.interactionMetrics;

  const triggerContent = (
    <span className="inline-block cursor-default text-[13px] text-[#141413] tabular-nums">
      {achPct}%
    </span>
  );

  if (!m && !rateText) {
    return triggerContent;
  }

  const items: Array<{ label: string; value: number | null | undefined }> = m
    ? [
        { label: "点赞", value: m.likes },
        { label: "评论", value: m.comments },
        { label: "转发", value: m.shares },
        { label: "收藏", value: m.favorites },
      ]
    : [];

  return (
    <Tooltip>
      <TooltipTrigger render={triggerContent} />
      <TooltipContent
        side="left"
        align="center"
        className="w-[248px] max-w-[248px] flex-col items-stretch gap-2 p-3 text-left"
      >
        <div className="flex items-center justify-between border-b border-[#E2E2DF]/80 pb-1">
          <span className="text-[12px] text-[#141413]">互动达成 {achPct}%</span>
          {rateText ? (
            <span className="text-[12px] text-[#78716C] tabular-nums">
              互动率 {rateText}
            </span>
          ) : null}
        </div>
        {items.length > 0 ? (
          <div className="space-y-1">
            {items.map((item) => {
              const count = item.value;
              const pct =
                count != null && effectivePlay != null && effectivePlay > 0
                  ? `${((count / effectivePlay) * 100).toFixed(2)}%`
                  : "—";
              return (
                <div
                  key={item.label}
                  className="flex items-center justify-between gap-2 text-[12px] tabular-nums"
                >
                  <span className="text-[#78716C]">{item.label}</span>
                  <span className="inline-flex items-center gap-2">
                    <span className="text-[#141413]">
                      {count == null ? "—" : count.toLocaleString("zh-CN")}
                    </span>
                    <span className="w-[48px] text-right text-[#78716C]">{pct}</span>
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
        {targetRate != null ? (
          <div className="flex items-center justify-between border-t border-[#E2E2DF]/80 pt-1 text-[12px] text-[#78716C] tabular-nums">
            <span>目标标准线</span>
            <span>{(targetRate * 100).toFixed(2)}%</span>
          </div>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}

function RetentionTooltipCell({
  quality,
  rules,
}: {
  quality: WorkContentQuality | null | undefined;
  rules: ContentQualityRules | null | undefined;
}) {
  if (quality?.contentAchievement == null) {
    return (
      <span className="text-[12px] text-[#A8A29E]">
        {getContentQualityStatusText(quality?.status ?? "pending_snapshot")}
      </span>
    );
  }

  const totalPct = Math.round(quality.contentAchievement);
  const calcNote =
    quality.retentionCalculation === "avg_play_duration_only"
      ? "按均播折算"
      : quality.retentionCalculation === "avg_play_ratio_only"
        ? "按占比折算"
        : null;
  const details = retentionSubMetricDetails(quality.retentionMetrics, rules);

  const triggerContent = (
    <span className="inline-block cursor-default text-[13px] text-[#141413] tabular-nums">
      {totalPct}%
    </span>
  );

  if (details.length === 0) {
    return triggerContent;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={triggerContent} />
      <TooltipContent
        side="left"
        align="center"
        className="w-[264px] max-w-[264px] flex-col items-stretch gap-2 p-3 text-left"
      >
        <div className="flex items-center justify-between border-b border-[#E2E2DF]/80 pb-1">
          <span className="text-[12px] text-[#141413]">留存达成 {totalPct}%</span>
          {calcNote ? (
            <span className="text-[12px] text-[#78716C]">{calcNote}</span>
          ) : null}
        </div>
        <div className="space-y-1">
          {details.map((item) => {
            const dotClass =
              item.status === "poor"
                ? "bg-status-danger"
                : item.status === "good"
                  ? "bg-status-success"
                  : "bg-[#D6D3D1]";
            const achText =
              item.achievement != null ? `达成 ${item.achievement}%` : "未回传";
            const achColor =
              item.status === "poor"
                ? "text-status-danger"
                : item.status === "good"
                  ? "text-status-success-text"
                  : "text-[#78716C]";

            return (
              <div
                key={item.key}
                className="flex items-center justify-between gap-2 text-[12px] tabular-nums"
              >
                <span className="inline-flex items-center gap-1 text-[#1F1E1D] min-w-0">
                  <span className={`size-1.5 shrink-0 rounded-full ${dotClass}`} />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="inline-flex items-center gap-2 shrink-0">
                  <span className="text-[#141413]">{item.actualText}</span>
                  <span className={`w-[58px] text-right ${achColor}`}>{achText}</span>
                </span>
              </div>
            );
          })}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function OverallGradeTooltipCell({
  quality,
  playCount,
  rules,
}: {
  quality: WorkContentQuality | null | undefined;
  playCount: number | null;
  rules: ContentQualityRules | null | undefined;
}) {
  if (!quality?.overallGrade) {
    return (
      <span className="inline-block rounded bg-[#F1F1F0] px-1.5 py-0.5 text-[12px] text-[#A8A29E] border border-[#E2E2DF]">
        {getContentQualityStatusText(quality?.status ?? "pending_snapshot")}
      </span>
    );
  }

  const effectivePlay = quality.snapshotPlayCount ?? playCount;
  const floors = rules?.playFloors;
  let playNote: string | null = null;
  let playDot = "bg-[#D6D3D1]";

  if (effectivePlay != null && floors) {
    if (effectivePlay < floors.floor) {
      playNote = `未满 ${formatBigNumber(floors.floor)} 直接判普`;
      playDot = "bg-status-danger";
    } else if (effectivePlay < floors.good) {
      playNote = `未满 ${formatBigNumber(floors.good)} 最高评普`;
      playDot = "bg-status-danger";
    } else if (effectivePlay < floors.excellent) {
      playNote = `未满 ${formatBigNumber(floors.excellent)} 最高评良`;
      playDot = "bg-[#D6D3D1]";
    } else {
      playNote = `已达 ${formatBigNumber(floors.excellent)} 门槛`;
      playDot = "bg-status-success";
    }
  }

  const triggerContent = (
    <span
      className={`inline-block cursor-default font-normal ${BREAKOUT_GRADE_TEXT_CLASS[quality.overallGrade]}`}
    >
      综合{quality.overallGrade}
    </span>
  );

  return (
    <Tooltip>
      <TooltipTrigger render={triggerContent} />
      <TooltipContent
        side="left"
        align="center"
        className="w-[248px] max-w-[248px] flex-col items-stretch gap-2 p-3 text-left"
      >
        <div className="flex items-center justify-between border-b border-[#E2E2DF]/80 pb-1">
          <span className={`text-[12px] ${BREAKOUT_GRADE_TEXT_CLASS[quality.overallGrade]}`}>
            综合{quality.overallGrade}
          </span>
          {playNote ? (
            <span className="text-[12px] text-[#78716C]">{playNote}</span>
          ) : null}
        </div>
        <div className="space-y-1 text-[12px] tabular-nums">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-[#1F1E1D]">
              <span className={`size-1.5 shrink-0 rounded-full ${playDot}`} />
              <span>播放量</span>
            </span>
            <span className="text-[#141413]">{formatBigNumber(effectivePlay)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[#78716C]">互动达成</span>
            <span className="text-[#141413]">
              {quality.interactionAchievement != null
                ? `${Math.round(quality.interactionAchievement)}%`
                : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[#78716C]">留存达成</span>
            <span className="text-[#141413]">
              {quality.contentAchievement != null
                ? `${Math.round(quality.contentAchievement)}%`
                : "—"}
            </span>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function QualityWorksTable({
  ownerName,
  works,
  rules,
  diagnosisContext,
}: {
  ownerName: string;
  works: QualityWorkRow[];
  rules: ContentQualityRules | null | undefined;
  diagnosisContext: CollaborationDiagnosisContextValue | null;
}) {
  const showAccountName = shouldShowWorkAccountNames(ownerName, works);

  return (
    <TooltipProvider delay={120}>
      <Card className="overflow-x-auto p-0 gap-0 scroll-shadow-horizontal">
        <table className="w-full text-[13px] table-fixed">
          <thead className="bg-transparent border-b border-[#E2E2DF]/60 text-[12px] font-normal text-[#78716C] text-left">
            <tr className="h-9">
              <th className="px-3 w-[60px] font-normal whitespace-nowrap">日期</th>
              <th className="px-3 font-normal">作品</th>
              <th className="px-2.5 text-right w-[68px] font-normal whitespace-nowrap">播放量</th>
              <th className="px-2.5 text-right w-[76px] font-normal whitespace-nowrap">互动达成</th>
              <th className="px-2.5 text-right w-[76px] font-normal whitespace-nowrap">留存达成</th>
              <th className="px-3 text-right w-[76px] font-normal whitespace-nowrap">综合评级</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E2DF]/60">
            {works.map((work) => {
              const q = work.contentQuality;
              const topicText = getTopicLabel(q);
              const subtitle =
                showAccountName && work.accountName.trim()
                  ? `${work.accountName.trim()} · ${topicText}`
                  : topicText;

              return (
                <tr
                  key={work.reportId}
                  onClick={() => {
                    if (work.reportId && diagnosisContext) {
                      void diagnosisContext.openDiagnosisByReportId(work.reportId);
                    }
                  }}
                  className="hover:bg-[#F7F7F6] transition-colors cursor-pointer group"
                >
                  <td
                    className="py-2.5 px-3 text-[12px] text-[#78716C] tabular-nums whitespace-nowrap"
                    title={work.reportDate}
                  >
                    {formatShortDate(work.reportDate)}
                  </td>
                  <WorkTitleCell
                    work={work}
                    subtitle={subtitle}
                    diagnosisContext={diagnosisContext}
                  />
                  <td className="py-2.5 px-2.5 text-right tabular-nums text-[#141413] whitespace-nowrap">
                    {formatBigNumber(work.playCount)}
                  </td>
                  <td className="py-2.5 px-2.5 text-right tabular-nums whitespace-nowrap">
                    <InteractionTooltipCell
                      quality={q}
                      playCount={work.playCount}
                      rules={rules}
                    />
                  </td>
                  <td className="py-2.5 px-2.5 text-right tabular-nums whitespace-nowrap">
                    <RetentionTooltipCell quality={q} rules={rules} />
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap text-[12px]">
                    <OverallGradeTooltipCell
                      quality={q}
                      playCount={work.playCount}
                      rules={rules}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </TooltipProvider>
  );
}

export function PersonalCardWorks({
  data,
  activeTab,
  diagnosisContext,
}: PersonalCardWorksProps) {
  if (activeTab === "writers") {
    const works = data.writerQuality?.monthWorks ?? [];
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <ItemHeading as="h4">本月文案作品</ItemHeading>
          <span className="text-[12px] text-[#78716C] tabular-nums">
            共 {works.length} 篇作品
          </span>
        </div>

        {data.writerQuality?.monthSummary ? (
          <QualityMonthSummaryBar summary={data.writerQuality.monthSummary} />
        ) : null}

        {!data.writerQuality ? (
          <div className="rounded-xl bg-[#F1F1F0]/40 border border-[#E2E2DF]/60 p-6 text-center text-[12px] text-[#78716C]">
            质量数据尚未接入
          </div>
        ) : data.writerQuality.state === "error" ? (
          <div className="rounded-xl bg-[#F1F1F0]/40 border border-[#E2E2DF]/60 p-6 text-center text-[12px] text-status-danger">
            文案作品明细暂未能载入，请稍候重试
          </div>
        ) : works.length === 0 ? (
          <div className="rounded-xl bg-[#F1F1F0]/40 border border-[#E2E2DF]/60 p-6 text-center text-[12px] text-[#78716C]">
            本月暂无文案作品记录
          </div>
        ) : (
          <QualityWorksTable
            ownerName={data.name}
            works={works}
            rules={data.writerQuality.rules}
            diagnosisContext={diagnosisContext}
          />
        )}
      </div>
    );
  }

  if (activeTab === "talents") {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <ItemHeading as="h4">本月达人作品</ItemHeading>
          <span className="text-[12px] text-[#78716C] tabular-nums">
            共 {data.records.length} 篇作品
          </span>
        </div>

        {data.talentQuality?.monthSummary ? (
          <QualityMonthSummaryBar summary={data.talentQuality.monthSummary} />
        ) : null}

        {data.records.length === 0 ? (
          <div className="rounded-xl bg-[#F1F1F0]/40 border border-[#E2E2DF]/60 p-6 text-center text-[12px] text-[#78716C]">
            本月暂无达人作品记录
          </div>
        ) : (
          <QualityWorksTable
            ownerName={data.name}
            works={data.records}
            rules={data.talentQuality?.rules}
            diagnosisContext={diagnosisContext}
          />
        )}
      </div>
    );
  }

  const showAccountName = shouldShowWorkAccountNames(data.name, data.records);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <ItemHeading as="h4">本月经手作品明细</ItemHeading>
        <span className="text-[12px] text-[#78716C] tabular-nums">
          共 {data.records.length} 条作品
        </span>
      </div>

      {data.records.length === 0 ? (
        <div className="rounded-xl bg-[#F1F1F0]/40 border border-[#E2E2DF]/60 p-6 text-center text-[12px] text-[#78716C]">
          本月暂无协同作品记录
        </div>
      ) : (
        <Card className="overflow-x-auto p-0 gap-0 scroll-shadow-horizontal">
          <table className="w-full text-[13px] table-fixed">
            <thead className="bg-transparent border-b border-[#E2E2DF]/60 text-[12px] font-normal text-[#78716C] text-left">
              <tr className="h-9">
                <th className="px-3 w-[60px] font-normal whitespace-nowrap">日期</th>
                <th className="px-3 font-normal">作品</th>
                <th className="px-2.5 text-right w-[72px] font-normal whitespace-nowrap">播放量</th>
                <th className="px-2.5 text-center w-[100px] font-normal whitespace-nowrap">担任岗位</th>
                <th className="px-3 text-right w-[68px] font-normal whitespace-nowrap">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E2DF]/60">
              {data.records.map((rec) => (
                <tr
                  key={rec.reportId}
                  onClick={() => {
                    if (rec.reportId && diagnosisContext) {
                      void diagnosisContext.openDiagnosisByReportId(rec.reportId);
                    }
                  }}
                  className="hover:bg-[#F7F7F6] transition-colors cursor-pointer group"
                >
                  <td
                    className="py-2.5 px-3 text-[12px] text-[#78716C] tabular-nums whitespace-nowrap"
                    title={rec.reportDate}
                  >
                    {formatShortDate(rec.reportDate)}
                  </td>
                  <WorkTitleCell
                    work={rec}
                    subtitle={showAccountName ? rec.accountName.trim() || null : null}
                    diagnosisContext={diagnosisContext}
                  />
                  <td className="py-2.5 px-2.5 text-right tabular-nums text-[#141413] whitespace-nowrap">
                    {formatBigNumber(rec.playCount)}
                  </td>
                  <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                    <span className="inline-block rounded-md bg-[#F1F1F0] px-1.5 text-[12px] font-normal text-[#1F1E1D]">
                      {rec.roles
                        .map((r) => (r === "writer" ? "文案" : r === "editor" ? "剪辑" : "运营"))
                        .join(" · ")}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    {rec.anomaly == null ||
                    rec.anomaly === "正常" ||
                    rec.anomaly === "normal" ? (
                      <span className="text-[#A8A29E]">—</span>
                    ) : (
                      <Badge
                        variant="danger"
                        className="px-1.5 py-0 text-[#78716C] before:bg-status-danger"
                      >
                        {formatAnomalyStatusText(rec.anomaly)}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
