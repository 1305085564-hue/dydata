import { NextRequest, NextResponse } from "next/server";

import { isUuidLike } from "../stability";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EDIT_DETAIL_ASSIGNEE_PROFILE_SELECT,
  EDIT_DETAIL_REPORT_SELECT,
  EDIT_DETAIL_SNAPSHOT_SELECT,
  EDIT_DETAIL_VIDEO_SELECT,
  loadVideoSubmissionEditDetailPage,
  type EditDetailPageDbAdapter,
} from "./route-core";

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id")?.trim() ?? null;
  const bizDate = request.nextUrl.searchParams.get("biz_date")?.trim() ?? null;
  if (!accountId || !isUuidLike(accountId) || !bizDate || !/^\d{4}-\d{2}-\d{2}$/.test(bizDate)) {
    return NextResponse.json({ error: "account_id 或 biz_date 格式不正确" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id ?? "";

  const db: EditDetailPageDbAdapter = {
    getAccountById: async (id) => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, profile_id")
        .eq("id", id)
        .maybeSingle();
      return { data, error };
    },
    listReportsByAccountAndDate: async (id, date) => {
      const { data, error } = await supabase
        .from("daily_reports")
        .select(EDIT_DETAIL_REPORT_SELECT)
        .eq("account_id", id)
        .eq("report_date", date)
        .limit(2);
      return { data, error };
    },
    listActiveVideosByAccount: async (id) => {
      const { data, error } = await supabase
        .from("videos")
        .select(EDIT_DETAIL_VIDEO_SELECT)
        .eq("account_id", id)
        .eq("user_id", currentUserId)
        .eq("lifecycle_state", "active");
      return { data, error };
    },
    list24hSnapshotsByVideoId: async (videoId) => {
      const { data, error } = await supabase
        .from("video_metrics_snapshots")
        .select(EDIT_DETAIL_SNAPSHOT_SELECT)
        .eq("video_id", videoId)
        .eq("snapshot_type", "24h")
        .limit(2);
      return { data, error };
    },
    listTagsByVideoId: async (videoId) => {
      const { data, error } = await supabase
        .from("video_tags")
        .select("tag_dimension, tag_value")
        .eq("video_id", videoId);
      return { data, error };
    },
    listUsageRecordsByReportAndUser: async (reportId, userId) => {
      const { data, error } = await supabase
        .from("script_usage_records")
        .select("id, script_text, script_format")
        .eq("daily_report_id", reportId)
        .eq("recorded_by", userId)
        .limit(2);
      return { data, error };
    },
    // 历史责任人档案可能包含已归档成员，RLS 下普通成员读不到，走 service role；
    // 此时用户、账号、原视频归属校验已在 route-core 中完成，且只按精确的三个 ID 查询。
    listAssigneeProfilesByIds: async (ids) => {
      const { data, error } = await createAdminClient()
        .from("profiles")
        .select(EDIT_DETAIL_ASSIGNEE_PROFILE_SELECT)
        .in("id", ids);
      return { data, error };
    },
  };

  const result = await loadVideoSubmissionEditDetailPage(
    { accountId, bizDate, userId: user?.id ?? null },
    db,
  );  return NextResponse.json(result.body, { status: result.status });
}
