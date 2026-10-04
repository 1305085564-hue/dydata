import { Archive, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TeamOption } from "@/lib/modules/types";

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
  return (
    <>
      {/* ── 3.1 底部批量操作浮动条 (跟随 v3 风格) ── */}
      {selectedMemberIds.length > 0 && (
        <aside
          aria-label="批量操作"
          className="fixed bottom-[calc(var(--app-bottom-nav-height,0px)+1rem+env(safe-area-inset-bottom,0px))] md:bottom-6 left-1/2 -translate-x-1/2 z-30 flex flex-wrap max-w-[calc(100vw-2rem)] items-center justify-center gap-2 sm:gap-3 rounded-xl border border-[#E2E2DF]/60 bg-[#FCFCFB]/90 backdrop-blur-md px-3.5 sm:px-5 py-2 sm:py-2.5 shadow-claude-float transition-all duration-200 animate-in fade-in slide-in-from-bottom-2"
        >
          <span className="text-[12px] font-normal text-[#141413] pr-3 border-r border-[#E2E2DF]">
            已选 {selectedMemberIds.length} 位成员
          </span>

          {canManageMembers && (
            <div className="relative">
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleBatchTransferTeam(e.target.value);
                    e.target.value = "";
                  }
                }}
                className="h-7 text-[12px] font-normal bg-[#F1F1F0]/70 shadow-input border border-[#E2E2DF] rounded-full px-2.5 pr-6 text-[#1F1E1D] outline-none appearance-none cursor-pointer hover:bg-[#EBEBE9] transition-colors"
              >
                <option value="" disabled>
                  调配至团队…
                </option>
                {localTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-2 size-3 text-[#78716C]" />
            </div>
          )}

          {canManageLifecycle && (
            <Button
              variant="ghost"
              size="s"
              onClick={() => {
                setBatchArchiveReason("");
                setBatchArchiveOpen(true);
              }}
              className="h-7 px-3 text-[12px] text-status-danger hover:bg-status-danger/10 hover:text-status-danger rounded-md font-normal active:scale-[0.99] active:duration-120"
            >
              <Archive className="size-3 mr-1" />
              批量归档
            </Button>
          )}

          <button
            type="button"
            onClick={() => setSelectedMemberIds([])}
            className="rounded-md p-1 text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#1F1E1D] transition-colors"
            title="取消选择"
          >
            <X className="size-3.5" />
          </button>
        </aside>
      )}
    </>
  );
}
