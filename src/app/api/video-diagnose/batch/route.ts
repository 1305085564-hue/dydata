import { NextRequest, NextResponse } from "next/server";

import {
  createBatchSummary,
  listBatchCandidates,
  normalizeBatchPayload,
  runVideoDiagnosis,
} from "../route";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const payload = normalizeBatchPayload(body);

  if (!payload.userId && !payload.accountId) {
    return NextResponse.json({ error: "至少提供 user_id 或 account_id" }, { status: 400 });
  }

  try {
    const candidates = await listBatchCandidates(payload);
    const results = [] as Array<{ ok: true; videoId: string } | { ok: false; videoId: string; error: string }>;

    for (const candidate of candidates) {
      try {
        await runVideoDiagnosis(candidate.id);
        results.push({ ok: true, videoId: candidate.id });
      } catch (error) {
        results.push({
          ok: false,
          videoId: candidate.id,
          error: (error as Error).message || "诊断失败",
        });
      }
    }

    return NextResponse.json(createBatchSummary(results));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "批量诊断失败" }, { status: 500 });
  }
}

export { pickBatchCandidates } from "../route";
