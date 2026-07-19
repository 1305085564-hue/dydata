import { NextResponse } from "next/server";

import { requireScopedAdminVideo } from "@/lib/admin-scoped-video";
import {
  getCurrentMetricRow,
  getReferenceMetrics,
  type RefKey,
} from "@/lib/content-comparison-reference";
import { computeAttribution } from "@/lib/content-attribution";

export async function GET(
  request: Request,
  context: { params: Promise<{ videoId: string }> },
) {
  const { videoId } = await context.params;
  const access = await requireScopedAdminVideo({ videoId, pathname: "/admin/content" });
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const ref = (searchParams.get("ref") ?? "self") as RefKey;
  const refUserId = searchParams.get("refUserId");

  if (ref === "user" && !refUserId) {
    return NextResponse.json({ error: "ref=user 时必须提供 refUserId" }, { status: 400 });
  }

  const supabase = access.supabase;
  const { video } = access;

  const [currentRow, { reference, refLabel }] = await Promise.all([
    getCurrentMetricRow(supabase, videoId),
    getReferenceMetrics({
      supabase,
      videoId,
      video,
      ref,
      refUserId,
    }),
  ]);

  const result = computeAttribution(videoId, currentRow, reference, ref, refLabel);

  return NextResponse.json(result);
}
