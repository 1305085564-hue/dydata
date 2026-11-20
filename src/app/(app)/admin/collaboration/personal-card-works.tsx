"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import type { CollaborationDiagnosisContextValue } from "@/components/admin/collaboration-work-review-link";
import {
  InteractionBreakdownContent,
  OverallGradeBreakdownContent,
  RetentionBreakdownContent,
} from "@/components/admin/quality-tooltip-content";
import { BREAKOUT_GRADE_TEXT_CLASS } from "@/lib/breakout-rating";
import {
  getContentQualityStatusShortText,
  getContentQualityStatusText,
  type ContentQualityRules,
  type WorkContentQuality,
} from "@/lib/collaboration/content-quality-contract";
import { formatAnomalyStatusText } from "@/lib/video-anomaly";
import { OneTip } from "./one-tip";
import type { CollaborationRoleTab, OperatorAccount, PersonDetailData } from "./types";
import { formatBigNumber } from "./types";

/**
 * 个人档案的作品区：回答「他这个月交了什么，质量怎么样」。
 * - 每格只写结论（良/优/普、百分比），明细收进悬停，全页同一时刻只开一个；
 * - 缺数据的原因只在「综合评级」一格说一次，其余格写「—」；
 * - 「手工」不再挂标签，收进播放数的悬停里。
 */
interface PersonalCardWorksProps {
  data: PersonDetailData;
  activeTab?: CollaborationRoleTab;
  /** 运营负责的账号明细（来自主表，原运营表展开行） */
  operatorAccounts?: OperatorAccount[];
  diagnosisContext: CollaborationDiagnosisContextValue | null;
}

interface WorkRow {
  reportId: string;
  reportDate: string;
  accountName: string;
  title: string;
  playCount: number | null;
  dataSource?: "ai" | "manual" | null;
  contentQuality?: WorkContentQuality | null;
}

/** 作品都在本人同名的一个号上时不重复写账号名。 */
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

function topicLabel(q: WorkContentQuality | null | undefined): string | null {
  if (q?.topicKind === "dry_goods") return "干货";
  if (q?.topicKind === "review") return "复盘";
  if (q?.topicKind === "other") return "其他";
  return null;
}

const signal = "text-[#A8A29E]";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[14px] leading-[1.40] text-[#141413]">{title}</h3>
      {children}
    </section>
  );
}

function EmptyBlock({ children, danger = false }: { children: ReactNode; danger?: boolean }) {
  return (
    <div className={`rounded-xl bg-[#F1F1F0] px-4 py-6 text-center text-[13px] ${danger ? "text-status-danger-text" : "text-[#78716C]"}`}>
      {children}
    </div>
  );
}

function TitleCell({ work, subtitle }: { work: WorkRow; subtitle: string | null }) {
  const title = work.title || "未命名作品";
  return (
    <td className="py-2.5 px-3 min-w-0">
      <span title={title} className="block truncate text-[13px] leading-[1.40] text-[#1F1E1D] group-hover:text-[#141413]">
        {title}
      </span>
      {subtitle ? (
        <span title={subtitle} className="mt-1 block truncate text-[12px] leading-[1.50] text-[#78716C]">
          {subtitle}
        </span>
      ) : null}
    </td>
  );
}

function PlayCell({ work }: { work: WorkRow }) {
  const value = formatBigNumber(work.playCount);
  return (
    <td className="py-2.5 px-3 text-right tabular-nums text-[#141413]">
      {work.dataSource === "manual" ? (
        <OneTip tip="这条的数据是人工填写或改过的">
          <span className="cursor-default">{value}</span>
        </OneTip>
      ) : (
        value
      )}
    </td>
  );
}

function InteractionCell({ quality, playCount, rules }: { quality: WorkContentQuality | null | undefined; playCount: number | null; rules: ContentQualityRules | null | undefined }) {
  if (quality?.interactionAchievement == null) return <td className={`py-2.5 px-3 text-right ${signal}`}>—</td>;
  const text = `${Math.round(quality.interactionAchievement)}%`;
  const hasDetail = Boolean(quality.interactionMetrics || quality.interactionValue != null);
  return (
    <td className="py-2.5 px-3 text-right tabular-nums text-[#1F1E1D]">
      {hasDetail ? (
        <OneTip wide tip={<InteractionBreakdownContent quality={quality} playCount={playCount} rules={rules} />}>
          <span className="cursor-default">{text}</span>
        </OneTip>
      ) : (
        text
      )}
    </td>
  );
}

