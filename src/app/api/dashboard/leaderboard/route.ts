import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { shiftDateOnly } from "@/lib/loaders/shared";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const userId = user.id;
  const monthAgo = shiftDateOnly(new Date(), -30);

  try {
    const [accountsResult, leaderboardResult] = await Promise.all([
      supabase
        .from("accounts")
        .select("id, content_direction")
        .eq("profile_id", userId)
        .order("created_at", { ascending: true }),
      supabase.rpc("get_leaderboard_rows", { since_date: monthAgo }),
    ]);

    const accountIds = (accountsResult.data ?? []).map((a) => a.id);
    const ownContentDirections = Array.from(
      new Set(
        (accountsResult.data ?? [])
          .map((a) => a.content_direction)
          .filter((d): d is string => Boolean(d))
      )
    );

    return NextResponse.json({
      leaderboardData: leaderboardResult.data ?? [],
      accountIds,
      ownContentDirections,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "加载排行榜失败" },
      { status: 500 }
    );
  }
}
