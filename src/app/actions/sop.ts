"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  loadGroupSopStatuses,
  loadMemberSopStatus,
  loadMyReviewQueue,
  loadMyTodaySopStatus,
  loadSopMatrix,
  reviewSopCheckpoint,
  submitMySopCheckpoint,
} from "@/lib/sop/service";

const checkpointSchema = z.enum(["DATA_REPORT", "MORNING_REVIEW", "TOPIC", "SCRIPT", "VIDEO"]);

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD")
  .optional();

const optionalTrimmedText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(max).optional().nullable(),
  );

const submitCheckpointSchema = z.object({
  checkpoint: checkpointSchema,
  statusDate: dateSchema,
  topicText: optionalTrimmedText(2000),
  scriptText: optionalTrimmedText(10000),
  videoUrl: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().url("视频链接格式不正确").max(2000).optional().nullable(),
  ),
  notes: optionalTrimmedText(5000),
}).superRefine((value, ctx) => {
  if (value.checkpoint === "TOPIC" && !value.topicText?.trim()) {
    ctx.addIssue({ code: "custom", path: ["topicText"], message: "选题上报不能为空" });
  }

  if (value.checkpoint === "SCRIPT" && !value.scriptText?.trim()) {
    ctx.addIssue({ code: "custom", path: ["scriptText"], message: "文案存档不能为空" });
  }

  if (value.checkpoint === "VIDEO" && !value.videoUrl?.trim()) {
    ctx.addIssue({ code: "custom", path: ["videoUrl"], message: "审片发布需填写视频链接" });
  }
});

const scoreSchema = z.number().int().min(0).max(10);

const reviewSchema = z.object({
  submissionId: z.string().uuid(),
  scores: z.object({
    HOOK: scoreSchema,
    VIEWPOINT: scoreSchema,
    COMPLIANCE: scoreSchema,
    PERFORMANCE_HOOK: scoreSchema,
    YESTERDAY_REVIEW: scoreSchema,
    CTA: scoreSchema,
  }),
  rejectionReason: z.string().trim().max(2000).optional().nullable(),
});

const groupStatusSchema = z.object({
  groupId: z.string().uuid(),
  statusDate: dateSchema,
});

const memberStatusSchema = z.object({
  targetUserId: z.string().uuid(),
  statusDate: dateSchema,
});

const matrixSchema = z.object({
  statusDate: dateSchema,
});

function validationError(error: z.ZodError) {
  return error.issues[0]?.message ?? "提交内容格式不正确";
}

function toActionError(error: unknown) {
  return error instanceof Error ? error.message : "操作失败";
}

export async function getMyTodaySopStatusAction(input: { statusDate?: string } = {}) {
  const parsed = matrixSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  try {
    return { data: await loadMyTodaySopStatus(parsed.data.statusDate) };
  } catch (error) {
    return { error: toActionError(error) };
  }
}

export async function submitSopCheckpointAction(input: unknown) {
  const parsed = submitCheckpointSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  try {
    const data = await submitMySopCheckpoint(parsed.data);
    revalidatePath("/dashboard");
    return { data, success: true };
  } catch (error) {
    return { error: toActionError(error) };
  }
}

export async function getGroupSopStatusesAction(input: unknown) {
  const parsed = groupStatusSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  try {
    return { data: await loadGroupSopStatuses(parsed.data.groupId, parsed.data.statusDate) };
  } catch (error) {
    return { error: toActionError(error) };
  }
}

export async function getMyReviewQueueAction(input: { statusDate?: string } = {}) {
  const parsed = matrixSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  try {
    return { data: await loadMyReviewQueue(parsed.data.statusDate) };
  } catch (error) {
    return { error: toActionError(error) };
  }
}

export async function reviewSopCheckpointAction(input: unknown) {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  try {
    const data = await reviewSopCheckpoint(parsed.data);
    revalidatePath("/dashboard");
    revalidatePath("/admin");
    return { data, success: true };
  } catch (error) {
    return { error: toActionError(error) };
  }
}

export async function getSopMatrixAction(input: { statusDate?: string } = {}) {
  const parsed = matrixSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  try {
    return { data: await loadSopMatrix(parsed.data.statusDate) };
  } catch (error) {
    return { error: toActionError(error) };
  }
}

export async function getMemberSopStatusAction(input: unknown) {
  const parsed = memberStatusSchema.safeParse(input);
  if (!parsed.success) return { error: validationError(parsed.error) };

  try {
    return { data: await loadMemberSopStatus(parsed.data.targetUserId, parsed.data.statusDate) };
  } catch (error) {
    return { error: toActionError(error) };
  }
}
