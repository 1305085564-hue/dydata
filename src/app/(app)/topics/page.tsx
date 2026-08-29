import React from "react";
import { redirect } from "next/navigation";
import { TopicHubV2 } from "@/components/topics-v2/TopicHubV2";
import { getCurrentUserContext } from "@/lib/current-user-context";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { hasCompanyPermission } from "@/lib/permission-utils";
import { loadFeishuWorkspaceUrl } from "@/lib/topics/feishu-workspace";
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

  // 管理端入口（外部干货批量导入等）由服务端真实权限判定，不做页面隐藏式授权
  const permissionContext = await getCurrentPermissionContext();
  const canManageTopicLibrary = permissionContext
    ? hasCompanyPermission(permissionContext.permissionInfo.companyRole, "review_content")
    : false;

  // 团队固定飞书空间地址：服务端读取，非法配置不下发（前端按未配置处理）
  const feishuWorkspaceUrl = await loadFeishuWorkspaceUrl(supabase);

  return <TopicHubV2 canManageTopicLibrary={canManageTopicLibrary} feishuWorkspaceUrl={feishuWorkspaceUrl} />;
}
