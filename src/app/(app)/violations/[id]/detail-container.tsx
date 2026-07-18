import Link from "next/link";
import { ArrowLeft, TrendingUp, Eye, UserPlus, Repeat2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PassRateBadge } from "../components/pass-rate-badge";
import {
  PromotionLevelChip,
  ReviewStatusChip,
  RiskLevelChip,
  UsageStateBadge,
} from "../components/case-state-badge";
import { ScreenshotGallery } from "../components/screenshot-gallery";
import { ConclusionCard } from "../components/conclusion-card";
import { TestRecordForm } from "../components/test-record-form";
import {
  formatDateTime,
  getAccountName,
  getConfidenceLabel,
  getPassRate,
  getSubmitterName,
  getTeamName,
} from "../components/format";
import { resolveConfidence } from "@/lib/case-library/confidence";
import { getSafeAccountDisplayName } from "@/lib/loaders/shared";
import { loadViolationCaseDetail, loadViolationCaseTestRecords } from "@/lib/violations/read-model";
import type {
  ViolationAccount,
  ViolationDetail,
  ViolationTestRecord,
} from "../components/types";
import { StatsCard, StatsGrid } from "./components/stats-card";
import { DetailTabs } from "./components/detail-tabs";
import { ReviewDecisionPanel } from "./components/review-decision-panel";
import type { UsageRecordItem } from "./components/usage-timeline";
import type { EventItem } from "./components/event-list";

const FORMAT_META: Record<string, { label: string; dotColor: string }> = {
  oral: { label: "口播", dotColor: "#8AA8C7" },
  visual: { label: "画面", dotColor: "#D97757" },
  mixed: { label: "混合", dotColor: "#6FAA7D" },
};

const PURPOSE_META: Record<string, { label: string; dotColor: string }> = {
  violation: { label: "违规话术", dotColor: "#C9604D" },
  conversion: { label: "转化话术", dotColor: "#6FAA7D" },
};

type DetailRow = ViolationDetail & {
  purpose?: string | null;
  script_format?: string | null;
  total_views?: number | null;
  total_follows?: number | null;
  usage_count?: number | null;
  weighted_conversion_rate?: number | null;
  usage_state?: string | null;
  promotion_level?: string | null;
  platforms?: string[] | null;
};

async function loadCase(id: string): Promise<DetailRow | null> {
  const { data, errorMessage } = await loadViolationCaseDetail({
    supabase: await createClient() as never,
    fallbackDetailClient: createAdminClient() as never,
    id,
  });
  if (errorMessage) throw new Error(errorMessage);
  return data as DetailRow | null;
}

async function loadUsageRecords(id: string): Promise<UsageRecordItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("script_usage_records")
    .select(
      `
        id, used_at, views, follows, conversion_rate, source, note,
        account_name_snapshot,
        account:accounts(id, name),
        recorder:profiles!script_usage_records_recorded_by_fkey(id, name)
      `,
    )
    .eq("case_id", id)
    .order("used_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];
  return data as UsageRecordItem[];
}

async function loadEvents(id: string): Promise<EventItem[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("violation_events")
    .select(
      `
        id, event_type, occurred_at, platform_notice, screenshot_paths,
        suspected_reason, appeal_status, appeal_result, recovered_at, note,
        account:accounts(id, name),
        reporter:profiles!violation_events_reported_by_fkey(id, name)
      `,
    )
    .eq("case_id", id)
    .order("occurred_at", { ascending: false })
    .limit(50);

  if (error || !data) return [];
  return data as EventItem[];
}

type ReasonTagBrief = { id: string; name: string };

async function loadReasonTags(id: string): Promise<ReasonTagBrief[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("violation_case_reason_tags")
    .select("tag:violation_reason_tags(id, name, sort_order)")
    .eq("case_id", id);
  if (error || !data) return [];
  type Row = { tag: { id: string; name: string; sort_order: number } | { id: string; name: string; sort_order: number }[] | null };
  return (data as Row[])
    .flatMap((row) => {
      const tag = Array.isArray(row.tag) ? row.tag[0] : row.tag;
      if (!tag) return [];
      return [{ id: tag.id, name: tag.name, sort_order: tag.sort_order }];
    })
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(({ id: tagId, name }) => ({ id: tagId, name }));
}

