import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { RewriteWorkbench } from "@/components/content-tools/rewrite";
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
    <div className="-mx-4 -mt-[calc(var(--app-top-offset)+1.25rem)] sm:-mx-6 h-[100dvh] w-[calc(100%+2rem)] sm:w-[calc(100%+3rem)] overflow-hidden">
      <div className="h-full w-full pt-[var(--app-top-offset)]">
        <RewriteWorkbench />
      </div>
    </div>
  )
}
