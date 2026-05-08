import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AIChannelsClient from "./ai-channels-client";

export default async function AIChannelsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "owner") {
    redirect("/admin");
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">AI Channels</p>
        <h1 className="text-2xl font-black tracking-tight text-zinc-950">AI 功能区</h1>
        <p className="mt-1 text-sm text-zinc-500">管理模型渠道、优先级切换、功能开关与提示词配置</p>
      </div>
      <AIChannelsClient />
    </div>
  );
}
