import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AIAssistantClient from "./ai-assistant-client";

export default async function AIAssistantPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "owner")) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">AI Assistant</p>
        <h1 className="text-2xl font-black tracking-tight text-zinc-950">后台 AI 助手</h1>
        <p className="mt-1 text-sm text-zinc-500">集中处理问答、操作确认和历史记录</p>
      </div>
      <AIAssistantClient actorRole={profile.role} />
    </div>
  );
}
