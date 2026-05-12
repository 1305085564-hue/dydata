import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AIConfigShell, type AIConfigTabKey } from "./ai-config-shell";

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

function normalizeTab(value: string | undefined): AIConfigTabKey {
  return value === "rewrite" ? "rewrite" : "channels";
}

export default async function AIChannelsPage({ searchParams }: Props) {
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

  const params = await searchParams;
  const initialTab = normalizeTab(params.tab);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">AI Config Center</p>
        <h1 className="mt-2 text-[20px] font-semibold tracking-tight text-zinc-800">AI 配置中心</h1>
        <p className="mt-1 text-[13px] leading-[1.7] text-zinc-500">
          渠道、功能绑定、文案改写集中一页维护；员工端只看展示模型，不暴露真实渠道。
        </p>
      </div>
      <AIConfigShell initialTab={initialTab} />
    </div>
  );
}
