"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { LeaderboardDialog } from "./leaderboard-dialog";
import { OperatorTab } from "./operator-tab";
import { WriterTab } from "./writer-tab";
import { StaffTab } from "./staff-tab";
import { TalentTab } from "./talent-tab";
import { WorkGroupListTab } from "./work-group-list-tab";
import { WorkGroupDetailView } from "./work-group-detail-view";
import { WorkGroupManageDrawer } from "./work-group-manage-drawer";
import type { CollaborationDiagnosisDetail } from "@/components/admin/collaboration-work-review-link";
import type { EvaluationStandards } from "@/lib/evaluation-standards";
import type { OperatorRow, StaffRow, TalentRow, WriterCandidateRow, WorkGroupViews, WorkGroupRow, WorkGroupRosterMember } from "@/lib/collaboration/types";
import type { TabKey } from "@/lib/collaboration/domain/workbench-state";
import type { CollaborationPersonContext } from "@/lib/collaboration/data/workbench-loader";
import type { CollaborationSortDir } from "@/lib/collaboration/work-group-navigation";
import { prefetchPerson } from "@/app/(app)/admin/collaboration/workbench-prefetch";

// 图表弹窗按需加载：recharts 只在首次点开个人档案卡时才下载
const PersonalCard = dynamic(
  () => import("./personal-card").then((mod) => mod.PersonalCard),
  {
    ssr: false,
    // 档案卡本身负责唯一的 Sheet 入场动画；动态 chunk 加载期间不再额外挂一层
    // fixed 遮罩和骨架，否则冷点击会先看到一层面板再看到第二层 Sheet 弹入。
    loading: () => null,
  },
);

// 视频详情抽屉按需加载：只在首次点击作品诊断时下载
const ContentDetailDialog = dynamic(
  () =>
    import("@/app/(app)/admin/content/content-detail-dialog").then(
      (mod) => mod.ContentDetailDialog,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
        <Loader2 className="size-6 animate-spin text-white/80" />
      </div>
    ),
  },
);

interface CollaborationWorkbenchContentProps {
  year: number; month: number; view: "roles" | "teams"; tab: TabKey; sortKey?: string | null; sortDir?: CollaborationSortDir; onSortChange?: (next: { sortKey: string; sortOrder: CollaborationSortDir }) => void;
  activeGroupDetail: WorkGroupViews["details"][number] | null | undefined; groupIdNotFound: boolean; resolvedWorkGroupViews?: WorkGroupViews;
  canManageWorkGroups: boolean; canManageVideos: boolean; currentRawGroups: WorkGroupRow[]; currentRoster: WorkGroupRosterMember[]; actorTeamId: string | null; evaluationStandards: EvaluationStandards;
  manageDrawerOpen: boolean; manageDrawerFocusGroupId: string | null; selectedPersonId: string | null; personRole: TabKey; personCardRefreshKey: number; isLoadingTab: boolean; personContext: CollaborationPersonContext; onRefreshData: () => void;
  diagnosisDetail: CollaborationDiagnosisDetail | null; openingReportId: string | null; leaderboardDialogOpen: boolean; rulesEntry?: ReactNode;
  talents: TalentRow[]; operators: OperatorRow[]; writerStaff: StaffRow[]; editorStaff: StaffRow[]; writerCandidates: WriterCandidateRow[]; isOwnerOrTeamAdmin: boolean; currentUserId?: string | null; restrictToSelf?: boolean; loadFailed: boolean;
  onBackToGroupList: () => void; onOpenManageDrawer: (groupId: string | null) => void; onSelectGroup: (id: string) => void; onSelectPerson: (id: string | null) => void;
  onLeaderboardChange: (open: boolean) => void; onCloseDiagnosis: () => void; onLifecycleChanged: () => void; onCloseManageDrawer: () => void;
  onGroupsChange: (groups: WorkGroupRow[]) => void; onRosterChange: (roster: WorkGroupRosterMember[]) => void;
}

