import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CollaborationWorkReviewLink } from "@/components/admin/collaboration-work-review-link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ItemHeading } from "@/components/ui/item-heading";
import { formatBigNumber } from "@/app/(app)/admin/collaboration/types";
import { BREAKOUT_GRADE_TEXT_CLASS, type BreakoutGrade } from "@/lib/breakout-rating";
import { loadPersonProfileData } from "@/lib/collaboration/data/person-profile-loader";
import type {
  PersonMonthTrendRow,
  PersonProfileRole,
  PersonProfileWork,
  PersonStrengthRow,
} from "@/lib/collaboration/domain/person-profile-rules";
import { resolveCollaborationScope } from "@/lib/data-access-scope";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { getCurrentUserContext } from "@/lib/current-user-context";
import { resolveMembershipStatusFromQuery } from "@/lib/member-lifecycle";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatShanghaiDateOnly, isUuidLike } from "@/lib/loaders/shared";
import { formatAnomalyStatusText } from "@/lib/video-anomaly";
import { CopyProfileLinkButton } from "./copy-profile-link-button";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "成员主页 - DYData",
  description: "成员成长档案：本月表现、近 6 个月走势、擅长题材、代表作与最近状态。",
};

const ROLE_LABELS: Record<PersonProfileRole, string> = {
  talent: "达人",
  writer: "文案",
  editor: "剪辑",
  operator: "运营",
};

/** 百分比展示：2 位小数内，缺值一律「—」，不折算成 0%。 */
function formatPercent(value: number | null) {
  return value == null ? "—" : `${Number((value * 100).toFixed(2))}%`;
}

function formatPlay(value: number | null) {
  return value == null ? "—" : formatBigNumber(value);
}

function formatAvgPlay(value: number | null) {
  return value == null ? "—" : formatBigNumber(value);
}

function formatGrade(grade: BreakoutGrade | null) {
  return grade ? (
    <span className={`font-normal ${BREAKOUT_GRADE_TEXT_CLASS[grade]}`}>综合{grade}</span>
  ) : (
    <span className="text-[#A8A29E]">—</span>
  );
}

function NoticeCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto w-full max-w-2xl pt-12">
      <div className="space-y-3 rounded-xl border border-[#E2E2DF]/60 bg-[#F1F1F0]/40 p-8 text-center">
        <div className="text-[14px] font-medium text-[#141413]">{title}</div>
        <p className="text-[14px] text-[#78716C]">{description}</p>
        <Link
          href="/admin/collaboration"
          className="inline-block text-[14px] text-[#D97757] hover:underline"
        >
          返回数据管理 ↗
        </Link>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E2E2DF]/60 bg-[#F1F1F0]/40 px-4 py-3">
      <div className="text-[12px] text-[#78716C]">{label}</div>
      <div className="mt-1 text-[20px] font-normal tabular-nums text-[#141413]">{value}</div>
    </div>
  );
}

