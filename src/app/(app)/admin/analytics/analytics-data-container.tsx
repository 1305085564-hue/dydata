import { requireAdminActor } from "@/app/api/admin/auth-helper";
import { buildPermissionContextForActor } from "@/lib/current-permission-context";
import { type AnalyticsRangePreset } from "@/lib/analytics-access";
import { loadAnalyticsPageData } from "@/lib/loaders/analytics-page";
import { AnalyticsContent } from "./analytics-content";

interface AnalyticsDataContainerProps {
  userId: string;
  preset: string;
  from?: string;
  to?: string;
}

export async function AnalyticsDataContainer({
  userId,
  preset,
  from,
  to,
}: AnalyticsDataContainerProps) {
  const actorResult = await requireAdminActor({ requiredPermission: "view_analytics" });
  if ("error" in actorResult) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-600">
        加载失败：无权查看该分析数据 ({actorResult.error})
      </div>
    );
  }

  const permissionContext = await buildPermissionContextForActor(actorResult.actor);
  if (!permissionContext) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-600">
        加载失败：用户权限上下文加载失败
      </div>
    );
  }

  const pageData = await loadAnalyticsPageData({
    userId,
    preset: preset as AnalyticsRangePreset,
    from,
    to,
    permissionInfo: permissionContext.permissionInfo,
    scope: permissionContext.scope,
  });

  return (
    <AnalyticsContent
      userId={userId}
      initialData={pageData}
    />
  );
}
