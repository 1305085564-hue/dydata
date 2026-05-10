import Link from "next/link";
import { ArrowLeft, TrendingUp, Eye, UserPlus, Repeat2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getApiErrorMessage } from "@/lib/violations/errors";
import { StatusBadge } from "../components/status-badge";
import { PassRateBadge } from "../components/pass-rate-badge";
import { ScreenshotGallery } from "../components/screenshot-gallery";
import { TestRecordForm } from "../components/test-record-form";
import {
  formatDateTime,
  getAccountName,
  getConfidenceLabel,
  getPassRate,
  getSubmitterName,
  getTeamName,
} from "../components/format";
import type {
  ViolationAccount,
  ViolationDetail,
  ViolationDetailResponse,
  ViolationTestRecord,
} from "../components/types";
import { StatsCard, StatsGrid } from "./components/stats-card";
import { DetailTabs } from "./components/detail-tabs";
import type { UsageRecordItem } from "./components/usage-timeline";
import type { EventItem } from "./components/event-list";

const FORMAT_META: Record<string, { label: string; className: string }> = {
  oral: { label: "口播", className: "bg-zinc-100 text-[#8AA8C7]" },
  visual: { label: "画面", className: "bg-zinc-100 text-[#D97757]" },
  mixed: { label: "混合", className: "bg-zinc-100 text-[#6FAA7D]" },
};

const PURPOSE_META: Record<string, { label: string; className: string }> = {
  violation: { label: "违规话术", className: "bg-zinc-100 text-[#C9604D]" },
  conversion: { label: "转化话术", className: "bg-zinc-100 text-[#6FAA7D]" },
};

type DetailRow = ViolationDetail & {
  purpose?: string | null;
  script_format?: string | null;
  total_views?: number | null;
  total_follows?: number | null;
  usage_count?: number | null;
  weighted_conversion_rate?: number | null;
};

