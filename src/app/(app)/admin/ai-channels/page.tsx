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
        <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">AI Channels</p>
        <h1 className="mt-2 text-[20px] font-semibold tracking-tight text-zinc-800">AI 功能区</h1>
        <p className="mt-1 text-[13px] leading-[1.7] text-zinc-500">管理模型渠道、优先级切换、功能开关与提示词配置</p>
      </div>
      <AIChannelsClient />
    </div>
  );
}
