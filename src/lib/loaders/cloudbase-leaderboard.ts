import type { createAdminClient } from "@/lib/supabase/admin";
import { getPublishedDateForStats } from "@/lib/date-semantics";
import { assertSupabaseQuerySucceeded } from "@/lib/supabase/query-error";
import { withTimeout } from "@/lib/timeout";

const METRIC_KEYS = ["play_count", "likes", "comments", "shares", "favorites", "follower_gain", "follower_convert", "completion_rate", "avg_play_duration", "bounce_rate_2s", "completion_rate_5s"] as const;
const METRICS = METRIC_KEYS.join(",");
const PAGE_SIZE = 500;
const MAX_PAGES = 40;

function timestampKey(value: string) {
  // Preserve PostgreSQL microseconds as well as timezone-normalized ordering.
  const fraction = /T\d{2}:\d{2}:\d{2}(?:\.(\d+))?/.exec(value)?.[1] ?? "";
  return new Date(value).toISOString().slice(0, 19) + "." + fraction.padEnd(6, "0");
}

type JoinedReport = {
  id: string; account_id: string; report_date: string; created_at: string;
  account: { name: string; profile_id: string; content_direction: string | null;
    presentation_format: string | null; profile: { name: string } };
  video: { published_at: string | null } | null;
  [metric: string]: unknown;
};

// Equivalent to get_leaderboard_rows: union of the report-date and published-date
// predicates, INNER account/profile, LEFT video, non-void only. The caller must
// supply the canonical visible-user scope; this module never accepts browser IDs.
export async function loadCloudBaseLeaderboardRows(
  client: ReturnType<typeof createAdminClient>, sinceDate: string, visibleUserIds: string[],
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sinceDate)) throw new Error("排行榜日期无效");
  if (visibleUserIds.length === 0) return [];
  return withTimeout(async (signal) => {
    const read = async (byPublishedDate: boolean) => {
      const rows: JoinedReport[] = [];
      for (let page = 0; page < MAX_PAGES; page += 1) {
        let query = client.from("daily_reports")
          .select(`id,account_id,report_date,created_at,${METRICS},account:accounts!inner(name,profile_id,content_direction,presentation_format,profile:profiles!inner(name)),video:videos!daily_reports_video_id_fkey${byPublishedDate ? "!inner" : ""}(published_at)`)
          .or("is_void.is.null,is_void.eq.false")
          .in("account.profile_id", visibleUserIds)
          .order("id", { ascending: true })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
          .abortSignal(signal);
        query = byPublishedDate
          ? query.gte("video.published_at", `${sinceDate}T00:00:00+08:00`)
          : query.gte("report_date", sinceDate);
        const result = await query;
        assertSupabaseQuerySucceeded(result.error, "读取排行榜日报失败");
        if (!Array.isArray(result.data)) throw new Error("排行榜日报响应无效");
        rows.push(...result.data as unknown as JoinedReport[]);
        if (result.data.length < PAGE_SIZE) return rows;
      }
      throw new Error("排行榜数据超过安全读取上限");
    };
    const branches = await Promise.all([read(false), read(true)]);
    const unique = new Map(branches.flat().map((row) => [row.id, row]));
    return [...unique.values()].map((row) => ({
      row,
      date: getPublishedDateForStats({ published_at: row.video?.published_at, report_date: row.report_date }) ?? row.report_date,
    })).sort((a, b) => b.date.localeCompare(a.date) || timestampKey(b.row.created_at).localeCompare(timestampKey(a.row.created_at)))
      .map(({ row, date }) => ({
        account_id: row.account_id, account_name: row.account.name,
        profile_id: row.account.profile_id, owner_name: row.account.profile.name,
        content_direction: row.account.content_direction, presentation_format: row.account.presentation_format,
        report_date: date,
        ...Object.fromEntries(METRIC_KEYS.map((key) => [key, row[key]])) as Record<typeof METRIC_KEYS[number], unknown>,
      }));
  }, { timeoutMs: 20_000, operation: "cloudbase.leaderboard" });
}
