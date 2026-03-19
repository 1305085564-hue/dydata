import { NextRequest, NextResponse } from "next/server";

import { getUserPermissions, isAdminLevel } from "@/lib/permissions";
import {
  createBatchSummary,
  listBatchCandidates,
  normalizeBatchPayload,
  runVideoDiagnosis,
} from "../route";

import { buildBatchResponse, resolveBatchRequest } from "./批量诊断";

export async function POST(request: NextRequest) {
  const permission = await getUserPermissions();

  if (!permission) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!isAdminLevel(permission.role)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  try {
    const payload = resolveBatchRequest(normalizeBatchPayload(body));
    const candidates = await listBatchCandidates(payload);
    const results: Array<{ ok: true; videoId: string } | { ok: false; videoId: string; error: string }> = [];

    for (const candidate of candidates) {
      try {
        await runVideoDiagnosis(candidate.id);
        results.push({ ok: true, videoId: candidate.id });
      } catch (error) {
        results.push({
          ok: false,
          videoId: candidate.id,
          error: error instanceof Error ? error.message : "诊断失败",
        });
      }
    }

    return NextResponse.json(
      buildBatchResponse({
        candidates: candidates.map((candidate) => candidate.id),
        summary: createBatchSummary(results),
      })
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "批量诊断失败" }, { status: 500 });
  }
}
