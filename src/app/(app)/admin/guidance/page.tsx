import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserPermissions, hasPermission } from "@/lib/permissions";
import { CultivationList } from "./cultivation-list";

export default async function GuidancePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const perm = await getUserPermissions();
  if (!perm) redirect("/login");
  if (!hasPermission(perm.role, perm.permissions, "view_analytics")) redirect("/dashboard");

  const now = new Date();
  const monthAgoDate = new Date(now);
  monthAgoDate.setDate(monthAgoDate.getDate() - 30);
  const monthAgo = monthAgoDate.toISOString().split("T")[0];

  const [{ data: profiles }, { data: accounts }, { data: reports }] = await Promise.all([
    supabase.from("profiles").select("id, name"),
    supabase
      .from("accounts")
      .select("id, profile_id, name, content_direction, presentation_format, target_mode, created_at")
      .order("created_at", { ascending: true }),
    supabase
      .from("daily_reports")
      .select(
        "user_id, account_id, report_date, play_count, likes, comments, shares, favorites, follower_gain, follower_convert, completion_rate, completion_rate_5s, avg_play_duration, bounce_rate_2s"
      )
      .gte("report_date", monthAgo)
      .not("account_id", "is", null),
  ]);

  const profileNameMap = new Map((profiles ?? []).map((profile) => [profile.id, profile.name]));

  const normalizedAccounts = (accounts ?? []).map((account) => ({
    id: account.id,
    profileId: account.profile_id,
    accountName: account.name,
    ownerName: profileNameMap.get(account.profile_id) ?? "未命名成员",
    contentDirection: account.content_direction,
    presentationFormat: account.presentation_format,
    targetMode: account.target_mode,
    createdAt: account.created_at,
  }));

  const normalizedReports = (reports ?? []).flatMap((report) => {
    if (!report.account_id) return [];
    return {
      userId: report.user_id,
      accountId: report.account_id,
      reportDate: report.report_date,
      playCount: report.play_count,
      likes: report.likes,
      comments: report.comments,
      shares: report.shares,
      favorites: report.favorites,
      followerGain: report.follower_gain,
      followerConvert: report.follower_convert,
      completionRate: report.completion_rate,
      completionRate5s: report.completion_rate_5s,
      avgPlayDuration: report.avg_play_duration,
      bounceRate2s: report.bounce_rate_2s,
    };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-4 sm:px-6 lg:px-8">
      <section className="rounded-[30px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(244,248,255,0.86))] p-5 shadow-[var(--shadow-card)] backdrop-blur-[20px] sm:p-6">
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-text-tertiary)]">Guidance Console</p>
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--color-text-primary)] sm:text-[30px]">定向培养</h1>
          <p className="max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">按账号和近 30 天表现查看培养优先级，聚焦需要重点干预的人和方向。</p>
        </div>
      </section>

      <CultivationList accounts={normalizedAccounts} reports={normalizedReports} />
    </div>
  );
}
