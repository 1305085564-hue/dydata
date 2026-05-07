import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  apiError,
  dateSchema,
  optionalTrimmedText,
  parseJsonError,
  readDateParam,
  readGroupParam,
  uuidSchema,
} from "@/app/api/sop/_shared";
import { loadLeaderReports, saveLeaderReport } from "@/lib/sop/service";

const postSchema = z.object({
  statusDate: dateSchema,
  status_date: dateSchema,
  reportDate: dateSchema,
  report_date: dateSchema,
  groupId: uuidSchema.optional().nullable(),
  group_id: uuidSchema.optional().nullable(),
  topicFeedback: optionalTrimmedText(5000),
  topic_feedback: optionalTrimmedText(5000),
  openingFeedback: optionalTrimmedText(5000),
  opening_feedback: optionalTrimmedText(5000),
  scriptFeedback: optionalTrimmedText(5000),
  script_feedback: optionalTrimmedText(5000),
  videoFeedback: optionalTrimmedText(5000),
  video_feedback: optionalTrimmedText(5000),
  isDraft: z.boolean().optional(),
  is_draft: z.boolean().optional(),
}).transform((value) => ({
  statusDate: value.statusDate ?? value.status_date ?? value.reportDate ?? value.report_date,
  groupId: value.groupId ?? value.group_id,
  topicFeedback: value.topicFeedback ?? value.topic_feedback,
  openingFeedback: value.openingFeedback ?? value.opening_feedback,
  scriptFeedback: value.scriptFeedback ?? value.script_feedback,
  videoFeedback: value.videoFeedback ?? value.video_feedback,
  isDraft: value.isDraft ?? value.is_draft ?? false,
}));

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const parsed = z.object({
    statusDate: dateSchema,
    groupId: uuidSchema.optional(),
  }).safeParse({
    statusDate: readDateParam(searchParams),
    groupId: readGroupParam(searchParams),
  });

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parseJsonError(parsed.error) }, { status: 422 });
  }

  try {
    const result = await loadLeaderReports(parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parseJsonError(parsed.error) }, { status: 422 });
  }

  try {
    const report = await saveLeaderReport(parsed.data);
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    return apiError(error);
  }
}
