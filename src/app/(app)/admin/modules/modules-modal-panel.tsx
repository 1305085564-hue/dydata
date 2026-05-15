"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

import type { AdminModulesData } from "@/lib/loaders/admin-modules";

import { AdminModulesContent } from "./modules-content";

interface ModulesModalPanelProps {
  initialDate: string;
}

function ModulesModalSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
      <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
    </div>
  );
}

export function ModulesModalPanel({ initialDate }: ModulesModalPanelProps) {
  const [data, setData] = useState<AdminModulesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadPanel() {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set("date", initialDate);

        const response = await fetch(`/api/admin/panels/modules?${params.toString()}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as AdminModulesData & { error?: string };

        if (!response.ok || payload.error) {
          throw new Error(payload.error || "加载权限模块失败");
        }

        if (!cancelled) {
          setData(payload);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "加载权限模块失败");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadPanel();

    return () => {
      cancelled = true;
    };
  }, [initialDate]);

  if (isLoading && !data) {
    return <ModulesModalSkeleton />;
  }

  if (error && !data) {
    return <div className="rounded-2xl border border-zinc-200 border-l-[2px] border-l-[#C9604D] bg-zinc-50 px-4 py-3 text-[13px] text-[#C9604D]">{error}</div>;
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-[13px] leading-[1.7] text-zinc-500">
          这个面板只在打开时按需加载权限、数据修正和审计日志，不再复用首页的重型后台总 loader。
        </p>
      </div>
      {isLoading ? <ModulesModalSkeleton /> : null}
      {error ? <div className="rounded-2xl border border-zinc-200 border-l-[2px] border-l-[#C9604D] bg-zinc-50 px-4 py-3 text-[13px] text-[#C9604D]">{error}</div> : null}
      <AdminModulesContent
        currentUserId={data.currentUserId}
        currentUserRole={data.perm.role}
        currentUserPermissions={data.perm.permissions}
        permissionManagerCapabilities={data.permissionManagerCapabilities}
        allProfiles={data.allProfiles}
        teams={data.teams}
        teamManagement={data.teamManagement}
        fullReports={data.fullReports}
        defaultDate={data.queryDate}
        avgPlayBySubmitter={data.avgPlayBySubmitter}
        dayCountBySubmitter={data.dayCountBySubmitter}
        avgPlayByAccount={data.avgPlayByAccount}
        dayCountByAccount={data.dayCountByAccount}
      />
    </div>
  );
}