async function loadCase(id: string): Promise<DetailRow | null> {
  const headerStore = await headers();
  const host = headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") ?? "http";
  const cookie = headerStore.get("cookie") ?? "";
  const response = await fetch(`${protocol}://${host}/api/violations/${id}`, {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(getApiErrorMessage(payload, "加载案例失败"));

  const detailPayload = payload as ViolationDetailResponse;
  return (detailPayload.case ?? detailPayload.data ?? null) as DetailRow | null;
}

async function loadConversionCase(id: string): Promise<DetailRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("violation_cases")
    .select(
      `
        *,
        submitter:profiles!violation_cases_submitted_by_fkey(id, name),
        team:teams(id, name)
      `,
    )
    .eq("id", id)
    .eq("is_deleted", false)
    .eq("purpose", "conversion")
    .maybeSingle();

  if (error || !data) return null;
  return data as DetailRow;
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
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
              通过率
            </div>
            <div className="mt-2 text-3xl font-semibold text-zinc-800">
              {rate === null ? "--" : `${rate}%`}
            </div>
          </div>
          <div className="text-xs font-semibold text-zinc-500">{getConfidenceLabel(total)}</div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-zinc-950 transition-[width] duration-500"
            style={{ width: `${rate ?? 0}%` }}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-zinc-50 px-3 py-2 font-semibold text-[#6FAA7D]">
            通过 {passCount}
          </div>
          <div className="rounded-lg bg-zinc-50 px-3 py-2 font-semibold text-[#C9604D]">
            未通过 {failCount}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-zinc-800">同事追加测试</h3>
        <div className="mt-3 space-y-2">
          {records.length ? (
            records.map((record) => (
              <div
                key={record.id}
                className="rounded-xl border border-zinc-200 bg-white p-3 text-sm transition-colors hover:border-zinc-300"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-zinc-800">{getRecordAccountName(record)}</span>
                  <span
                    className={
                      record.passed
                        ? "inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-[#6FAA7D]"
                        : "inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-[#C9604D]"
                    }
                  >
                    {record.passed ? "通过" : "未通过"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-zinc-500">
                  {getRecordTesterName(record)} · {formatDateTime(record.tested_at)}
                </div>
                {record.note ? (
                  <p className="mt-2 whitespace-pre-wrap leading-6 text-zinc-600">{record.note}</p>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 p-6 text-center text-sm text-zinc-500">
              暂无同事追加测试
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function ViolationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;

  let caseItem: DetailRow | null = null;
  let error: string | null = null;
  try {
    caseItem = await loadCase(id);
    if (!caseItem) {
      caseItem = await loadConversionCase(id);
    }
  } catch (loadError) {
    error = loadError instanceof Error ? loadError.message : "加载案例失败";
  }
  if (!caseItem && !error) notFound();

  let usageRecords: UsageRecordItem[] = [];
  let events: EventItem[] = [];
  if (caseItem) {
    [usageRecords, events] = await Promise.all([loadUsageRecords(caseItem.id), loadEvents(caseItem.id)]);
  }

  const { data } = await supabase
    .from("accounts")
    .select("id, name, content_direction")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: true });
  const accounts = (
    (data ?? []) as Array<{ id: string; name: string | null; content_direction: string | null }>
  ).map((account) => ({
    id: account.id,
    name: account.name ?? "未命名账号",
    display_name: account.name ?? "未命名账号",
    content_direction: account.content_direction,
  })) satisfies ViolationAccount[];

  if (error || !caseItem) {
    return (
      <div className="mx-auto max-w-5xl space-y-5 py-8">
        <Link
          href="/violations"
          className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 hover:text-zinc-800"
        >
          <ArrowLeft className="size-4" />
          话术库
        </Link>
        <div className="rounded-xl border border-zinc-200 border-l-[2px] border-l-[#D99E55] bg-zinc-50 p-5 text-sm leading-6 text-[#D99E55]">
          {error ?? "案例不存在"}
        </div>
      </div>
    );
  }

  const purpose = (caseItem.purpose ?? "violation") as string;
  const isConversion = purpose === "conversion";
  const formatKey = (caseItem.script_format ?? "oral") as string;
  const formatMeta = FORMAT_META[formatKey] ?? FORMAT_META.oral;
  const purposeMeta = PURPOSE_META[purpose] ?? PURPOSE_META.violation;
  const testRecords = caseItem.test_records ?? caseItem.violation_test_records ?? [];
  const passCount = caseItem.pass_count ?? 0;
  const failCount = caseItem.fail_count ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5 py-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/violations"
          className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 transition-colors hover:text-zinc-800"
        >
          <ArrowLeft className="size-4" />
          话术库
        </Link>
        {isConversion ? null : <TestRecordForm caseId={caseItem.id} accounts={accounts} />}
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {isConversion ? null : <StatusBadge caseItem={caseItem} />}
            {isConversion ? null : (
              <PassRateBadge passCount={caseItem.pass_count} failCount={caseItem.fail_count} />
            )}
            <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
              {caseItem.category || "其他"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${formatMeta.className}`}
            >
              {formatMeta.label}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${purposeMeta.className}`}
            >
              {purposeMeta.label}
            </span>
          </div>
        </div>

        <p className="mt-6 whitespace-pre-wrap text-lg font-semibold leading-7 tracking-wide text-zinc-800 sm:text-xl sm:leading-8">
          {caseItem.script_text}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500">
          <span>
            <span className="text-zinc-400">提交人 </span>
            <span className="font-semibold text-zinc-800">{getSubmitterName(caseItem)}</span>
          </span>
          <span className="text-zinc-200">·</span>
          <span>
            <span className="text-zinc-400">提交时间 </span>
            <span className="font-semibold text-zinc-800">{formatDateTime(caseItem.created_at)}</span>
          </span>
          <span className="text-zinc-200">·</span>
          <span>
            <span className="text-zinc-400">账号 </span>
            <span className="font-semibold text-zinc-800">{getAccountName(caseItem)}</span>
          </span>
          <span className="text-zinc-200">·</span>
          <span>
            <span className="text-zinc-400">团队 </span>
            <span className="font-semibold text-zinc-800">{getTeamName(caseItem)}</span>
          </span>
        </div>
      </section>

      {isConversion ? (
        <StatsGrid>
          <StatsCard
            label="Conversion Rate"
            value={formatConversionRate(caseItem)}
            hint="加权转化率"
            tone="positive"
            icon={<TrendingUp className="size-4" strokeWidth={2.25} />}
          />
          <StatsCard
            label="Total Views"
            value={formatCount(caseItem.total_views)}
            hint="累计展示"
            icon={<Eye className="size-4" strokeWidth={2.25} />}
          />
          <StatsCard
            label="Total Follows"
            value={formatCount(caseItem.total_follows)}
            hint="累计涨粉"
            tone="accent"
            icon={<UserPlus className="size-4" strokeWidth={2.25} />}
          />
          <StatsCard
            label="Usage Count"
            value={formatCount(caseItem.usage_count)}
            hint="复用次数"
            icon={<Repeat2 className="size-4" strokeWidth={2.25} />}
          />
        </StatsGrid>
      ) : (
        <StatsGrid>
          <StatsCard
            label="Pass Rate"
            value={(() => {
              const rate = getPassRate(caseItem);
              return rate === null ? "--" : `${rate}%`;
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
            icon={<CheckCircle2 className="size-4" strokeWidth={2.25} />}
          />
          <StatsCard label="通过" value={formatCount(passCount)} hint="累计通过" tone="positive" />
          <StatsCard label="未通过" value={formatCount(failCount)} hint="累计失败" tone="negative" />
          <StatsCard
            label="违规事件"
            value={formatCount(events.length)}
            hint="平台处罚次数"
            tone={events.length > 0 ? "negative" : "default"}
            icon={<ShieldAlert className="size-4" strokeWidth={2.25} />}
          />
        </StatsGrid>
      )}

      {caseItem.admin_conclusion || caseItem.suggested_action ? (
        <section className="grid gap-3 lg:grid-cols-2">
          {caseItem.admin_conclusion ? (
            <div className="rounded-xl border border-zinc-200 border-l-[2px] border-l-[#D99E55] bg-zinc-50 p-5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#D99E55]">
                管理员结论
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#D99E55]">
                {caseItem.admin_conclusion}
              </p>
            </div>
          ) : null}
          {caseItem.suggested_action ? (
            <div className="rounded-xl border border-zinc-200 border-l-[2px] border-l-[#6FAA7D] bg-zinc-50 p-5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6FAA7D]">
                建议动作
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#6FAA7D]">
                {caseItem.suggested_action}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {!isConversion && ((caseItem.screenshot_paths?.length ?? 0) > 0 || caseItem.scene_description || caseItem.result) ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {(caseItem.screenshot_paths?.length ?? 0) > 0 ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                截图
              </h2>
              <div className="mt-4">
                <ScreenshotGallery paths={caseItem.screenshot_paths ?? []} />
              </div>
            </div>
          ) : null}
          {caseItem.scene_description || caseItem.result ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                上下文
              </h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-zinc-600">
                <p>{caseItem.scene_description || "暂无配套画面/导粉方式描述"}</p>
                {caseItem.result ? (
                  <p className="font-semibold text-zinc-800">结果：{caseItem.result}</p>
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
    </div>
  );
}
