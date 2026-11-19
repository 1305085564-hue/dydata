import { Button } from "@/components/ui/button";
import type { TeamOption } from "@/lib/modules/types";

/**
 * 勾选后底部浮出一条：「已选 N 人 · 调到团队… · 归档 · 取消」。
 * 浮在底部不挤动表格（布局零跳动）；纯白实底，不用毛玻璃。
 */
export function MemberBatchActions({
  selectedMemberIds,
  canManageMembers,
  localTeams,
  handleBatchTransferTeam,
  canManageLifecycle,
  setBatchArchiveReason,
  setBatchArchiveOpen,
  setSelectedMemberIds,
}: {
  selectedMemberIds: string[];
  canManageMembers: boolean;
  localTeams: TeamOption[];
  handleBatchTransferTeam: (teamId: string) => void;
  canManageLifecycle: boolean;
  setBatchArchiveReason: (reason: string) => void;
  setBatchArchiveOpen: (open: boolean) => void;
  setSelectedMemberIds: (ids: string[]) => void;
}) {
  if (selectedMemberIds.length === 0) return null;

  return (
    <aside
      aria-label="批量操作"
      className="fixed bottom-[calc(var(--app-bottom-nav-height,0px)+1rem+env(safe-area-inset-bottom,0px))] md:bottom-6 left-1/2 z-30 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xl border border-[#E2E2DF] bg-white px-4 py-2 shadow-claude-float"
    >
      <span className="pr-1 text-[14px] text-[#141413] tabular-nums">已选 {selectedMemberIds.length} 人</span>

      {canManageMembers && (
        <select
          defaultValue=""
          aria-label="把选中的人调到团队"
          onChange={(e) => {
            if (e.target.value) {
              handleBatchTransferTeam(e.target.value);
              e.target.value = "";
            }
          }}
          className="h-7 cursor-pointer rounded-md border border-[#E2E2DF] bg-white px-2 text-[14px] text-[#1F1E1D] shadow-input outline-none hover:bg-[#F7F7F6]"
        >
          <option value="" disabled>
            调到团队…
          </option>
          {localTeams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      )}

      {canManageLifecycle && (
        <Button
          variant="ghost"
          onClick={() => {
            setBatchArchiveReason("");
            setBatchArchiveOpen(true);
          }}
          className="text-status-danger hover:text-status-danger"
        >
          归档
        </Button>
      )}

      <Button variant="ghost" onClick={() => setSelectedMemberIds([])} className="text-[#78716C]">
        取消
      </Button>
    </aside>
  );
}
