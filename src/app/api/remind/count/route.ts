import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dateParam = request.nextUrl.searchParams.get("date");
  const targetDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : new Date().toISOString().slice(0, 10);

  try {
    // 优先使用 RPC 函数（如果 migration 已执行）
    const { data: rpcData, error: rpcError } = await supabase.rpc("count_remind_logs_for_user", {
      p_user_id: user.id,
      p_target_date: targetDate,
      p_days: 7,
    });

    if (!rpcError && typeof rpcData === "number") {
      return NextResponse.json({ count: rpcData });
    }
  } catch {
    // RPC 不存在时降级到直接查询
  }

  // 降级：直接查询 remind_logs（表可能不存在，做好容错）
  try {
    const sevenDaysAgo = new Date(targetDate);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fromDate = sevenDaysAgo.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("remind_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .lte("target_date", targetDate)
      .gt("target_date", fromDate);

    if (error) {
      // 表不存在时返回 0，不报错
      if (error.message?.includes("remind_logs") && error.message?.includes("does not exist")) {
        return NextResponse.json({ count: 0 });
      }
      return NextResponse.json({ count: 0 });
    }

    return NextResponse.json({ count: data?.length ?? 0 });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
