import Link from "next/link";
import { redirect } from "next/navigation";

import { getUserPermissions, hasPermission } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

import { ViolationsReviewList, type ViolationReviewCase } from "./review-list";

type StatusFilter = "submitted" | "all" | "verified" | "rejected" | "archived";

interface AdminViolationsPageProps {
  searchParams: Promise<{
    status?: string;
    category?: string;
    q?: string;
  }>;
}

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "submitted", label: "待复核" },
  { value: "all", label: "全部" },
  { value: "verified", label: "已确认" },
  { value: "rejected", label: "已驳回" },
  { value: "archived", label: "已归档" },
];

const CATEGORY_OPTIONS = ["全部", "下粉", "直播", "短视频", "其他"] as const;

function normalizeStatus(value: string | undefined): StatusFilter {
  if (value === "all" || value === "verified" || value === "rejected" || value === "archived") return value;
  return "submitted";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function sortCases(cases: ViolationReviewCase[]) {
  const rank: Record<string, number> = {
    submitted: 0,
    verified: 1,
    rejected: 2,
    archived: 3,
  };

  return [...cases].sort((a, b) => {
    const rankDiff = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
    if (rankDiff !== 0) return rankDiff;
    return new Date(b.reviewedAt ?? b.createdAt).getTime() - new Date(a.reviewedAt ?? a.createdAt).getTime();
  });
}

export default async function AdminViolationsPage({ searchParams }: AdminViolationsPageProps) {
  const perm = await getUserPermissions();
  if (!perm) redirect("/login");

  if (!hasPermission(perm.role, perm.permissions, "manage_violations")) {
    redirect("/admin");
  }

  const params = await searchParams;
  const status = normalizeStatus(params.status);
  const category = CATEGORY_OPTIONS.includes(params.category as (typeof CATEGORY_OPTIONS)[number])
    ? params.category
    : "全部";
  const keyword = params.q?.trim() ?? "";

  const supabase = await createClient();
  let query = supabase
    .from("violation_cases")
    .select(
      "id, created_at, submitted_by, script_text, is_violation, category, account_name_snapshot, team_id, scene_description, result, pass_count, fail_count, status, risk_level, admin_conclusion, suggested_action, reviewed_at, is_deleted",
    )
    .eq("is_deleted", false)
    .eq("purpose", "violation")
    .order("created_at", { ascending: false })
    .limit(80);

  if (status !== "all") query = query.eq("status", status);
  if (category && category !== "全部") query = query.eq("category", category);
  if (keyword) query = query.ilike("script_text", `%${keyword}%`);

  const { data: caseRows, error } = await query;

  const rows = (caseRows ?? []) as Array<{
    id: string;
    created_at: string;
    submitted_by: string;
    script_text: string;
    is_violation: boolean;
    category: string;
    account_name_snapshot: string | null;
    team_id: string | null;
    scene_description: string | null;
    result: string | null;
    pass_count: number | null;
    fail_count: number | null;
    status: ViolationReviewCase["status"];
    risk_level: ViolationReviewCase["riskLevel"];
    admin_conclusion: string | null;
    suggested_action: string | null;
    reviewed_at: string | null;
  }>;

  const submitterIds = Array.from(new Set(rows.map((row) => row.submitted_by).filter(Boolean)));
  const teamIds = Array.from(new Set(rows.map((row) => row.team_id).filter(Boolean))) as string[];

  const [{ data: profiles }, { data: teams }] = await Promise.all([
    submitterIds.length > 0
      ? supabase.from("profiles").select("id, name").in("id", submitterIds)
      : Promise.resolve({ data: [] }),
    teamIds.length > 0
      ? supabase.from("teams").select("id, name").in("id", teamIds)
      : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile.name]));
  const teamMap = new Map((teams ?? []).map((team) => [team.id, team.name]));
  const cases = sortCases(
    rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      createdAtLabel: formatDate(row.created_at),
      submitterName: profileMap.get(row.submitted_by) ?? "未知成员",
      scriptText: row.script_text,
      isViolation: row.is_violation,
      category: row.category,
      accountName: row.account_name_snapshot,
      teamName: row.team_id ? teamMap.get(row.team_id) ?? "未知团队" : null,
      sceneDescription: row.scene_description,
      result: row.result,
      passCount: row.pass_count ?? 0,
      failCount: row.fail_count ?? 0,
      status: row.status,
      riskLevel: row.risk_level,
      adminConclusion: row.admin_conclusion,
      suggestedAction: row.suggested_action,
      reviewedAt: row.reviewed_at,
      reviewedAtLabel: formatDate(row.reviewed_at),
    })),
  );

  const pendingCount = status === "submitted" ? cases.length : cases.filter((item) => item.status === "submitted").length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">Violation Review</p>
          <h1 className="mt-2 text-[20px] font-semibold tracking-tight text-zinc-800">违规复核</h1>
          <p className="mt-1 text-[13px] leading-[1.7] text-zinc-500">确认、驳回并沉淀员工提交的违规/非违规话术案例</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-[13px] shadow-sm">
          <span className="font-semibold text-zinc-800 tabular-nums">{pendingCount}</span>
          <span className="ml-1 text-zinc-500">条待复核</span>
        </div>
      </div>

      <form className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto_auto]" action="/admin/violations">
        <input
          name="q"
          defaultValue={keyword}
          placeholder="搜索话术原文"
          className="h-10 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none transition focus:border-zinc-400 focus:bg-white"
        />
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={`/admin/violations?status=${option.value}${category !== "全部" ? `&category=${encodeURIComponent(category ?? "")}` : ""}${keyword ? `&q=${encodeURIComponent(keyword)}` : ""}`}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                status === option.value ? "bg-white shadow-sm text-zinc-800 border border-zinc-200" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
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
        <input type="hidden" name="status" value={status} />
        <button className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800" type="submit">
          筛选
        </button>
      </form>

      {error ? (
        <section className="rounded-2xl border border-zinc-200 border-l-[2px] border-l-[#C9604D] bg-zinc-50 p-6 text-[13px] text-[#C9604D]">
          违规案例数据暂时无法读取：{error.message}
        </section>
      ) : (
        <ViolationsReviewList cases={cases} />
      )}
    </div>
  );
}
