import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  apiError,
  checkpointSchema,
  dateSchema,
  optionalTrimmedText,
  parseJsonError,
} from "@/app/api/sop/_shared";
import { submitMySopCheckpoint } from "@/lib/sop/service";

const submitSchema = z.object({
  checkpoint: checkpointSchema,
  statusDate: dateSchema,
  status_date: dateSchema,
  topicText: optionalTrimmedText(2000),
  topic_text: optionalTrimmedText(2000),
  scriptText: optionalTrimmedText(10000),
  script_text: optionalTrimmedText(10000),
  videoUrl: optionalTrimmedText(2000),
  video_url: optionalTrimmedText(2000),
  notes: optionalTrimmedText(5000),
}).transform((value) => ({
  checkpoint: value.checkpoint,
  statusDate: value.statusDate ?? value.status_date,
  topicText: value.topicText ?? value.topic_text,
  scriptText: value.scriptText ?? value.script_text,
  videoUrl: value.videoUrl ?? value.video_url,
  notes: value.notes,
})).superRefine((value, ctx) => {
  if (value.checkpoint === "TOPIC" && !value.topicText?.trim()) {
    ctx.addIssue({ code: "custom", path: ["topicText"], message: "选题内容不能为空" });
  }

  if (value.checkpoint === "SCRIPT" && !value.scriptText?.trim()) {
    ctx.addIssue({ code: "custom", path: ["scriptText"], message: "文案内容不能为空" });
  }

  if (value.checkpoint === "VIDEO" && !value.videoUrl?.trim()) {
    ctx.addIssue({ code: "custom", path: ["videoUrl"], message: "视频链接不能为空" });
  }
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = submitSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parseJsonError(parsed.error) }, { status: 422 });
  }

  try {
    const result = await submitMySopCheckpoint(parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return apiError(error);
  }
}
