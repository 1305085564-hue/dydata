import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

async function loadCase(id: string) {
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
  return (detailPayload.case ?? detailPayload.data ?? null) as ViolationDetail | null;
}

function getRecordAccountName(record: ViolationTestRecord) {
  const account = Array.isArray(record.accounts) ? record.accounts[0] : record.accounts;
  return record.account_name_snapshot?.trim() || account?.name?.trim() || (record.account_id ? "关联账号" : "未关联账号");
}

function getRecordTesterName(record: ViolationTestRecord) {
  const tester = Array.isArray(record.tester) ? record.tester[0] : record.tester;
  const profile = Array.isArray(record.profiles) ? record.profiles[0] : record.profiles;
  return tester?.name?.trim() || profile?.name?.trim() || "同事";
}

export default async function ViolationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  let caseItem: ViolationDetail | null = null;
  let error: string | null = null;
  try {
    caseItem = await loadCase(id);
  } catch (loadError) {
    error = loadError instanceof Error ? loadError.message : "加载案例失败";
  }
  if (!caseItem && !error) notFound();

  const { data } = await supabase
    .from("accounts")
    .select("id, name, content_direction")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: true });
  const accounts = ((data ?? []) as Array<{ id: string; name: string | null; content_direction: string | null }>).map(
    (account) => ({
      id: account.id,
      name: account.name ?? "未命名账号",
      display_name: account.name ?? "未命名账号",
      content_direction: account.content_direction,
    }),
  ) satisfies ViolationAccount[];

  if (error || !caseItem) {
    return (
      <div className="mx-auto max-w-5xl space-y-5 py-8">
        <Link href="/violations" className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 hover:text-zinc-950">
          <ArrowLeft className="size-4" />
          返回违规库
        </Link>
        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
          {error ?? "案例不存在"}
        </div>
      </div>
    );
  }

  const passCount = caseItem.pass_count ?? 0;
  const failCount = caseItem.fail_count ?? 0;
  const testTotal = passCount + failCount;
  const passRate = getPassRate(caseItem);
  const records = caseItem.test_records ?? caseItem.violation_test_records ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/violations" className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 hover:text-zinc-950">
          <ArrowLeft className="size-4" />
          返回违规库
        </Link>
        <TestRecordForm caseId={caseItem.id} accounts={accounts} />
      </div>

      <section className="rounded-[1.75rem] border border-zinc-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <StatusBadge caseItem={caseItem} />
          <PassRateBadge passCount={caseItem.pass_count} failCount={caseItem.fail_count} />
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
            {caseItem.category || "其他"}
          </span>
        </div>
        <h1 className="whitespace-pre-wrap text-2xl font-black leading-10 tracking-tight text-zinc-950 sm:text-3xl">
          {caseItem.script_text}
        </h1>
        <div className="mt-6 grid gap-3 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl bg-zinc-50 p-3">
            <div className="text-xs font-semibold text-zinc-400">账号</div>
            <div className="mt-1 font-semibold text-zinc-900">{getAccountName(caseItem)}</div>
          </div>
          <div className="rounded-2xl bg-zinc-50 p-3">
            <div className="text-xs font-semibold text-zinc-400">团队</div>
            <div className="mt-1 font-semibold text-zinc-900">{getTeamName(caseItem)}</div>
          </div>
          <div className="rounded-2xl bg-zinc-50 p-3">
            <div className="text-xs font-semibold text-zinc-400">提交人</div>
            <div className="mt-1 font-semibold text-zinc-900">{getSubmitterName(caseItem)}</div>
          </div>
          <div className="rounded-2xl bg-zinc-50 p-3">
            <div className="text-xs font-semibold text-zinc-400">提交时间</div>
            <div className="mt-1 font-semibold text-zinc-900">{formatDateTime(caseItem.created_at)}</div>
          </div>
        </div>
      </section>

      {caseItem.admin_conclusion || caseItem.suggested_action ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {caseItem.admin_conclusion ? (
            <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5">
              <h2 className="text-sm font-black text-amber-950">管理员结论</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-amber-900">{caseItem.admin_conclusion}</p>
            </div>
          ) : null}
          {caseItem.suggested_action ? (
            <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-5">
              <h2 className="text-sm font-black text-emerald-950">建议动作</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-emerald-900">{caseItem.suggested_action}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <div className="rounded-[1.5rem] border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-black text-zinc-950">截图</h2>
            <div className="mt-4">
              <ScreenshotGallery paths={caseItem.screenshot_paths ?? []} />
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-black text-zinc-950">上下文</h2>
            <div className="mt-3 space-y-3 text-sm leading-7 text-zinc-600">
              <p>{caseItem.scene_description || "暂无配套画面/导粉方式描述"}</p>
              {caseItem.result ? <p className="font-semibold text-zinc-950">结果：{caseItem.result}</p> : null}
            </div>
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-[1.5rem] border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-black text-zinc-950">通过率</h2>
            <div className="mt-4">
              <div className="flex items-end justify-between">
                <div className="text-3xl font-black text-zinc-950">{passRate === null ? "--" : `${passRate}%`}</div>
                <div className="text-xs font-semibold text-zinc-500">{getConfidenceLabel(testTotal)}</div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100">
                <div className="h-full rounded-full bg-zinc-950" style={{ width: `${passRate ?? 0}%` }} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">通过 {passCount}</div>
                <div className="rounded-2xl bg-rose-50 p-3 text-rose-700">未通过 {failCount}</div>
              </div>
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-black text-zinc-950">测试记录</h2>
            <div className="mt-4 space-y-3">
              {records.length ? (
                records.map((record) => (
                  <div key={record.id} className="rounded-2xl bg-zinc-50 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-zinc-950">{getRecordAccountName(record)}</span>
                      <span className={record.passed ? "text-emerald-600" : "text-rose-600"}>
                        {record.passed ? "通过" : "未通过"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {getRecordTesterName(record)} · {formatDateTime(record.tested_at)}
                    </div>
                    {record.note ? <p className="mt-2 leading-6 text-zinc-600">{record.note}</p> : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-zinc-500">暂无同事追加测试。</p>
              )}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
