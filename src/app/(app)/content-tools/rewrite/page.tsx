import { redirect } from "next/navigation";
import type { Metadata } from "next";

import RewriteWorkbench from "@/components/content-tools/RewriteWorkbench";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: 'AI 文案改写 | 抖音数据平台',
  description: '输入原文，一键改写成爆款文案。',
}

export default async function RewritePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="h-[calc(100vh-64px)] w-full">
      <RewriteWorkbench />
    </div>
  )
}
