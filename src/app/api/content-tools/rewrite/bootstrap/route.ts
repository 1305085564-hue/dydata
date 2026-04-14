import { NextResponse } from "next/server";

import { getRewriteBootstrapPayload, requireRewriteActor } from "@/lib/rewrite/shared";

import { toApiErrorResponse } from "../_shared";

export async function GET() {
  const auth = await requireRewriteActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const payload = await getRewriteBootstrapPayload(auth.serviceClient);
    if (!payload.feature.enabled) {
      return NextResponse.json(
        {
          error: "文案改写功能已关闭",
          ...payload,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    return toApiErrorResponse(error, "初始化数据加载失败");
  }
}
