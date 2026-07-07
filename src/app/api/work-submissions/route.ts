import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getShanghaiDate,
  isRecord,
  isValidDate,
  readJsonBody,
  requireSignedInUser,
  toTrimmedString,
} from "@/app/api/production/_shared";

type WorkSubmissionPayload = {
  contentText: string;
  screenshotUrls: string[];
  note: string | null;
};

function parseWorkSubmissionPayload(input: unknown): { data: WorkSubmissionPayload } | { response: NextResponse } {
  if (!isRecord(input)) {
    return { response: NextResponse.json({ error: "请求体必须是对象" }, { status: 400 }) };
  }

  const contentText = toTrimmedString(input.content_text, 20_000);
  const rawScreenshotUrls = Array.isArray(input.screenshot_urls) ? input.screenshot_urls : [];
  const screenshotUrls = rawScreenshotUrls
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 20);
  const note = typeof input.note === "string" ? toTrimmedString(input.note, 2_000) : null;

  if (!contentText && screenshotUrls.length === 0) {
    return { response: NextResponse.json({ error: "文案内容和截图至少填一项" }, { status: 400 }) };
  }

  if (screenshotUrls.some((url) => !url.includes("/") || url.startsWith("/") || url.includes(".."))) {
    return { response: NextResponse.json({ error: "截图路径格式不正确" }, { status: 400 }) };
  }

  return { data: { contentText, screenshotUrls, note } };
}

async function withSignedScreenshotUrls<T extends { screenshot_urls: string[] | null }>(record: T) {
  const screenshotUrls = record.screenshot_urls ?? [];
  if (screenshotUrls.length === 0) return { ...record, screenshot_items: [] };

  const { data } = await createAdminClient()
    .storage
    .from("work-screenshots")
    .createSignedUrls(screenshotUrls, 60 * 10);

  const byPath = new Map((data ?? []).map((item) => [item.path, item.signedUrl]));
  return {
    ...record,
    screenshot_items: screenshotUrls.map((path) => ({
      path,
      signed_url: byPath.get(path) ?? null,
    })),
  };
}

export async function GET(request: Request) {
  const auth = await requireSignedInUser();
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const date = url.searchParams.get("date")?.trim() || getShanghaiDate();
  if (!isValidDate(date)) {
    return NextResponse.json({ error: "date 必须是 YYYY-MM-DD" }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from("work_submissions")
    .select("id, user_id, team_id, group_id, submit_date, content_text, screenshot_urls, note, created_at")
    .eq("user_id", auth.user.id)
    .eq("submit_date", date)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message || "读取作品提交失败" }, { status: 500 });
  }

  const rows = await Promise.all((data ?? []).map((item) => withSignedScreenshotUrls(item)));
  return NextResponse.json({ data: rows, date });
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  if ("response" in body) return body.response;

  const payload = parseWorkSubmissionPayload(body.data);
  if ("response" in payload) return payload.response;

  const auth = await requireSignedInUser();
  if ("response" in auth) return auth.response;

  const { data: profile, error: profileError } = await auth.supabase
    .from("profiles")
    .select("id, team_id, group_id")
    .eq("id", auth.user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "用户信息不存在" }, { status: 403 });
  }

  const { data, error } = await auth.supabase
    .from("work_submissions")
    .insert({
      user_id: auth.user.id,
      team_id: profile.team_id,
      group_id: profile.group_id,
      content_text: payload.data.contentText || null,
      screenshot_urls: payload.data.screenshotUrls,
      note: payload.data.note,
    })
    .select("id, user_id, team_id, group_id, submit_date, content_text, screenshot_urls, note, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message || "提交作品失败" }, { status: 500 });
  }

  return NextResponse.json({ data: await withSignedScreenshotUrls(data) }, { status: 201 });
}
