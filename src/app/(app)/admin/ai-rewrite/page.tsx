import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import AIRewriteClient from "./ai-rewrite-client";

export default async function AIRewritePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  if (!profile || profile.role !== "owner") {
    redirect("/admin");
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">AI Rewrite</p>
        <h1 className="mt-2 text-[20px] font-semibold tracking-tight text-zinc-800">AI 配置中心 · 文案改写</h1>
        <p className="mt-1 text-[13px] leading-[1.7] text-zinc-500">把员工端固定能力套餐、自定义模式和真实执行路线放在一页内维护</p>
      </div>
      <AIRewriteClient />
    </div>
  );
}
