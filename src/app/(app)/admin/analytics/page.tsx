import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { AnalyticsContent } from "./analytics-content";

interface AnalyticsPageProps {
  searchParams: Promise<{
    preset?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const params = await searchParams;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] uppercase tracking-[0.25em] font-medium text-zinc-400">经营分析</p>
        <h1 className="mt-1 text-[18px] font-medium tracking-tight text-zinc-800">经营分析</h1>
      </div>
      <AnalyticsContent userId={user.id} preset={params.preset} from={params.from} to={params.to} />
    </div>
  );
}
