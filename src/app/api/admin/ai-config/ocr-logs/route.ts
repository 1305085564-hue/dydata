import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSystemActor } from "../../ai-channels/_shared";

export async function GET() {
  try {
    await requireSystemActor();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "未授权访问" },
      { status: 401 },
    );
  }

  try {
    const admin = createAdminClient();

    // 1. 存量参考：90 天总数（显式按 90 天窗口过滤，与清理口径一致）
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { count: totalCount } = await admin
      .from("ocr_recognition_logs")
      .select("*", { count: "exact", head: true })
      .gte("created_at", ninetyDaysAgo);

    // 2. 统计样本：最近 1000 条（不足 1000 条按实际）
    const { data: recent1000, error } = await admin
      .from("ocr_recognition_logs")
      .select("id, created_at, duration_ms, ocr_ms, download_ms, channel_name, model_id, screenshot_type, is_success, error_code")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const records = recent1000 ?? [];
    const sampleSize = records.length;

    let avgMs: number | null = null;
    let fastestMs: number | null = null;
    let slowestMs: number | null = null;
    let successRate: number | null = null;

    if (sampleSize > 0) {
      const totalDuration = records.reduce((sum, r) => sum + r.duration_ms, 0);
      avgMs = Math.round(totalDuration / sampleSize);
      fastestMs = Math.min(...records.map((r) => r.duration_ms));
      slowestMs = Math.max(...records.map((r) => r.duration_ms));
      const successCount = records.filter((r) => r.is_success).length;
      successRate = Number((successCount / sampleSize).toFixed(4));
    }

    const summary = {
      total_count_90d: totalCount ?? 0,
      recent_sample_size: sampleSize,
      recent_1000_avg_ms: avgMs,
      recent_1000_fastest_ms: fastestMs,
      recent_1000_slowest_ms: slowestMs,
      recent_1000_success_rate: successRate,
    };

    const logs = records.slice(0, 100);

    return NextResponse.json(
      { summary, logs },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "获取测速台账失败" },
      { status: 500 },
    );
  }
}
