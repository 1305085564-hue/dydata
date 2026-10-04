import type { Dispatch, SetStateAction } from "react";
import { Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterBar } from "@/components/ui/filter-bar";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ALL_TEAMS_ID, countProfilesInTeamForView } from "@/app/(app)/admin/modules/team-view-logic";
import { truncateTeamName } from "@/lib/modules/domain/view-rules";
import type { ProfileSummary, TeamOption } from "@/lib/modules/types";

type ReplaceWorkspaceUrl = (next: Partial<{ view: "active" | "archived"; team: string; query: string; memberId: string | null }>) => void;

export function MemberToolbar({
  selectedTeamId,
  setSelectedTeamId,
  profilesForCurrentView,
  memberView,
  localTeams,
  canManageTeamStructure,
  setTeamManagementDialogOpen,
  replaceWorkspaceUrl,
  searchQuery,
  setSearchQuery,
  localProfiles,
  localArchivedProfiles,
  filteredProfiles,
  setMemberView,
  setActiveMemberId,
  setSelectedMemberIds,
}: {
  selectedTeamId: string;
  setSelectedTeamId: Dispatch<SetStateAction<string>>;
  profilesForCurrentView: ProfileSummary[];
  memberView: "active" | "archived";
  localTeams: TeamOption[];
  canManageTeamStructure: boolean;
  setTeamManagementDialogOpen: Dispatch<SetStateAction<boolean>>;
  replaceWorkspaceUrl: ReplaceWorkspaceUrl;
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  localProfiles: ProfileSummary[];
  localArchivedProfiles: ProfileSummary[];
  filteredProfiles: ProfileSummary[];
  setMemberView: Dispatch<SetStateAction<"active" | "archived">>;
  setActiveMemberId: Dispatch<SetStateAction<string | null>>;
  setSelectedMemberIds: Dispatch<SetStateAction<string[]>>;
}) {
  return (
    <>
      {/* 工具栏：页头之下、内容之上，左对齐同轴 (left = 80px) */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-1">
          <FilterBar>
            {/* 团队选择器 */}
            <Select
              value={selectedTeamId}
              onValueChange={(val) => {
                if (!val) return;
                if (val === "__manage__") {
                  setTeamManagementDialogOpen(true);
                } else {
                  setSelectedTeamId(val);
                  replaceWorkspaceUrl({ team: val });
                }
              }}
            >
              <SelectTrigger size="sm" className="border-0 bg-transparent px-2.5 text-[13px] font-normal text-[#1F1E1D] hover:bg-[#EBEBE9] rounded-md shadow-none focus-visible:ring-1 focus-visible:ring-[#141413]/10 data-popup-open:bg-[#F1F1F0]">
                <SelectValue>
                  {selectedTeamId === ALL_TEAMS_ID
                    ? `全员 (${profilesForCurrentView.length})`
                    : (() => {
                        const currentTeam = localTeams.find((t) => t.id === selectedTeamId);
                        if (!currentTeam) return "全员";
                          const count = countProfilesInTeamForView(profilesForCurrentView, memberView, currentTeam.id);
                          return `${truncateTeamName(currentTeam.name, 10)} (${count})`;
                        })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-[#E2E2DF] bg-[#FCFCFB] shadow-claude-float min-w-44 py-1">
                  <SelectItem value={ALL_TEAMS_ID}>
                    全员 ({profilesForCurrentView.length})
                  </SelectItem>
                  {localTeams.map((t) => {
                    const count = countProfilesInTeamForView(profilesForCurrentView, memberView, t.id);
                    return (
                      <SelectItem key={t.id} value={t.id}>
                        {truncateTeamName(t.name, 10)} ({count})
                      </SelectItem>
                    );
                  })}
                  {canManageTeamStructure && <SelectSeparator />}
                  {canManageTeamStructure && (
                    <SelectItem value="__manage__" className="text-[#78716C] hover:text-[#141413]">
                      管理架构…
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>

              {/* 16px 呼吸竖线 */}
              <span className="text-[#E2E2DF] mx-1 select-none" aria-hidden="true">|</span>

              {/* 搜索框：微胶囊 */}
              <div className="relative">
                <Search className="absolute left-3 top-2 size-3.5 text-[#78716C]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    const nextQuery = e.target.value;
                    setSearchQuery(nextQuery);
                    replaceWorkspaceUrl({ query: nextQuery });
                  }}
                  placeholder="搜索成员姓名或邮箱…"
                  className="h-7 pl-8 pr-4 text-[13px] bg-[#FCFCFB]/50 border border-[#E2E2DF] shadow-input hover:border-[#78716C]/40 rounded-full w-48 sm:w-56 focus-visible:w-64 focus-visible:bg-white focus-visible:border-[#78716C] focus-visible:ring-1 focus-visible:ring-[#141413]/10 focus-visible:ring-offset-0 outline-none transition-all placeholder:text-[#78716C]/60"
                />
              </div>

              {canManageTeamStructure && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTeamManagementDialogOpen(true)}
                  className="h-7 px-2 text-[#78716C] hover:text-[#1F1E1D] rounded-md ml-1"
                  title="团队架构设置"
                >
                  <Settings className="size-3.5" />
                </Button>
              )}
            </FilterBar>

            {/* 状态切换与计数 */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 text-[13px]" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={memberView === "active"}
                  onClick={() => {
                    setMemberView("active");
                    replaceWorkspaceUrl({ view: "active", memberId: null });
                  }}
                  className={cn(
                    "transition-colors",
                    memberView === "active"
                      ? "text-[#141413] font-normal"
                      : "text-[#78716C] hover:text-[#1F1E1D]"
                  )}
                >
                  在职 {localProfiles.length}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={memberView === "archived"}
                  onClick={() => {
                    setMemberView("archived");
                    setActiveMemberId(null);
                    setSelectedMemberIds([]);
                    replaceWorkspaceUrl({ view: "archived", memberId: null });
                  }}
                  className={cn(
                    "transition-colors",
                    memberView === "archived"
                      ? "text-[#141413] font-normal"
                      : "text-[#78716C] hover:text-[#1F1E1D]"
                  )}
                >
                  归档 {localArchivedProfiles.length}
                </button>
              </div>

              <span className="text-[12px] text-[#78716C] tabular-nums">
                {filteredProfiles.length}/{profilesForCurrentView.length}
              </span>
              {memberView === "archived" && searchQuery.trim() ? (
                <span className="flex items-center gap-1 text-[12px] text-[#78716C]">
                  搜索仍生效
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      replaceWorkspaceUrl({ query: "" });
                    }}
                    className="font-normal text-[#1F1E1D] hover:underline"
                  >
                    清除搜索
                  </button>
                </span>
              ) : null}
            </div>
          </div>
    </>
  );
}
