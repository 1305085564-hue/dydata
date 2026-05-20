"use client";

import Link from "next/link";

import { ViolationsReviewList, type ViolationReviewCase } from "@/app/(app)/admin/violations/review-list";

export type StatusFilter = "submitted" | "all" | "verified" | "rejected" | "archived";

export interface ViolationsTabData {
  cases: ViolationReviewCase[];
  pendingCount: number;
  status: StatusFilter;
  category: string;
  keyword: string;
  errorMessage?: string;
}

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "submitted", label: "待复核" },
  { value: "all", label: "全部" },
  { value: "verified", label: "已确认" },
  { value: "rejected", label: "已驳回" },
  { value: "archived", label: "已归档" },
];

const CATEGORY_OPTIONS = ["全部", "下粉", "直播", "短视频", "其他"] as const;

function buildFilterHref(
  basePath: string,
  extra: Record<string, string>,
  params: { status: StatusFilter; category: string; keyword: string },
) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(extra)) sp.set(k, v);
  sp.set("tab", "violations");
  if (params.status !== "submitted") sp.set("status", params.status);
  if (params.category && params.category !== "全部") sp.set("category", params.category);
  if (params.keyword) sp.set("q", params.keyword);
  return `${basePath}?${sp.toString()}`;
}

export function ViolationsReviewTab({
  data,
  basePath = "/admin/conversion-hub",
  extraQueryParams,
}: {
  data: ViolationsTabData;
  basePath?: string;
  extraQueryParams?: Record<string, string>;
}) {
  const { cases, pendingCount, status, category, keyword, errorMessage } = data;
  const extra = extraQueryParams ?? {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center border-l-2 border-[#D97757] pl-3">
          <h2 className="text-[24px] font-semibold tracking-tight text-zinc-800">案例复核</h2>
          <span className="ml-3 text-[12px] text-zinc-500">
            当前筛选 <span className="font-mono tabular-nums text-zinc-700">{pendingCount}</span> 条
          </span>
        </div>
      </div>

      <form
        className="grid gap-2 rounded-2xl border border-zinc-200 bg-white p-4 lg:grid-cols-[1fr_auto_auto_auto]"
        action={basePath}
        method="get"
      >
        {Object.entries(extra).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <input type="hidden" name="tab" value="violations" />
        <input type="hidden" name="status" value={status} />
        <input
          name="q"
          defaultValue={keyword}
          placeholder="搜索话术原文"
          className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-[13px] outline-none transition-[border-color] duration-150 focus:border-zinc-400"
        />
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={buildFilterHref(basePath, extra, { status: option.value, category, keyword })}
              className={
                status === option.value
                  ? "rounded-xl border border-[#D97757]/40 bg-[#D97757]/10 px-3 py-1.5 text-[12px] font-medium text-[#D97757]"
                  : "rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-600 transition-[background-color,color] duration-150 hover:bg-zinc-50 hover:text-zinc-800"
              }
            >
              {option.label}
            </Link>
          ))}
        </div>
        <select
          name="category"
          defaultValue={category}
          className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-[13px] text-zinc-700 outline-none"
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === "全部" ? "全部分类" : option}
            </option>
          ))}
        </select>
        <button
          className="h-9 rounded-xl bg-zinc-900 px-4 text-[13px] font-medium text-white transition-[background-color] duration-150 hover:bg-zinc-800"
          type="submit"
        >
          筛选
        </button>
      </form>

      {errorMessage ? (
        <section className="rounded-2xl border border-zinc-200 border-l-[2px] border-l-[#C9604D] bg-zinc-50 p-6 text-[13px] text-[#C9604D]">
          案例数据暂时无法读取：{errorMessage}
        </section>
      ) : (
        <ViolationsReviewList cases={cases} />
      )}
    </div>
  );
}
