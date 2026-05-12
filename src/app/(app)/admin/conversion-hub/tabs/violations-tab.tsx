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

function buildFilterHref(params: { status: StatusFilter; category: string; keyword: string }) {
  const sp = new URLSearchParams();
  sp.set("tab", "violations");
  if (params.status !== "submitted") sp.set("status", params.status);
  if (params.category && params.category !== "全部") sp.set("category", params.category);
  if (params.keyword) sp.set("q", params.keyword);
  return `/admin/conversion-hub?${sp.toString()}`;
}

export function ViolationsReviewTab({ data }: { data: ViolationsTabData }) {
  const { cases, pendingCount, status, category, keyword, errorMessage } = data;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">Violation Review</p>
          <h2 className="mt-1 text-[18px] font-medium tracking-tight text-zinc-800">违规复核队列</h2>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-[13px]">
          当前筛选 <span className="font-semibold text-zinc-800 font-mono tabular-nums">{pendingCount}</span>
          <span className="ml-1 text-zinc-500">条待复核</span>
        </div>
      </div>

      <form
        className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto_auto]"
        action="/admin/conversion-hub"
        method="get"
      >
        <input type="hidden" name="tab" value="violations" />
        <input type="hidden" name="status" value={status} />
        <input
          name="q"
          defaultValue={keyword}
          placeholder="搜索话术原文"
          className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none transition-[border-color,background-color] duration-150 focus:border-zinc-400 focus:bg-white"
        />
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={buildFilterHref({ status: option.value, category, keyword })}
              className={
                status === option.value
                  ? "rounded-xl bg-zinc-900 px-3 py-2 text-sm font-medium text-white"
                  : "rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-600 transition-[background-color,color] duration-150 hover:bg-zinc-50 hover:text-zinc-800"
              }
            >
              {option.label}
            </Link>
          ))}
        </div>
        <select
          name="category"
          defaultValue={category}
          className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-700 outline-none"
        >
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === "全部" ? "全部分类" : option}
            </option>
          ))}
        </select>
        <button
          className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-[background-color] duration-150 hover:bg-zinc-800"
          type="submit"
        >
          筛选
        </button>
      </form>

      {errorMessage ? (
        <section className="rounded-2xl border border-zinc-200 border-l-[2px] border-l-[#C9604D] bg-zinc-50 p-6 text-[13px] text-[#C9604D]">
          违规案例数据暂时无法读取：{errorMessage}
        </section>
      ) : (
        <ViolationsReviewList cases={cases} />
      )}
    </div>
  );
}
