"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { LeaderboardDialog } from "./leaderboard-dialog";
import { OperatorTab } from "./operator-tab";
import { WriterTab, type WriterCandidateRow } from "./writer-tab";
import { StaffTab } from "./staff-tab";
import { TalentTab } from "./talent-tab";
import { WorkGroupListTab } from "./work-group-list-tab";
import { WorkGroupDetailView } from "./work-group-detail-view";
import { WorkGroupManageDrawer } from "./work-group-manage-drawer";
import type { CollaborationDiagnosisDetail } from "@/components/admin/collaboration-work-review-link";
import type { OperatorRow, StaffRow, SummaryData, TalentRow, WorkGroupViews, WorkGroupRow, WorkGroupRosterMember } from "./types";
import type { TabKey } from "@/lib/collaboration/domain/workbench-state";
import { prefetchPerson } from "@/lib/collaboration/data/workbench";

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
  year: number; month: number; view: "roles" | "teams"; tab: TabKey;
  activeGroupDetail: WorkGroupViews["details"][number] | null | undefined; groupIdNotFound: boolean; resolvedWorkGroupViews?: WorkGroupViews;
  canManageWorkGroups: boolean; canManageVideos: boolean; currentRawGroups: WorkGroupRow[]; currentRoster: WorkGroupRosterMember[]; actorTeamId: string | null;
  manageDrawerOpen: boolean; manageDrawerFocusGroupId: string | null; selectedPersonId: string | null; personRole: TabKey; personCardRefreshKey: number;
  diagnosisDetail: CollaborationDiagnosisDetail | null; openingReportId: string | null; leaderboardDialogOpen: boolean; summary: SummaryData | null;
  talents: TalentRow[]; operators: OperatorRow[]; writerStaff: StaffRow[]; editorStaff: StaffRow[]; writerCandidates: WriterCandidateRow[]; isOwnerOrTeamAdmin: boolean; loadFailed: boolean;
  onBackToGroupList: () => void; onOpenManageDrawer: (groupId: string | null) => void; onSelectGroup: (id: string) => void; onSelectPerson: (id: string | null) => void;
  onLeaderboardChange: (open: boolean) => void; onCloseDiagnosis: () => void; onLifecycleChanged: () => void; onCloseManageDrawer: () => void;
  onGroupsChange: (groups: WorkGroupRow[]) => void; onRosterChange: (roster: WorkGroupRosterMember[]) => void;
}

export function CollaborationWorkbenchContent({
  year, month, view, tab, activeGroupDetail, groupIdNotFound, resolvedWorkGroupViews, canManageWorkGroups, canManageVideos, currentRawGroups, currentRoster, actorTeamId, manageDrawerOpen, manageDrawerFocusGroupId, selectedPersonId, personRole, personCardRefreshKey, diagnosisDetail, leaderboardDialogOpen, talents, operators, writerStaff, editorStaff, writerCandidates, isOwnerOrTeamAdmin, loadFailed, onBackToGroupList, onOpenManageDrawer, onSelectGroup, onSelectPerson, onLeaderboardChange, onCloseDiagnosis, onLifecycleChanged, onCloseManageDrawer, onGroupsChange, onRosterChange,
}: CollaborationWorkbenchContentProps) {
  return (
    <>
        {/* Tab / View Content 区域 */}
        {view === "teams" ? (
          activeGroupDetail ? (
            <WorkGroupDetailView
              detail={activeGroupDetail}
              canManage={canManageWorkGroups}
              onBack={onBackToGroupList}
              onOpenManageDrawer={(groupId) => {
                onOpenManageDrawer(groupId);
              }}
              onSelectPerson={onSelectPerson}
              onPrefetchPerson={(id) => prefetchPerson(id, year, month, personRole)}
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
            onSelectPerson={onSelectPerson}
            onPrefetchPerson={(id) => prefetchPerson(id, year, month, personRole)}
          />
        ) : tab === "operators" ? (
          <OperatorTab
            operators={operators}
            onSelectPerson={onSelectPerson}
            onPrefetchPerson={(id) => prefetchPerson(id, year, month, personRole)}
          />
        ) : tab === "writers" ? (
          <WriterTab
            rows={writerStaff}
            candidates={writerCandidates}
            canCertify={isOwnerOrTeamAdmin && !loadFailed}
            onSelectPerson={onSelectPerson}
            onPrefetchPerson={(id) => prefetchPerson(id, year, month, personRole)}
          />
        ) : (
          <StaffTab
            rows={editorStaff}
            role="editor"
            isLoading={false}
            onSelectPerson={onSelectPerson}
            onPrefetchPerson={(id) => prefetchPerson(id, year, month, personRole)}
          />
        )}

        {/* 账号表现榜中心弹窗 */}
        <LeaderboardDialog
          open={leaderboardDialogOpen}
          onOpenChange={onLeaderboardChange}
        />

        {/* 个人档案卡对话框（内嵌作品诊断子视图，支持单抽屉视口平滑长宽） */}
        <PersonalCard
          userId={selectedPersonId}
          year={year}
          month={month}
          activeTab={personRole}
          refreshTrigger={personCardRefreshKey}
          diagnosisDetail={selectedPersonId ? diagnosisDetail : null}
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
            topicKind={diagnosisDetail.topicKind ?? null}
            canOperateLifecycle={canManageVideos}
            canPurge={false}
            titlePrefix="数据管理"
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
