import { hasPermission } from "@/lib/permission-utils";
import type { Permissions, UserRole } from "@/types";

import { AuditLogList } from "../audit-log-list";
import { DataManager } from "../data-manager";
import { ExportButton } from "../export-button";
import { PermissionManager } from "../permission-manager";
import { TeamGroupManager } from "../team-group-manager";
import { TeamManager } from "../team-manager";

interface AdminModulesContentProps {
  currentUserId: string;
  currentUserRole: UserRole;
  currentUserPermissions: Permissions;
  permissionManagerCapabilities: {
    canRemoveMember: boolean;
    canChangeRole: boolean;
    canEditPermissions: boolean;
  };
  allProfiles: Array<{
    id: string;
    name: string;
    email: string | null;
    role: string;
    team_id?: string | null;
    group_id?: string | null;
    team_name: string | null;
    permissions: Permissions | null;
  }>;
  teams: Array<{ id: string; name: string }>;
  teamManagement: Parameters<typeof TeamGroupManager>[0];
  fullReports: Parameters<typeof DataManager>[0]["reports"];
  defaultDate: string;
  avgPlayBySubmitter: Record<string, number>;
  dayCountBySubmitter: Record<string, number>;
  avgPlayByAccount: Record<string, number>;
  dayCountByAccount: Record<string, number>;
  logsWithNames: Parameters<typeof AuditLogList>[0]["logs"];
}