function RetentionCell({ quality, rules }: { quality: WorkContentQuality | null | undefined; rules: ContentQualityRules | null | undefined }) {
  if (quality?.contentAchievement == null) return <td className={`py-2.5 px-3 text-right ${signal}`}>—</td>;
  const text = `${Math.round(quality.contentAchievement)}%`;
  return (
    <td className="py-2.5 px-3 text-right tabular-nums text-[#1F1E1D]">
      {quality.retentionMetrics ? (
        <OneTip wide tip={<RetentionBreakdownContent quality={quality} rules={rules} />}>
          <span className="cursor-default">{text}</span>
        </OneTip>
      ) : (
        text
      )}
    </td>
  );
}

function GradeCell({ quality, playCount, rules }: { quality: WorkContentQuality | null | undefined; playCount: number | null; rules: ContentQualityRules | null | undefined }) {
  if (!quality?.overallGrade) {
    const status = quality?.status ?? "pending_snapshot";
    return (
      <td className="py-2.5 px-3 text-right">
        <OneTip tip={getContentQualityStatusText(status)}>
          <span className={`cursor-default text-[12px] ${signal}`}>{getContentQualityStatusShortText(status)}</span>
        </OneTip>
      </td>
    );
  }
  const graded = quality as WorkContentQuality & { overallGrade: NonNullable<WorkContentQuality["overallGrade"]> };
  return (
    <td className="py-2.5 px-3 text-right">
      <OneTip wide tip={<OverallGradeBreakdownContent quality={graded} playCount={playCount} rules={rules} />}>
        <span className={`cursor-default ${BREAKOUT_GRADE_TEXT_CLASS[graded.overallGrade]}`}>{graded.overallGrade}</span>
      </OneTip>
    </td>
  );
}

function rowProps(reportId: string, diagnosisContext: CollaborationDiagnosisContextValue | null) {
  if (!diagnosisContext) return { className: "group" };
  return {
    className: "group cursor-pointer transition-colors duration-150 hover:bg-[#F7F7F6]",
    onClick: () => void diagnosisContext.openDiagnosisByReportId(reportId),
  };
}

const headClass = "h-9 px-3 text-[12px] font-normal text-[#78716C] whitespace-nowrap";

