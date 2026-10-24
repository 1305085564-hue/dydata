import type { SupabaseClient } from "@supabase/supabase-js";

export const VIDEO_REVIEW_ISSUE_TAGS = [
  "前2秒流失高",
  "封面与内容不符",
  "开头缺乏悬念",
  "信息密度不足",
  "结尾缺少行动引导",
] as const;

export type VideoReviewIssueTag = (typeof VIDEO_REVIEW_ISSUE_TAGS)[number];
export type VideoReviewTicketStatus = "pending" | "resolved" | "withdrawn";

export interface VideoReviewTicket {
  id: string;
  videoId: string;
  reporterId: string;
  assigneeId: string;
  issueTag: string;
  status: VideoReviewTicketStatus;
  createdAt: string;
  resolvedAt: string | null;
  videoTitle: string;
  reporterName: string;
  /** 作品发布日（与复盘页列表分日口径一致：published_at 前 10 位）；无发布日时为空串，跳转不带日期 */
  videoDate: string;
}

export function isVideoReviewIssueTag(value: unknown): value is VideoReviewIssueTag {
  return typeof value === "string" && (VIDEO_REVIEW_ISSUE_TAGS as readonly string[]).includes(value);
}

export function formatTicketTime(value: string, timeZone = "Asia/Shanghai") {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

type RawTicket = {
  id: string;
  video_id: string;
  reporter_id: string;
  assignee_id: string;
  issue_tag: string;
  status: VideoReviewTicketStatus;
  created_at: string;
  resolved_at: string | null;
};

type RawVideo = { id: string; video_title: string | null; content: string | null; published_at: string | null };
type RawProfile = { id: string; name: string | null };

export async function loadPendingVideoReviewTickets(
  supabase: SupabaseClient,
  assigneeId: string,
): Promise<VideoReviewTicket[]> {
  const ticketsResult = await supabase
    .from("video_review_tickets")
    .select("id, video_id, reporter_id, assignee_id, issue_tag, status, created_at, resolved_at")
    .eq("assignee_id", assigneeId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (ticketsResult.error) throw new Error("加载复盘待办失败");

  const rows = (ticketsResult.data ?? []) as RawTicket[];
  if (rows.length === 0) return [];

  const videoIds = [...new Set(rows.map((row) => row.video_id))];
  const reporterIds = [...new Set(rows.map((row) => row.reporter_id))];
  const [videosResult, profilesResult] = await Promise.all([
    supabase.from("videos").select("id, video_title, content, published_at").in("id", videoIds),
    supabase.from("profiles").select("id, name").in("id", reporterIds),
  ]);
  if (videosResult.error || profilesResult.error) throw new Error("加载复盘待办详情失败");

  const videos = new Map((videosResult.data ?? []).map((row) => [(row as RawVideo).id, row as RawVideo]));
  const profiles = new Map((profilesResult.data ?? []).map((row) => [(row as RawProfile).id, row as RawProfile]));
  return rows.map((row) => ({
    id: row.id,
    videoId: row.video_id,
    reporterId: row.reporter_id,
    assigneeId: row.assignee_id,
    issueTag: row.issue_tag,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    videoTitle: videos.get(row.video_id)?.video_title?.trim() || videos.get(row.video_id)?.content?.trim().slice(0, 80) || "未命名视频",
    reporterName: profiles.get(row.reporter_id)?.name?.trim() || "未命名成员",
    videoDate: videos.get(row.video_id)?.published_at?.slice(0, 10) ?? "",
  }));
}
