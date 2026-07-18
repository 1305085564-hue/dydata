"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserPermissions } from "@/lib/permissions";

export async function getUserSubmissions(targetUserId: string, date: string) {
  const permInfo = await getUserPermissions();
  if (!permInfo) throw new Error("未登录或登录过期");

  const isAdmin = ["owner", "team_admin", "group_leader"].includes(permInfo.businessRole);
  const isSelf = permInfo.userId === targetUserId;

  if (!isAdmin && !isSelf) {
    throw new Error("无权查看该用户的数据");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_submissions")
    .select("id, user_id, team_id, group_id, submit_date, content_text, screenshot_urls, note, created_at")
    .eq("user_id", targetUserId)
    .eq("submit_date", date)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[video-review] failed to load user submissions", error);
    throw new Error("读取作品提交失败");
  }

  const rows = data ?? [];
  const adminSupabase = createAdminClient();

  const enriched = await Promise.all(
    rows.map(async (row) => {
      const paths = (row.screenshot_urls ?? []) as string[];
      if (paths.length === 0) return { ...row, screenshot_items: [] };

      // Sign the URLs with 10 minutes expiry (60 * 10 seconds)
      const { data: signedData, error: signError } = await adminSupabase
        .storage
        .from("work-screenshots")
        .createSignedUrls(paths, 60 * 10);

      if (signError) {
        console.error("Error signing screenshots:", signError);
      }

      const byPath = new Map((signedData ?? []).map((item) => [item.path, item.signedUrl]));
      return {
        ...row,
        screenshot_items: paths.map((path: string) => ({
          path,
          signed_url: byPath.get(path) ?? null,
        })),
      };
    })
  );

  return enriched;
}