function getRecordAccountName(record: ViolationTestRecord) {
  const account = Array.isArray(record.accounts) ? record.accounts[0] : record.accounts;
  return (
    record.account_name_snapshot?.trim() ||
    account?.name?.trim() ||
    (record.account_id ? "关联账号" : "未关联账号")
  );
}

function getRecordTesterName(record: ViolationTestRecord) {
  const tester = Array.isArray(record.tester) ? record.tester[0] : record.tester;
  const profile = Array.isArray(record.profiles) ? record.profiles[0] : record.profiles;
  return tester?.name?.trim() || profile?.name?.trim() || "同事";
}

function formatCount(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("zh-CN").format(n);
}

function formatConversionRate(caseItem: DetailRow): string {
  const weighted = caseItem.weighted_conversion_rate;
  if (typeof weighted === "number" && Number.isFinite(weighted)) {
    return `${(weighted * 100).toFixed(2)}%`;
  }
  const views = Number(caseItem.total_views ?? 0);
  const follows = Number(caseItem.total_follows ?? 0);
  if (views <= 0) return "0.00%";
  return `${((follows / views) * 100).toFixed(2)}%`;
}

function TestsSummary({ caseItem, records }: { caseItem: DetailRow; records: ViolationTestRecord[] }) {
  const passCount = caseItem.pass_count ?? 0;
  const failCount = caseItem.fail_count ?? 0;
  const total = passCount + failCount;
  const rate = getPassRate(caseItem);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
              通过率
            </div>
            <div className="mt-2 text-[24px] font-semibold tabular-nums text-stone-900">
              {rate === null ? "—" : `${rate}%`}
            </div>
          </div>
          <div className="text-[12px] font-medium text-stone-500">{getConfidenceLabel(total)}</div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-[#D97757] transition-[width] duration-500"
            style={{ width: `${rate ?? 0}%` }}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-stone-50 px-3 py-2 text-[13px] font-medium text-[#6FAA7D]">
            通过 {passCount}
          </div>
          <div className="rounded-lg bg-stone-50 px-3 py-2 text-[13px] font-medium text-[#C9604D]">
            未通过 {failCount}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-[18px] font-medium text-stone-900">同事追加测试</h3>
        <div className="mt-3 space-y-2">
          {records.length ? (
            records.map((record) => (
              <div
                key={record.id}
                className="rounded-xl border border-stone-200 bg-white p-3 text-[13px] transition-colors hover:border-stone-300"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-stone-900">{getRecordAccountName(record)}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-2 py-0.5 text-[12px] font-medium text-stone-700">
                    <span className={`size-1.5 rounded-full ${record.passed ? "bg-[#6FAA7D]" : "bg-[#C9604D]"}`} />
                    {record.passed ? "通过" : "未通过"}
                  </span>
                </div>
                <div className="mt-1 text-[12px] text-stone-500">
                  {getRecordTesterName(record)} · {formatDateTime(record.tested_at)}
                </div>
                {record.note ? (
                  <p className="mt-2 whitespace-pre-wrap leading-[1.6] text-stone-700">{record.note}</p>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50/60 p-6 text-center text-[13px] text-stone-500">
              暂无同事追加测试
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

async function TestRecordFormLoader({ caseId, user }: { caseId: string; user: User }) {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();
  const userDisplayName =
    profile?.name?.trim() || user.email?.split("@")[0] || "我";

  const { data } = await supabase
    .from("accounts")
    .select("id, name, content_direction")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: true });
  const rawAccounts = (data ?? []) as Array<{
    id: string;
    name: string | null;
    content_direction: string | null;
  }>;
  const accounts = rawAccounts.map((account, index, list) => ({
    id: account.id,
    name: account.name ?? "未命名账号",
    display_name: getSafeAccountDisplayName({
      rawName: account.name,
      userDisplayName,
      contentDirection: account.content_direction,
      index,
      total: list.length,
    }),
    content_direction: account.content_direction,
  })) satisfies ViolationAccount[];

  return <TestRecordForm caseId={caseId} accounts={accounts} />;
}

async function CaseDetailBottom({
  caseItem,
  canManageViolations,
  isOwner,
}: {
  caseItem: DetailRow;
  canManageViolations: boolean;
  isOwner: boolean;
}) {
  const [usageRecords, events, reasonTags, testRecordResult] = await Promise.all([
    loadUsageRecords(caseItem.id),
    loadEvents(caseItem.id),
    loadReasonTags(caseItem.id),
    loadViolationCaseTestRecords({
      supabase: createAdminClient() as never,
      caseId: caseItem.id,
    }),
  ]);

  const purpose = (caseItem.purpose ?? "violation") as string;
  const isConversion = purpose === "conversion";
  const testRecords = testRecordResult.data ?? [];
  const passCount = caseItem.pass_count ?? 0;
  const failCount = caseItem.fail_count ?? 0;

  return (
    <>
      {isConversion && Array.isArray(caseItem.platforms) && caseItem.platforms.length > 0 ? (
        <div className="flex items-center gap-2 text-[12px] text-stone-500">
          <span className="text-stone-500">平台</span>
          <div className="flex flex-wrap gap-1.5">
            {caseItem.platforms.map((platform) => (
              <span
                key={platform}
                className="rounded-lg border border-stone-200 px-2.5 py-0.5 text-[12px] font-normal text-stone-700"
              >
                {platform}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {isConversion ? (
        <StatsGrid>
          <StatsCard
            label="Conversion Rate"
            value={formatConversionRate(caseItem)}
            hint={resolveConfidence(Number(caseItem.total_views ?? 0)).label}
            tone="positive"
            icon={<TrendingUp className="size-4" strokeWidth={1.5} />}
          />
          <StatsCard
            label="Total Views"
            value={formatCount(caseItem.total_views)}
            hint="累计展示"
            icon={<Eye className="size-4" strokeWidth={1.5} />}
          />
          <StatsCard
            label="Total Follows"
            value={formatCount(caseItem.total_follows)}
            hint="累计涨粉"
            tone="accent"
            icon={<UserPlus className="size-4" strokeWidth={1.5} />}
          />
          <StatsCard
            label="Usage Count"
            value={formatCount(caseItem.usage_count)}
            hint="复用次数"
            icon={<Repeat2 className="size-4" strokeWidth={1.5} />}
          />
        </StatsGrid>
      ) : (
        <StatsGrid>
          <StatsCard
            label="Pass Rate"
            value={(() => {
              const rate = getPassRate(caseItem);
              return rate === null ? "—" : `${rate}%`;
            })()}
            hint={getConfidenceLabel(passCount + failCount)}
            tone={
              getPassRate(caseItem) === null
                ? "default"
                : (getPassRate(caseItem) ?? 0) >= 80
                  ? "positive"
                  : (getPassRate(caseItem) ?? 0) >= 50
                    ? "accent"
                    : "negative"
            }
            icon={<CheckCircle2 className="size-4" strokeWidth={1.5} />}
          />
          <StatsCard label="通过" value={formatCount(passCount)} hint="累计通过" tone="positive" />
          <StatsCard label="未通过" value={formatCount(failCount)} hint="累计失败" tone="negative" />
          <StatsCard
            label="违规事件"
            value={formatCount(events.length)}
            hint="平台处罚次数"
            tone={events.length > 0 ? "negative" : "default"}
            icon={<ShieldAlert className="size-4" strokeWidth={1.5} />}
          />
        </StatsGrid>
      )}

      {canManageViolations ? (
        <ReviewDecisionPanel
          caseId={caseItem.id}
          purpose={isConversion ? "conversion" : "violation"}
          initialStatus={caseItem.status}
          initialUsageState={caseItem.usage_state}
          initialRiskLevel={caseItem.risk_level}
          initialPromotionLevel={caseItem.promotion_level}
          initialAdminConclusion={caseItem.admin_conclusion}
          initialSuggestedAction={caseItem.suggested_action}
          initialReasonTagIds={reasonTags.map((tag) => tag.id)}
          isOwner={isOwner}
        />
      ) : null}

      <ConclusionCard
        reasonTags={reasonTags}
        adminConclusion={caseItem.admin_conclusion}
        suggestedAction={caseItem.suggested_action}
      />

      {!isConversion && ((caseItem.screenshot_paths?.length ?? 0) > 0 || caseItem.scene_description || caseItem.result) ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {(caseItem.screenshot_paths?.length ?? 0) > 0 ? (
            <div className="rounded-xl border border-stone-200 bg-white p-5">
              <h2 className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
                截图
              </h2>
              <div className="mt-4">
                <ScreenshotGallery paths={caseItem.screenshot_paths ?? []} compact />
              </div>
            </div>
          ) : null}
          {caseItem.scene_description || caseItem.result ? (
            <div className="rounded-xl border border-stone-200 bg-white p-5">
              <h2 className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
                上下文
              </h2>
              <div className="mt-3 space-y-3 text-[13px] leading-[1.7] text-stone-700">
                <p>{caseItem.scene_description || "暂无配套画面/导粉方式描述"}</p>
                {caseItem.result ? (
                  <p className="text-stone-700">结果：{caseItem.result}</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <DetailTabs
        purpose={purpose}
        usageRecords={usageRecords}
        events={events}
        testsSlot={<TestsSummary caseItem={caseItem} records={testRecords} />}
      />
    </>
  );
}

interface DetailContainerProps {
  id: string;
  user: User;
  isOwner: boolean;
  canManageViolations: boolean;
}

export async function DetailContainer({
  id,
  user,
  isOwner,
  canManageViolations,
}: DetailContainerProps) {
  let caseItem: DetailRow | null = null;
  try {
    caseItem = await loadCase(id);
  } catch {
    notFound();
  }

  if (!caseItem) {
    notFound();
  }

  const isConversion = ((caseItem.purpose ?? "violation") as string) === "conversion";
  const formatKey = (caseItem.script_format ?? "oral") as string;
  const formatMeta = FORMAT_META[formatKey] ?? FORMAT_META.oral;
  const purposeMeta = PURPOSE_META[(caseItem.purpose ?? "violation") as string] ?? PURPOSE_META.violation;

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/violations"
          className="inline-flex items-center gap-2 text-[12px] font-medium text-stone-500 transition-colors hover:text-stone-700 active:translate-y-0"
        >
          <ArrowLeft className="size-4 stroke-[1.5]" />
          话术库
        </Link>
        {isConversion ? null : (
          <Suspense fallback={<div className="h-11 w-28 rounded-xl bg-stone-100" />}>
            <TestRecordFormLoader caseId={caseItem.id} user={user} />
          </Suspense>
        )}
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {isConversion ? null : <UsageStateBadge usageState={caseItem.usage_state} size="lg" />}
            {isConversion ? null : (
              <PassRateBadge passCount={caseItem.pass_count} failCount={caseItem.fail_count} />
            )}
            <span className="inline-flex items-center rounded-lg border border-stone-200 px-2 py-0.5 text-[12px] font-medium text-stone-700">
              {caseItem.category || "其他"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-2 py-0.5 text-[12px] font-medium text-stone-700">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: formatMeta.dotColor }} />
              {formatMeta.label}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-2 py-0.5 text-[12px] font-medium text-stone-700">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: purposeMeta.dotColor }} />
              {purposeMeta.label}
            </span>
          </div>
        </div>

        <p className="mt-6 whitespace-pre-wrap text-[18px] font-medium leading-[1.6] text-stone-900">
          {caseItem.script_text}
        </p>

        {isConversion ? null : (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ReviewStatusChip status={caseItem.status} />
            <RiskLevelChip riskLevel={caseItem.risk_level} />
            <PromotionLevelChip promotionLevel={caseItem.promotion_level} />
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-stone-500">
          <span>
            <span className="text-stone-500">提交人 </span>
            <span className="font-medium text-stone-700">{getSubmitterName(caseItem)}</span>
          </span>
          <span className="text-stone-500">·</span>
          <span>
            <span className="text-stone-500">提交时间 </span>
            <span className="font-medium text-stone-700">{formatDateTime(caseItem.created_at)}</span>
          </span>
          <span className="text-stone-500">·</span>
          <span>
            <span className="text-stone-500">账号 </span>
            <span className="font-medium text-stone-700">{getAccountName(caseItem)}</span>
          </span>
          <span className="text-stone-500">·</span>
          <span>
            <span className="text-stone-500">团队 </span>
            <span className="font-medium text-stone-700">{getTeamName(caseItem)}</span>
          </span>
        </div>
      </section>

      <Suspense
        fallback={
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-stone-200 bg-white p-5 space-y-2">
                  <div className="h-4 w-20 rounded bg-stone-100" />
                  <div className="h-8 w-16 rounded bg-stone-100" />
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
              <div className="h-5 w-32 rounded bg-stone-100" />
              <div className="h-24 rounded bg-stone-100" />
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
              <div className="h-8 w-full rounded bg-stone-100" />
              <div className="h-32 rounded bg-stone-100" />
            </div>
          </div>
        }
      >
        <CaseDetailBottom caseItem={caseItem} canManageViolations={canManageViolations} isOwner={isOwner} />
      </Suspense>
    </>
  );
}
