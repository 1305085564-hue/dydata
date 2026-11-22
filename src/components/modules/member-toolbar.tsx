import type { Dispatch, SetStateAction } from "react";
import { Search, Settings, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ALL_TEAMS_ID, UNASSIGNED_TEAM_ID, countProfilesInTeamForView, getProfileTeamIdForView } from "@/lib/modules/domain/team-view-logic";
import { truncateTeamName } from "@/lib/modules/domain/view-rules";
import type { ProfileSummary, TeamOption } from "@/lib/modules/types";

type ReplaceWorkspaceUrl = (next: Partial<{ view: "active" | "archived"; team: string; query: string; memberId: string | null }>) => void;

const QUIET_BUTTON =
  "inline-flex h-7 min-h-[44px] sm:min-h-0 items-center justify-center rounded-md px-3 text-[14px] transition-colors duration-150 cursor-pointer";

/**
 * 工具栏一排：在职 / 归档 ｜ 团队（多于一个才出现）· 搜索 ｜ 管理团队。
 * 不再显示「13/18」这种要人换算的计数；搜索时直接说找到几人。
 */
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
  const unassignedInView = profilesForCurrentView.filter((profile) => !getProfileTeamIdForView(profile, memberView)).length;
  const showUnassignedOption = unassignedInView > 0 || selectedTeamId === UNASSIGNED_TEAM_ID;
  const showTeamSelect = localTeams.length > 1 || showUnassignedOption;

  const teamLabel = (teamId: string) => {
    if (teamId === ALL_TEAMS_ID) return `全部团队 ${profilesForCurrentView.length}`;
    if (teamId === UNASSIGNED_TEAM_ID) return `还没分团队 ${unassignedInView}`;
    const team = localTeams.find((item) => item.id === teamId);
    if (!team) return "全部团队";
    return `${truncateTeamName(team.name, 10)} ${countProfilesInTeamForView(profilesForCurrentView, memberView, team.id)}`;
  };

  const updateQuery = (nextQuery: string) => {
    setSearchQuery(nextQuery);
    replaceWorkspaceUrl({ query: nextQuery });
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2">
      <div role="tablist" aria-label="在职或归档" className="flex items-center gap-1">
        <button
          type="button"
          role="tab"
          aria-selected={memberView === "active"}
          onClick={() => {
            setMemberView("active");
            replaceWorkspaceUrl({ view: "active", memberId: null });
          }}
          className={cn(
            QUIET_BUTTON,
            memberView === "active" ? "bg-[#F1F1F0] text-[#141413]" : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]",
          )}
        >
          在职
          <span className={cn("ml-1 tabular-nums", memberView === "active" ? "text-[#78716C]" : "text-[#A8A29E]")}>
            {localProfiles.length}
          </span>
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
            QUIET_BUTTON,
            memberView === "archived" ? "bg-[#F1F1F0] text-[#141413]" : "text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]",
          )}
        >
          归档
          <span className={cn("ml-1 tabular-nums", memberView === "archived" ? "text-[#78716C]" : "text-[#A8A29E]")}>
            {localArchivedProfiles.length}
          </span>
        </button>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {showTeamSelect && (
          <Select
            value={selectedTeamId}
            onValueChange={(val) => {
              if (!val) return;
              setSelectedTeamId(val);
              replaceWorkspaceUrl({ team: val });
            }}
          >
            <SelectTrigger
              size="sm"
              aria-label="团队"
              className="h-7 w-auto min-w-28 gap-1 rounded-md border-0 bg-transparent px-2 text-[14px] text-[#1F1E1D] tabular-nums shadow-none hover:bg-[#EBEBE9] cursor-pointer"
            >
              <SelectValue>{teamLabel(selectedTeamId)}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl border border-[#E2E2DF] bg-white min-w-44">
              <SelectItem value={ALL_TEAMS_ID} className="text-[14px] tabular-nums">{teamLabel(ALL_TEAMS_ID)}</SelectItem>
              {localTeams.map((team) => (
                <SelectItem key={team.id} value={team.id} className="text-[14px] tabular-nums">
                  {teamLabel(team.id)}
                </SelectItem>
              ))}
              {showUnassignedOption && <SelectSeparator />}
              {showUnassignedOption && (
                <SelectItem value={UNASSIGNED_TEAM_ID} className="text-[14px] tabular-nums">
                  {teamLabel(UNASSIGNED_TEAM_ID)}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-[#78716C]" aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => updateQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && searchQuery) updateQuery("");
            }}
            placeholder="找人：姓名、邮箱、团队"
            aria-label="搜索成员"
            className="h-7 w-56 rounded-md border border-[#E2E2DF] bg-white pl-8 pr-7 text-[14px] text-[#141413] shadow-input outline-none placeholder:text-[#A8A29E] focus-visible:border-[#1F1E1D] focus-visible:ring-2 focus-visible:ring-[#1F1E1D]/10 [&::-webkit-search-cancel-button]:hidden"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="清除搜索"
              onClick={() => updateQuery("")}
              className="absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-md text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {searchQuery.trim() && (
          <span role="status" className="text-[12px] text-[#78716C] tabular-nums">
            找到 {filteredProfiles.length} 人
          </span>
        )}

        {canManageTeamStructure && (
          <button
            type="button"
            onClick={() => setTeamManagementDialogOpen(true)}
            className={cn(QUIET_BUTTON, "gap-1 px-2 text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413]")}
          >
            <Settings className="size-3.5" aria-hidden="true" />
            管理团队
          </button>
        )}
      </div>
    </div>
  );
}
