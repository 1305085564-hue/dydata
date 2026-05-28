import { NextResponse } from "next/server";

import { listForUser } from "@/lib/notifications/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const notifications = await listForUser(user.id);

  const counts = {
    unread: notifications.filter((row) => row.status === "unread").length,
    todoOpen: notifications.filter(
      (row) => row.category === "todo" && (row.status === "unread" || row.status === "read"),
    ).length,
  };

  return NextResponse.json(
    { notifications, counts },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
