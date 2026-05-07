import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  apiError,
  checkpointSchema,
  dateSchema,
  parseJsonError,
  readDateParam,
  readGroupParam,
  scoreSchema,
  statusSchema,
  uuidSchema,
} from "@/app/api/sop/_shared";
import { loadSopStatuses, updateSopCheckpointStatus } from "@/lib/sop/service";

const patchSchema = z.object({
  userId: uuidSchema.optional(),
  user_id: uuidSchema.optional(),
  checkpoint: checkpointSchema,
  status: statusSchema,
  statusDate: dateSchema,
  status_date: dateSchema,
  submissionId: uuidSchema.optional().nullable(),
  submission_id: uuidSchema.optional().nullable(),
  rejectionReason: z.string().trim().max(2000).optional().nullable(),
  rejection_reason: z.string().trim().max(2000).optional().nullable(),
  scores: scoreSchema.optional().nullable(),
}).transform((value) => ({
  userId: value.userId ?? value.user_id,
  checkpoint: value.checkpoint,
  status: value.status,
  statusDate: value.statusDate ?? value.status_date,
  submissionId: value.submissionId ?? value.submission_id,
  rejectionReason: value.rejectionReason ?? value.rejection_reason,
  scores: value.scores,
})).superRefine((value, ctx) => {
  if (!value.userId) {
    ctx.addIssue({ code: "custom", path: ["userId"], message: "缺少用户 ID" });
  }

  if (value.status === "REJECTED" && !value.rejectionReason?.trim()) {
    ctx.addIssue({ code: "custom", path: ["rejectionReason"], message: "审核打回必须写原因" });
  }
});

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
    const members = await loadSopStatuses(parsed.data);
    return NextResponse.json({ ok: true, date: parsed.data.statusDate, groupId: parsed.data.groupId ?? null, members });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parseJsonError(parsed.error) }, { status: 422 });
  }

  try {
    const member = await updateSopCheckpointStatus({
      userId: parsed.data.userId!,
      checkpoint: parsed.data.checkpoint,
      status: parsed.data.status,
      statusDate: parsed.data.statusDate,
      submissionId: parsed.data.submissionId,
      rejectionReason: parsed.data.rejectionReason,
      scores: parsed.data.scores,
    });

    return NextResponse.json({ ok: true, member });
  } catch (error) {
    return apiError(error);
  }
}
