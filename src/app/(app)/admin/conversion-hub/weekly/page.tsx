import { redirect } from "next/navigation";

import { getUserPermissions } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

import { WeeklyDecisionView, type DecisionBucket, type DecisionEntry } from "./view";

export const dynamic = "force-dynamic";

function getWeekStartDate(now = new Date()) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

interface WeeklyDecisionRow {
  id: string;
  week_start: string;
  generated_by: "ai" | "manual";
  promote: unknown;
  keep_testing: unknown;
  deprecate: unknown;
  ban: unknown;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
}

function normalizeBucket(value: unknown): DecisionEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): DecisionEntry[] => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id : typeof item.case_id === "string" ? item.case_id : null;
    const script =
      typeof item.script_text === "string"
        ? item.script_text
        : typeof item.script === "string"
          ? item.script
          : typeof item.preview === "string"
            ? item.preview
            : "";
    const reason = typeof item.reason === "string" ? item.reason : null;
    if (!id || !script) return [];
    return [{ id, script_text: script, reason }];
  });
}

export default async function WeeklyPage() {
  const perm = await getUserPermissions();
  if (!perm) redirect("/login");
  if (perm.role !== "owner" && perm.role !== "admin") redirect("/dashboard");

  const weekStart = getWeekStartDate();
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("weekly_decisions")
    .select("id, week_start, generated_by, promote, keep_testing, deprecate, ban, confirmed_by, confirmed_at, created_at")
    .eq("week_start", weekStart)
    .maybeSingle<WeeklyDecisionRow>();

  const buckets: DecisionBucket[] | null = data
    ? [
        { key: "promote", label: "推广", emoji: "🚀", tone: "success", entries: normalizeBucket(data.promote) },
        { key: "keep_testing", label: "继续测试", emoji: "🧪", tone: "info", entries: normalizeBucket(data.keep_testing) },
        { key: "deprecate", label: "废弃", emoji: "🗑️", tone: "neutral", entries: normalizeBucket(data.deprecate) },
        { key: "ban", label: "封禁", emoji: "⛔", tone: "danger", entries: normalizeBucket(data.ban) },
      ]
    : null;

  return (
    <WeeklyDecisionView
      weekStart={weekStart}
      buckets={buckets}
      confirmedAt={data?.confirmed_at ?? null}
      generatedBy={data?.generated_by ?? null}
    />
  );
}