export function CollaborationWorkbenchContent({
  year, month, view, tab, sortKey = null, sortDir = "desc", onSortChange, activeGroupDetail, groupIdNotFound, resolvedWorkGroupViews, canManageWorkGroups, canManageVideos, currentRawGroups, currentRoster, actorTeamId, evaluationStandards, manageDrawerOpen, manageDrawerFocusGroupId, selectedPersonId, personRole, personCardRefreshKey, diagnosisDetail, leaderboardDialogOpen, rulesEntry, talents, operators, writerStaff, editorStaff, writerCandidates, isOwnerOrTeamAdmin, currentUserId = null, restrictToSelf = false, loadFailed, isLoadingTab, personContext, onRefreshData, onBackToGroupList, onOpenManageDrawer, onSelectGroup, onSelectPerson, onLeaderboardChange, onCloseDiagnosis, onLifecycleChanged, onCloseManageDrawer, onGroupsChange, onRosterChange,
}: CollaborationWorkbenchContentProps) {
  const evaluationStandardsKey = JSON.stringify(evaluationStandards);
  const isMemberViewer = Boolean(currentUserId && (!isOwnerOrTeamAdmin || restrictToSelf));
  return (
    <>
        {/* Tab / View Content 区域 */}
        {/* 切岗位/小组/页签时新内容淡入（规范 §5.2）；key 变化才重放 */}
        <div key={view === "teams" ? `teams-${activeGroupDetail ? "detail" : "list"}` : tab} className="view-fade-in space-y-5">
        {isLoadingTab ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-[14px] text-[#78716C]" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            正在加载当前页签数据
          </div>
        ) : loadFailed ? (
          <Alert variant="error">
            <span className="font-normal text-[#1F1E1D]">当前页签的数据没加载出来</span>
            <span className="text-[#78716C]">· 切换页签或刷新后重试</span>
          </Alert>
        ) : view === "teams" ? (
          activeGroupDetail ? (
            <WorkGroupDetailView
              detail={activeGroupDetail}
              sortKey={sortKey}
              sortOrder={sortDir}
              onSortChange={onSortChange}
              canManage={canManageWorkGroups}
              currentUserId={currentUserId}
              onBack={onBackToGroupList}
              onOpenManageDrawer={(groupId) => {
                onOpenManageDrawer(groupId);
              }}
              onSelectPerson={onSelectPerson}
              onPrefetchPerson={(id) => prefetchPerson(id, year, month, personRole, evaluationStandardsKey)}
            />
          ) : (
            <>
              {groupIdNotFound && (
                <Alert variant="warning">
                  <span className="font-normal text-[#1F1E1D]">该小队不存在或已被删除</span>
                  <span className="text-[#78716C]">· 已返回小队列表</span>
                </Alert>
              )}
              <WorkGroupListTab
                groups={resolvedWorkGroupViews?.groups ?? []}
                sortKey={sortKey}
                sortOrder={sortDir}
                onSortChange={onSortChange}
                ready={resolvedWorkGroupViews?.ready ?? true}
                canManage={canManageWorkGroups}
                onOpenManageDrawer={() => {
                  onOpenManageDrawer(null);
                }}
                onSelectGroup={onSelectGroup}
              />
            </>
          )
        ) : tab === "talents" ? (
          <TalentTab
            talents={talents}
            sortKey={sortKey}
            sortOrder={sortDir}
            onSortChange={onSortChange}
            rulesEntry={rulesEntry}
            currentUserId={currentUserId}
            isMemberViewer={isMemberViewer}
            onSelectPerson={onSelectPerson}
            onPrefetchPerson={(id) => prefetchPerson(id, year, month, personRole, evaluationStandardsKey)}
          />
        ) : tab === "operators" ? (
          <OperatorTab
            operators={operators}
            sortKey={sortKey}
            sortOrder={sortDir}
            onSortChange={onSortChange}
            currentUserId={currentUserId}
            isMemberViewer={isMemberViewer}
            onSelectPerson={onSelectPerson}
            onPrefetchPerson={(id) => prefetchPerson(id, year, month, personRole, evaluationStandardsKey)}
          />
        ) : tab === "writers" ? (
          <WriterTab
            rows={writerStaff}
            sortKey={sortKey}
            sortOrder={sortDir}
            onSortChange={onSortChange}
            candidates={writerCandidates}
            canCertify={isOwnerOrTeamAdmin && !loadFailed}
            rulesEntry={rulesEntry}
            currentUserId={currentUserId}
            isMemberViewer={isMemberViewer}
            onSelectPerson={onSelectPerson}
            onPrefetchPerson={(id) => prefetchPerson(id, year, month, personRole, evaluationStandardsKey)}
            onRefreshData={onRefreshData}
          />
        ) : (
          <StaffTab
            rows={editorStaff}
            sortKey={sortKey}
            sortOrder={sortDir}
            onSortChange={onSortChange}
            role="editor"
            currentUserId={currentUserId}
            isMemberViewer={isMemberViewer}
            onSelectPerson={onSelectPerson}
            onPrefetchPerson={(id) => prefetchPerson(id, year, month, personRole, evaluationStandardsKey)}
          />
        )}
        </div>

        {/* 账号表现榜中心弹窗 */}
        <LeaderboardDialog
          open={leaderboardDialogOpen}
          onOpenChange={onLeaderboardChange}
          year={year}
          month={month}
        />

        {/* 个人档案卡对话框（内嵌作品诊断子视图，支持单抽屉视口平滑长宽） */}
        <PersonalCard
          userId={selectedPersonId}
          year={year}
          month={month}
          activeTab={personRole}
          ownAccountIds={personContext.ownAccountIds}
          operatorAccounts={personContext.operatorAccounts}
          refreshTrigger={personCardRefreshKey}
          diagnosisDetail={selectedPersonId ? diagnosisDetail : null}
          evaluationStandards={evaluationStandards}
          onCloseDiagnosis={() => onCloseDiagnosis()}
          canManageVideos={canManageVideos}
          onLifecycleChanged={onLifecycleChanged}
          onClose={() => {
            onSelectPerson(null);
            onCloseDiagnosis();
          }}
        />

        {/* 视频诊断独立抽屉：仅在从员工看板等非档案卡直接点击作品时独立滑出 */}
        {diagnosisDetail && !selectedPersonId && (
          <ContentDetailDialog
            open={true}
            onOpenChange={(open) => {
              if (!open) onCloseDiagnosis();
            }}
            video={diagnosisDetail.video}
            snapshot={diagnosisDetail.snapshot}
            contentQuality={diagnosisDetail.contentQuality ?? null}
            topicKind={diagnosisDetail.topicKind ?? null}
            evaluationStandards={evaluationStandards}
            canOperateLifecycle={canManageVideos}
            canPurge={false}
            titlePrefix="协作管理"
            onLifecycleChanged={onLifecycleChanged}
          />
        )}

        {/* 小队编制管理抽屉 */}
        <WorkGroupManageDrawer
          open={manageDrawerOpen}
          onClose={onCloseManageDrawer}
          groups={currentRawGroups}
          roster={currentRoster}
          teamId={actorTeamId}
          initialSelectedGroupId={manageDrawerFocusGroupId}
          onGroupsChange={onGroupsChange}
          onRosterChange={onRosterChange}
        />

    </>
  );
}
