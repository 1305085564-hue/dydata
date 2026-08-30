import React from "react";
import { redirect } from "next/navigation";
import { TopicHubV2 } from "@/components/topics-v2/TopicHubV2";
import { getCurrentUserContext } from "@/lib/current-user-context";
import { getCurrentPermissionContext } from "@/lib/current-permission-context";
import { hasCompanyPermission } from "@/lib/permission-utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFeishuWorkspaceUrl } from "@/lib/topics/feishu-workspace";
import { loadTopicLibraryBootstrap } from "@/lib/topics/service";
import {
  parseTopicLibraryBootstrapResponse,
  type V2TopicLibraryBootstrap,
} from "@/lib/topics/v2-client-contract";
import { JoinBanner } from "../_components/join-banner";
import { normalizeDashboardTopicId } from "@/lib/topics/dashboard-context";

export const metadata = {
  title: "选题库 - DYData",
  description: "全流程爆款选题工作舱，第一时间锁定今日高重做价值选题。",
};

export const dynamic = "force-dynamic";

export default async function TopicsV2Page({
  searchParams,
}: {
  searchParams: Promise<{ topic_id?: string | string[] }>;
}) {
  const resolvedSearchParams = await searchParams;
  const initialTopicId = normalizeDashboardTopicId(resolvedSearchParams.topic_id);

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

  // 权限与固定飞书地址互不依赖，并行读取，避免页面服务端渲染串行等待两次数据库请求。
  const [permissionContext, feishuWorkspaceUrl] = await Promise.all([
    // 管理端入口（外部干货批量导入等）由服务端真实权限判定，不做页面隐藏式授权
    getCurrentPermissionContext(),
    // 团队固定飞书空间地址：服务端读取，非法配置不下发（前端按未配置处理）
    loadFeishuWorkspaceUrl(supabase),
  ]);
  const canManageTopicLibrary = permissionContext
    ? hasCompanyPermission(permissionContext.permissionInfo.companyRole, "review_content")
    : false;

  // 页面已经完成服务端身份与权限确认，直接准备首屏数据交给客户端组件，避免首次进入
  // 再绕一圈同用户的 bootstrap API。接口仍保留，作为异常时的客户端兜底和独立调用入口。
  let initialBootstrapData: V2TopicLibraryBootstrap | null = null;
  if (permissionContext) {
    const initialResult = await loadTopicLibraryBootstrap(
      createAdminClient(),
      user.id,
      permissionContext.scope,
    );
    if (initialResult.ok) {
      try {
        initialBootstrapData = parseTopicLibraryBootstrapResponse(initialResult.value);
      } catch {
        // 服务端首屏数据结构异常时交给客户端 bootstrap 接口重新读取并显示真实错误。
        initialBootstrapData = null;
      }
    }
  }

  return (
    <TopicHubV2
      canManageTopicLibrary={canManageTopicLibrary}
      feishuWorkspaceUrl={feishuWorkspaceUrl}
      initialBootstrapData={initialBootstrapData}
      initialTopicId={initialTopicId}
    />
  );
}
