import { NextResponse } from "next/server";
import { requireActiveTeamContext } from "../_shared";
import { loadFeishuWorkspaceUrl } from "@/lib/topics/feishu-workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireActiveTeamContext();
  if (!auth.ok) return auth.response;

  const url = await loadFeishuWorkspaceUrl(auth.context.supabase);
  return NextResponse.json({ url });
}
