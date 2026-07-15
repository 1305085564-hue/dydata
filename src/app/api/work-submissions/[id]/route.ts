import { NextRequest, NextResponse } from "next/server";

import { archivedFeatureResponse, isArchivedWriteEnabled } from "@/app/api/_archive";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_PATTERN, getShanghaiDate, requireSignedInUser } from "@/app/api/production/_shared";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (isArchivedWriteEnabled()) {
    return archivedFeatureResponse("视频审核作品提交已归档，历史提交不再支持删除");
  }

  const auth = await requireSignedInUser();
  if ("response" in auth) return auth.response;

  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "id 必须是 uuid" }, { status: 400 });
  }

  const today = getShanghaiDate();
  const { data: existing, error: loadError } = await auth.supabase
    .from("work_submissions")
    .select("id, user_id, submit_date, screenshot_urls")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .single();

  if (loadError || !existing) {
    return NextResponse.json({ error: "提交记录不存在" }, { status: 404 });
  }

  if (existing.submit_date !== today) {
    return NextResponse.json({ error: "只能删除当天提交记录" }, { status: 403 });
  }

  const { error } = await auth.supabase
    .from("work_submissions")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .eq("submit_date", today);

  if (error) {
    return NextResponse.json({ error: error.message || "删除提交记录失败" }, { status: 500 });
  }

  const screenshotUrls = Array.isArray(existing.screenshot_urls) ? existing.screenshot_urls : [];
  if (screenshotUrls.length > 0) {
    await createAdminClient().storage.from("work-screenshots").remove(screenshotUrls);
  }

  return NextResponse.json({ ok: true });
}
