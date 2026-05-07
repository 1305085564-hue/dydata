import { NextResponse } from "next/server";
import { z } from "zod";

export const checkpointSchema = z.enum(["DATA_REPORT", "MORNING_REVIEW", "TOPIC", "SCRIPT", "VIDEO"]);
export const statusSchema = z.enum(["IDLE", "PENDING", "SUBMITTED", "APPROVED", "REJECTED", "OVERDUE"]);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD").optional();
export const uuidSchema = z.string().uuid();

export const scoreSchema = z.object({
  HOOK: z.number().int().min(0).max(10),
  VIEWPOINT: z.number().int().min(0).max(10),
  COMPLIANCE: z.number().int().min(0).max(10),
  PERFORMANCE_HOOK: z.number().int().min(0).max(10),
  YESTERDAY_REVIEW: z.number().int().min(0).max(10),
  CTA: z.number().int().min(0).max(10),
});

export const optionalTrimmedText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(max).optional().nullable(),
  );

export function readDateParam(searchParams: URLSearchParams) {
  return searchParams.get("date") ??
    searchParams.get("status_date") ??
    searchParams.get("statusDate") ??
    searchParams.get("report_date") ??
    searchParams.get("reportDate") ??
    undefined;
}

export function readGroupParam(searchParams: URLSearchParams) {
  return searchParams.get("group_id") ?? searchParams.get("groupId") ?? undefined;
}

export function parseJsonError(error: z.ZodError) {
  return error.issues[0]?.message ?? "参数格式不正确";
}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "操作失败";
  const status = message.includes("请先登录")
    ? 401
    : message.includes("无权限")
      ? 403
      : message.includes("不存在")
        ? 404
        : message.includes("不能为空") || message.includes("必须") || message.includes("不能从")
          ? 422
          : 500;

  return NextResponse.json({ ok: false, error: message }, { status });
}
