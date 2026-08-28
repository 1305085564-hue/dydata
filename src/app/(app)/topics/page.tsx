import React from "react";
import { redirect } from "next/navigation";
import { TopicHubV2 } from "@/components/topics-v2/TopicHubV2";
import { getCurrentUserContext } from "@/lib/current-user-context";
import { JoinBanner } from "../_components/join-banner";

export const metadata = {
  title: "选题库 - DYData",
  description: "全流程爆款选题工作舱，第一时间锁定今日高重做价值选题。",
};

export const dynamic = "force-dynamic";

export default async function TopicsV2Page() {
  const { supabase, user } = await getCurrentUserContext();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("team_id, membership_status")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.membership_status !== "active" || !profile.team_id) {
    return <JoinBanner />;
  }

  return <TopicHubV2 />;
}