function Section({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <ItemHeading as="h2">{title}</ItemHeading>
        {extra}
      </div>
      {children}
    </section>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-[#E2E2DF]/60 bg-[#F1F1F0]/40 p-6 text-center text-[12px] text-[#78716C]">
      {text}
    </div>
  );
}

/** 数值格后的迷你横条：宽度按该列 6 个月最大值归一化，纯样式、不参与口径。 */
function MiniBar({ value, max }: { value: number | null; max: number }) {
  if (value == null || value <= 0 || max <= 0) return <div className="mt-1 h-1" />;
  return (
    <div
      className="mt-1 h-1 rounded-full bg-[#D97757]/30"
      style={{ width: `${Math.max(8, (value / max) * 100)}%` }}
    />
  );
}

function rowMax(rows: Array<number | null>): number {
  return rows.reduce<number>((max, value) => (value != null && value > max ? value : max), 0);
}

export default async function PersonProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const { supabase: sessionSupabase, user } = await getCurrentUserContext();
  if (!user) redirect("/login");

  if (!isUuidLike(userId)) {
    return (
      <NoticeCard title="链接不正确" description="这个成员主页链接无法识别，请从站内点人名进入。" />
    );
  }

  // 归档账号收口：/people 不在中间件 matcher（与 /topics 同款做法：由页面自查账号状态），
  // 否则已归档但会话仍有效的账号可继续打开成员档案。判定口径复用中间件同一函数，避免两边不一致。
  const { data: selfProfile, error: selfProfileError } = await sessionSupabase
    .from("profiles")
    .select("membership_status")
    .eq("id", user.id)
    .maybeSingle();
  const membershipStatus = resolveMembershipStatusFromQuery({
    data: selfProfile,
    error: selfProfileError,
  });
  if (membershipStatus !== "active") {
    const archived = membershipStatus === "archived";
    return (
      <NoticeCard
        title={archived ? "账号已归档" : "暂时无法确认账号状态"}
        description={
          archived
            ? "你的账号已归档，请联系负责人恢复后再查看成员档案。"
            : "账号状态暂时读不到，请稍后重试。"
        }
      />
    );
  }

  const context = await getCurrentPermissionContext();
  if (!context) redirect("/login");
  // 数据管理只读模块同款内部管理通道：登录身份受数据库"只能看自己"的行级权限限制，
  // 跨成员读数必须走管理通道（个人档案抽屉同款）；可见范围仍由 resolveCollaborationScope + visibleUserIds 门禁唯一判定。
  const supabase = createAdminClient();
  const { visibleUserIds } = await resolveCollaborationScope(supabase, context.scope);
  if (!visibleUserIds.includes(userId)) {
    return (
      <NoticeCard
        title="无权查看"
        description="你没有查看这位成员主页的权限，只能查看自己或本公司可见成员的成长档案。"
      />
    );
  }

  const data = await loadPersonProfileData({
    supabase,
    visibleUserIds,
    targetUserId: userId,
    today: formatShanghaiDateOnly(),
  });
  if (!data) {
    return <NoticeCard title="成员不存在" description="找不到这位成员的成长档案。" />;
  }

  const { person, monthSummary, trend, strengths, topWorks, anomalies } = data;
  const roleTags = (Object.keys(ROLE_LABELS) as PersonProfileRole[]).filter((role) => person.roles[role]);
  const maxima = {
    reportCount: rowMax(trend.map((row) => row.reportCount)),
    avgPlay: rowMax(trend.map((row) => row.avgPlay)),
    goodRate: rowMax(trend.map((row) => row.goodRate)),
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 py-4">
      {/* 1. 人物头部 */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-[#E2E2DF]/60 pb-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-normal text-[20px] text-[#1F1E1D]">{person.name}</h1>
            {person.membershipStatus !== "active" && (
              <Badge variant="secondary" className="text-[12px]">
                已归档
              </Badge>
            )}
          </div>
          <div className="text-[12px] text-[#78716C]">
            {[person.teamName ?? "未分配团队", ...person.workGroupNames].join(" · ")}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {roleTags.length > 0 ? (
              roleTags.map((role) => (
                <span
                  key={role}
                  className="rounded-md bg-[#F1F1F0] px-2 py-0.5 text-[12px] text-[#1F1E1D]"
                >
                  {ROLE_LABELS[role]}
                </span>
              ))
            ) : (
              <span className="text-[12px] text-[#A8A29E]">近 6 个月暂无岗位署名作品</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1 sm:pt-0">
          <CopyProfileLinkButton userId={person.userId} />
          <Link
            href="/admin/collaboration"
            className="inline-flex items-center rounded-md border border-[#E2E2DF] bg-white px-2.5 py-1 text-[12px] font-normal text-[#1F1E1D] transition-colors hover:bg-[#F1F1F0] hover:text-[#141413]"
          >
            返回数据管理 ↗
          </Link>
        </div>
      </header>

      {/* 2. 本月成绩单 */}
      <Section
        title="本月成绩单"
        extra={
          <span className="text-[12px] text-[#78716C] tabular-nums">
            已评级 {monthSummary.ratedCount} 篇 · 有快照 {monthSummary.snapshotCount} 篇
          </span>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MetricCard label="作品数" value={String(monthSummary.reportCount)} />
          <MetricCard
            label="总播放"
            value={monthSummary.snapshotCount > 0 ? formatBigNumber(monthSummary.totalPlay) : "—"}
          />
          <MetricCard
            label="条均播放"
            value={monthSummary.snapshotCount > 0 ? formatAvgPlay(monthSummary.avgPlay) : "—"}
          />
          <MetricCard label="互动率" value={formatPercent(monthSummary.interactionRate)} />
          <MetricCard label="转粉率" value={formatPercent(monthSummary.followerConversionRate)} />
          <MetricCard label="良优率" value={formatPercent(monthSummary.goodRate)} />
        </div>
      </Section>

      {/* 3. 成长走势（近 6 个月） */}
      <Section title="成长走势 · 近 6 个月">
        <Card className="scroll-shadow-horizontal gap-0 overflow-x-auto p-0">
          <table className="w-full min-w-[520px] table-fixed text-[12px]">
            <thead className="border-b border-[#E2E2DF]/60 bg-transparent text-left text-[14px] font-normal text-[#78716C]">
              <tr>
                <th className="w-[96px] shrink-0 px-3 py-2.5 font-normal">月份</th>
                <th className="px-3 py-2.5 font-normal">作品数</th>
                <th className="px-3 py-2.5 font-normal">条均播放</th>
                <th className="px-3 py-2.5 font-normal">良优率</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E2DF]/60">
              {trend.map((row: PersonMonthTrendRow) => (
                <tr key={row.month}>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[#78716C]">{row.month}</td>
                  <td className="px-3 py-2">
                    <div className="tabular-nums text-[#1F1E1D]">{row.reportCount}</div>
                    <MiniBar value={row.reportCount} max={maxima.reportCount} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="tabular-nums text-[#1F1E1D]">{formatAvgPlay(row.avgPlay)}</div>
                    <MiniBar value={row.avgPlay} max={maxima.avgPlay} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="tabular-nums text-[#1F1E1D]">
                      {formatPercent(row.goodRate)}
                      <span className="ml-1 text-[12px] text-[#A8A29E]">/ {row.ratedCount} 篇已评级</span>
                    </div>
                    <MiniBar value={row.goodRate} max={maxima.goodRate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Section>

      {/* 4. 擅长什么 */}
      <Section title="擅长什么 · 按题材">
        {strengths.length === 0 ? (
          <EmptyRow text="还没有作品记录" />
        ) : (
          <Card className="scroll-shadow-horizontal gap-0 overflow-x-auto p-0">
            <table className="w-full min-w-[480px] table-fixed text-[12px]">
              <thead className="border-b border-[#E2E2DF]/60 bg-transparent text-left text-[14px] font-normal text-[#78716C]">
                <tr>
                  <th className="px-3 py-2.5 font-normal">题材</th>
                  <th className="w-[96px] shrink-0 px-3 py-2.5 text-right font-normal">作品数</th>
                  <th className="w-[110px] shrink-0 px-3 py-2.5 text-right font-normal">条均播放</th>
                  <th className="w-[110px] shrink-0 px-3 py-2.5 text-right font-normal">良优率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E2DF]/60">
                {strengths.map((row: PersonStrengthRow) => (
                  <tr key={row.subject ?? "未标注"}>
                    <td className="px-3 py-2 text-[#1F1E1D]">{row.subject ?? "未标注"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1F1E1D]">{row.reportCount}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1F1E1D]">
                      {formatAvgPlay(row.avgPlay)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#1F1E1D]">
                      {formatPercent(row.goodRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>

      {/* 5. 代表作 */}
      <Section
        title="代表作"
        extra={<span className="text-[12px] text-[#78716C]">评级最优的 {topWorks.length} 篇</span>}
      >
        {topWorks.length === 0 ? (
          <EmptyRow text="还没有作品记录" />
        ) : (
          <Card className="scroll-shadow-horizontal gap-0 overflow-x-auto p-0">
            <table className="w-full min-w-[520px] table-fixed text-[12px]">
              <thead className="border-b border-[#E2E2DF]/60 bg-transparent text-left text-[14px] font-normal text-[#78716C]">
                <tr>
                  <th className="w-[84px] shrink-0 px-3 py-2.5 font-normal">日期</th>
                  <th className="px-3 py-2.5 font-normal">账号 / 作品标题</th>
                  <th className="w-[80px] shrink-0 px-2.5 py-2.5 text-right font-normal">播放量</th>
                  <th className="w-[90px] shrink-0 px-3 py-2.5 text-right font-normal">综合评级</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E2DF]/60">
                {topWorks.map((work: PersonProfileWork) => (
                  <tr key={work.reportId} className="group">
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[#78716C]">
                      {work.workDate}
                    </td>
                    <td className="min-w-0 px-3 py-2">
                      <div className="truncate font-normal text-[#1F1E1D]" title={work.accountName}>
                        {work.accountName}
                      </div>
                      <CollaborationWorkReviewLink
                        reportId={work.reportId}
                        preview={{
                          title: work.title,
                          accountName: work.accountName,
                          playCount: work.playCount,
                          reportDate: work.workDate,
                        }}
                        className="block min-w-0 truncate text-left text-[12px] text-[#78716C] group-hover:text-[#141413] group-hover:underline"
                      >
                        {work.title}
                      </CollaborationWorkReviewLink>
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2 text-right tabular-nums text-[#1F1E1D]">
                      {formatPlay(work.playCount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">{formatGrade(work.overallGrade)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </Section>

      {/* 6. 最近状态 */}
      <Section title="最近状态">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-medium text-[#141413]">异常作品</span>
            <span className="text-[12px] tabular-nums text-[#78716C]">共 {anomalies.length} 篇</span>
          </div>
          {anomalies.length === 0 ? (
            <EmptyRow text="暂无异常作品" />
          ) : (
            <Card className="scroll-shadow-horizontal gap-0 overflow-x-auto p-0">
              <table className="w-full min-w-[420px] table-fixed text-[12px]">
                <thead className="border-b border-[#E2E2DF]/60 bg-transparent text-left text-[14px] font-normal text-[#78716C]">
                  <tr>
                    <th className="w-[84px] shrink-0 px-3 py-2.5 font-normal">日期</th>
                    <th className="px-3 py-2.5 font-normal">作品标题</th>
                    <th className="w-[90px] shrink-0 px-3 py-2.5 text-right font-normal">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E2DF]/60">
                  {anomalies.map((work: PersonProfileWork) => (
                    <tr key={work.reportId} className="group">
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-[#78716C]">
                        {work.workDate}
                      </td>
                      <td className="min-w-0 px-3 py-2">
                        <CollaborationWorkReviewLink
                          reportId={work.reportId}
                          preview={{
                            title: work.title,
                            accountName: work.accountName,
                            playCount: work.playCount,
                            reportDate: work.workDate,
                          }}
                          className="block min-w-0 truncate text-left text-[12px] text-[#78716C] group-hover:text-[#141413] group-hover:underline"
                        >
                          {work.title}
                        </CollaborationWorkReviewLink>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <Badge
                          variant="secondary"
                          className="bg-[#F1F1F0] px-1.5 py-0 text-[12px] text-[#1F1E1D]"
                        >
                          {formatAnomalyStatusText(work.anomaly)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      </Section>
    </div>
  );
}