/** 文案、达人：逐条作品 + 互动 / 留存 / 综合评级。 */
function QualityWorksTable({
  ownerName,
  works,
  rules,
  diagnosisContext,
}: {
  ownerName: string;
  works: WorkRow[];
  rules: ContentQualityRules | null | undefined;
  diagnosisContext: CollaborationDiagnosisContextValue | null;
}) {
  const showAccountName = shouldShowWorkAccountNames(ownerName, works);
  return (
    <Card className="overflow-hidden p-0 gap-0">
      <table className="w-full table-fixed text-[13px] tabular-nums">
        <colgroup>
          <col className="w-[64px]" />
          <col />
          <col className="w-[76px]" />
          <col className="w-[76px]" />
          <col className="w-[76px]" />
          <col className="w-[76px]" />
        </colgroup>
        <thead className="border-b border-[#E2E2DF]/60">
          <tr>
            <th className={`${headClass} text-left`}>日期</th>
            <th className={`${headClass} text-left`}>作品</th>
            <th className={`${headClass} text-right`}>播放</th>
            <th className={`${headClass} text-right`}>互动达成</th>
            <th className={`${headClass} text-right`}>留存达成</th>
            <th className={`${headClass} text-right`}>综合评级</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E2E2DF]/60">
          {works.map((work) => {
            const q = work.contentQuality;
            const subtitle = [showAccountName ? work.accountName.trim() : "", topicLabel(q) ?? ""]
              .filter(Boolean)
              .join(" · ");
            return (
              <tr key={work.reportId} {...rowProps(work.reportId, diagnosisContext)}>
                <td className="py-2.5 px-3 align-top text-[12px] text-[#1F1E1D]" title={work.reportDate}>
                  {formatShortDate(work.reportDate)}
                </td>
                <TitleCell work={work} subtitle={subtitle || null} />
                <PlayCell work={work} />
                <InteractionCell quality={q} playCount={work.playCount} rules={rules} />
                <RetentionCell quality={q} rules={rules} />
                <GradeCell quality={q} playCount={work.playCount} rules={rules} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

const ROLE_TEXT = { writer: "文案", editor: "剪辑", operator: "运营" } as const;

/** 运营、剪辑：经手作品 + 担任岗位 + 异常状态。 */
function InvolvedWorksTable({
  data,
  diagnosisContext,
}: {
  data: PersonDetailData;
  diagnosisContext: CollaborationDiagnosisContextValue | null;
}) {
  const showAccountName = shouldShowWorkAccountNames(data.name, data.records);
  return (
    <Card className="overflow-hidden p-0 gap-0">
      <table className="w-full table-fixed text-[13px] tabular-nums">
        <colgroup>
          <col className="w-[64px]" />
          <col />
          <col className="w-[80px]" />
          <col className="w-[112px]" />
          <col className="w-[80px]" />
        </colgroup>
        <thead className="border-b border-[#E2E2DF]/60">
          <tr>
            <th className={`${headClass} text-left`}>日期</th>
            <th className={`${headClass} text-left`}>作品</th>
            <th className={`${headClass} text-right`}>播放</th>
            <th className={`${headClass} text-left`}>担任岗位</th>
            <th className={`${headClass} text-right`}>状态</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E2E2DF]/60">
          {data.records.map((rec) => {
            const abnormal = rec.anomaly != null && rec.anomaly !== "正常" && rec.anomaly !== "normal";
            return (
              <tr key={rec.reportId} {...rowProps(rec.reportId, diagnosisContext)}>
                <td className="py-2.5 px-3 align-top text-[12px] text-[#1F1E1D]" title={rec.reportDate}>
                  {formatShortDate(rec.reportDate)}
                </td>
                <TitleCell work={rec} subtitle={showAccountName ? rec.accountName.trim() || null : null} />
                <PlayCell work={rec} />
                <td className="py-2.5 px-3 text-left text-[12px] text-[#78716C]">
                  {rec.roles.map((r) => ROLE_TEXT[r]).join(" · ")}
                </td>
                <td className="py-2.5 px-3 text-right text-[12px]">
                  {abnormal ? (
                    <span className="inline-flex items-center gap-1 text-status-danger-text">
                      <span className="size-1.5 rounded-full bg-status-danger" aria-hidden />
                      {formatAnomalyStatusText(rec.anomaly!)}
                    </span>
                  ) : (
                    <span className={signal}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

/** 运营负责的账号：原运营表展开行，挪进档案。 */
function OperatorAccountsTable({ accounts }: { accounts: OperatorAccount[] }) {
  return (
    <Card className="overflow-hidden p-0 gap-0">
      <table className="w-full table-fixed text-[13px] tabular-nums">
        <colgroup>
          <col className="w-[112px]" />
          <col />
          <col className="w-[72px]" />
          <col className="w-[88px]" />
          <col className="w-[80px]" />
        </colgroup>
        <thead className="border-b border-[#E2E2DF]/60">
          <tr>
            <th className={`${headClass} text-left`}>达人</th>
            <th className={`${headClass} text-left`}>账号</th>
            <th className={`${headClass} text-right`}>条数</th>
            <th className={`${headClass} text-right`}>总播放</th>
            <th className={`${headClass} text-right`}>导粉</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E2E2DF]/60">
          {accounts.map((acc) => (
            <tr key={acc.accountId}>
              <td className="py-2.5 px-3 truncate text-[#1F1E1D]">{acc.ownerName}</td>
              <td className="py-2.5 px-3 truncate text-[#1F1E1D]" title={acc.accountName}>{acc.accountName}</td>
              <td className="py-2.5 px-3 text-right text-[#141413]">{acc.reportCount}</td>
              <td className="py-2.5 px-3 text-right text-[#1F1E1D]">{formatBigNumber(acc.totalPlay)}</td>
              <td className="py-2.5 px-3 text-right text-[#1F1E1D]">{acc.totalFollowerConvert.toLocaleString("zh-CN")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function PersonalCardWorks({
  data,
  activeTab,
  operatorAccounts = [],
  diagnosisContext,
}: PersonalCardWorksProps) {
  if (activeTab === "writers") {
    const quality = data.writerQuality;
    const works = quality?.monthWorks ?? [];
    return (
      <Section title="本月作品">
        {!quality ? (
          <EmptyBlock>质量数据尚未接入</EmptyBlock>
        ) : quality.state === "error" ? (
          <EmptyBlock danger>作品明细没能载入，稍后重试</EmptyBlock>
        ) : works.length === 0 ? (
          <EmptyBlock>本月还没有署名文案的作品</EmptyBlock>
        ) : (
          <QualityWorksTable ownerName={data.name} works={works} rules={quality.rules} diagnosisContext={diagnosisContext} />
        )}
      </Section>
    );
  }

  if (activeTab === "talents") {
    return (
      <Section title="本月作品">
        {data.records.length === 0 ? (
          <EmptyBlock>本月还没有达人作品</EmptyBlock>
        ) : (
          <QualityWorksTable
            ownerName={data.name}
            works={data.records}
            rules={data.talentQuality?.rules}
            diagnosisContext={diagnosisContext}
          />
        )}
      </Section>
    );
  }

  return (
    <>
      {activeTab === "operators" && operatorAccounts.length > 0 && (
        <Section title="负责账号">
          <OperatorAccountsTable accounts={operatorAccounts} />
        </Section>
      )}
      <Section title="本月经手作品">
        {data.records.length === 0 ? (
          <EmptyBlock>本月还没有协同作品</EmptyBlock>
        ) : (
          <InvolvedWorksTable data={data} diagnosisContext={diagnosisContext} />
        )}
      </Section>
    </>
  );
}
