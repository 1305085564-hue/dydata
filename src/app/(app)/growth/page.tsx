import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import GrowthLoading from "./loading";
import { GrowthDataContainer } from "./growth-data-container";

export const metadata: Metadata = {
  title: "成长大盘",
  description: "查看个人与团队的抖音数据趋势、复盘表现和成长进度。",
};

export default async function GrowthPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <Suspense fallback={<GrowthLoading />}>
      <GrowthDataContainer userId={user.id} userEmail={user.email} />
    </Suspense>
  );
}