export function AdminModulesContent({
  currentUserId,
  currentUserRole,
  currentUserPermissions,
  permissionManagerCapabilities,
  allProfiles,
  teams,
  teamManagement,
  fullReports,
  defaultDate,
  avgPlayBySubmitter,
  dayCountBySubmitter,
  avgPlayByAccount,
  dayCountByAccount,
  logsWithNames,
}: AdminModulesContentProps) {
  const canManagePermissions =
    permissionManagerCapabilities.canRemoveMember ||
    permissionManagerCapabilities.canChangeRole ||
    permissionManagerCapabilities.canEditPermissions;
  const canEditData = hasPermission(currentUserRole, currentUserPermissions, "edit_data");
  const canExportData = hasPermission(currentUserRole, currentUserPermissions, "export_data");
  const canViewAuditLog = hasPermission(currentUserRole, currentUserPermissions, "view_audit_log");
  const hasVisibleModules = canManagePermissions || canEditData || canExportData || canViewAuditLog;
  const quickLinks = [
    canManagePermissions
      ? {
          href: "#permissions",
          step: "01",
          title: "成员 / 角色 / 权限",
          desc: "先定人和权限边界",
        }
      : null,
    teamManagement.access.canView
      ? {
          href: "#teams-groups",
          step: "02",
          title: "团队 / 分组",
          desc: "再定组织归属",
        }
      : null,
    canManagePermissions
      ? {
          href: "#team-directory",
          step: "03",
          title: "团队目录",
          desc: "维护团队名称",
        }
      : null,
    canEditData
      ? {
          href: "#data-tools",
          step: "04",
          title: "数据管理",
          desc: "修正异常数据",
        }
      : null,
    canViewAuditLog
      ? {
          href: "#audit-log",
          step: "05",
          title: "操作审计",
          desc: "回看后台变更",
        }
      : null,
    canExportData
      ? {
          href: "#export-data",
          step: "06",
          title: "数据导出",
          desc: "输出治理结果",
        }
      : null,
  ].filter((item): item is { href: string; step: string; title: string; desc: string } => Boolean(item));

  if (!hasVisibleModules) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-zinc-500">当前账号没有可用的权限模块权限。</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr),260px] xl:items-start">
      <div className="space-y-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-zinc-50 px-4 py-3">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Workflow
              </span>
              <span className="mt-1 block text-sm font-semibold text-zinc-800">先定人，再定组织，再治理数据</span>
            </div>
            <div className="rounded-xl bg-zinc-50 px-4 py-3">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Members
              </span>
              <span className="mt-1 block text-sm font-semibold text-zinc-800">{allProfiles.length} 个成员档案</span>
            </div>
            <div className="rounded-xl bg-zinc-50 px-4 py-3">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Teams
              </span>
              <span className="mt-1 block text-sm font-semibold text-zinc-800">{teams.length} 个团队目录</span>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {quickLinks.slice(0, 3).map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-zinc-50 hover:shadow-sm"
              >
                <span className="text-[11px] font-semibold text-[#D97757]">{item.step}</span>
                <span className="mt-1 block font-semibold text-zinc-800">{item.title}</span>
                <span className="mt-1 block text-xs text-zinc-500">{item.desc}</span>
              </a>
            ))}
          </div>
        </section>

        {canManagePermissions ? (
        <>
          <div id="permissions" className="scroll-mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-400">Step 01</p>
              <h2 className="text-[18px] font-medium text-zinc-800">成员、角色与权限</h2>
              <p className="text-sm text-zinc-500">先确认成员身份，再调整角色和管理权限，保持原有权限规则不变。</p>
            </div>
            <div className="max-h-[720px] overflow-y-auto pr-1">
              <PermissionManager
                members={allProfiles.map((profile) => ({
                  id: profile.id,
                  name: profile.name,
                  email: profile.email,
                  role: profile.role as UserRole,
                  teamName: profile.team_name,
                  permissions: (profile.permissions ?? {}) as Permissions,
                }))}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                currentUserPermissions={currentUserPermissions}
              />
            </div>
          </div>
          {teamManagement.access.canView ? (
            <div id="teams-groups" className="mt-6 scroll-mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="mb-4 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-400">Step 02</p>
                <h2 className="text-[18px] font-medium text-zinc-800">团队与分组</h2>
                <p className="text-sm text-zinc-500">成员权限确认后，再处理团队、分组、组长和直管成员关系。</p>
              </div>
              <TeamGroupManager
                access={teamManagement.access}
                teams={teamManagement.teams}
                groups={teamManagement.groups}
                profiles={teamManagement.profiles}
                leaderCandidates={teamManagement.leaderCandidates}
              />
            </div>
          ) : null}
          {canManagePermissions ? (
            <div id="team-directory" className="mt-6 scroll-mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="mb-4 space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-400">Step 03</p>
                <h2 className="text-[18px] font-medium text-zinc-800">团队目录</h2>
                <p className="text-sm text-zinc-500">团队名称维护归入权限模块，便于和成员、角色、分组一起处理。</p>
              </div>
              <TeamManager teams={teams} />
            </div>
          ) : null}
        </>
      ) : null}

      {canEditData ? (
        <div id="data-tools" className="scroll-mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-400">Governance</p>
            <h2 className="text-[18px] font-medium text-zinc-800">数据管理与修正</h2>
            <p className="text-sm text-zinc-500">处理异常值、补录和修正，继续复用现有后台编辑逻辑。</p>
          </div>
          <DataManager
            reports={fullReports}
            defaultDate={defaultDate}
            avgPlayBySubmitter={avgPlayBySubmitter}
            dayCountBySubmitter={dayCountBySubmitter}
            avgPlayByAccount={avgPlayByAccount}
            dayCountByAccount={dayCountByAccount}
          />
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        {canViewAuditLog ? (
          <div id="audit-log" className="scroll-mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-400">Audit</p>
              <h2 className="text-[18px] font-medium text-zinc-800">近期操作审计</h2>
              <p className="text-sm text-zinc-500">查看最近后台操作日志，保留原有日志数据来源和展示能力。</p>
            </div>
            <AuditLogList logs={logsWithNames} />
          </div>
        ) : null}

        {canExportData ? (
          <div id="export-data" className="scroll-mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-400">Export</p>
              <h2 className="text-[18px] font-medium text-zinc-800">数据导出</h2>
              <p className="text-sm text-zinc-500">继续使用原有导出接口，按日期范围导出 Excel。</p>
            </div>
            <ExportButton />
          </div>
        ) : null}
      </div>
      </div>

      <aside className="hidden xl:sticky xl:top-24 xl:block">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-400">
            Index Track
          </p>
          <div className="mt-4 space-y-1">
            {quickLinks.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="group grid grid-cols-[32px,1fr] gap-3 rounded-xl px-2 py-2.5 transition hover:bg-zinc-50"
              >
                <span className="flex size-7 items-center justify-center rounded-full border border-zinc-200 text-[11px] font-semibold text-zinc-400 group-hover:border-[#D97757]/40 group-hover:text-[#D97757]">
                  {item.step}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-zinc-800">{item.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-zinc-500">{item.desc}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
