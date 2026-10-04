import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getRoleLabel } from "@/lib/role-label";
import { runtimeRoleForView } from "@/lib/modules/domain/view-rules";
import type { ProfileSummary } from "@/lib/modules/types";
import type { MemberAiSuggestionState } from "@/app/(app)/admin/modules/member-ai-dialogs";
import { MemberInspectorBody, type MemberInspectorBodyProps } from "./member-inspector-body";

export interface MemberInspectorProps extends Omit<MemberInspectorBodyProps, "activeMember"> {
  activeMember: ProfileSummary | null;
  isCompanyOwner: boolean;
  aiSuggestion: MemberAiSuggestionState | null;
  handleFetchAiSuggestion: () => void;
  setIsAiDialogOpen: (open: boolean) => void;
  closeMemberDrawer: () => void;
}

export function MemberInspector({
  activeMember,
  activeMemberCompanyRole,
  aiSuggestion,
  activeMemberIsReadOnly,
  isCompanyOwner,
  handleFetchAiSuggestion,
  setIsAiDialogOpen,
  closeMemberDrawer,
  ...bodyProps
}: MemberInspectorProps) {
  return (
    <Sheet
      open={activeMember !== null}
      onOpenChange={(open) => {
        if (!open) {
          closeMemberDrawer();
        }
      }}
    >
      {/* ── 2. 全功能右侧工作台抽屉 (整合 v4 Inspector Sheet) ── */}
      <SheetContent showCloseButton={false} className="w-full max-w-xl sm:max-w-xl p-0 flex flex-col bg-white border-l border-[#E2E2DF] shadow-claude-dialog">
        {activeMember && (
          <div className="flex flex-col h-full overflow-hidden">
              {/* 抽屉头部 */}
              <SheetHeader className="pt-5 pb-4 flex flex-row items-start justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-9 rounded-full bg-[#F1F1F0] text-[#1F1E1D] flex items-center justify-center font-normal text-[13px] shrink-0">
                    {activeMember.name ? activeMember.name.slice(0, 1) : "U"}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <SheetTitle className="truncate">
                        {activeMember.membership_status === "archived" ? "归档档案 · " : ""}{activeMember.name || "未命名"}
                      </SheetTitle>
                      <span className="text-[12px] px-1.5 py-0.5 rounded-md font-normal bg-[#F1F1F0] text-[#1F1E1D] shrink-0">
                        {getRoleLabel(runtimeRoleForView(activeMemberCompanyRole), { membershipStatus: activeMember.membership_status })}
                      </span>
                      {activeMember.membership_status === "archived" && (
                        <span className="text-[12px] px-1.5 py-0.5 rounded-md font-normal bg-[#F1F1F0] text-[#78716C] shrink-0">
                          已归档
                        </span>
                      )}
                      {isCompanyOwner && activeMember.membership_status !== "archived" && activeMember.exempt_type === "permanent" && (
                        <span className="text-[12px] px-1.5 py-0.5 rounded-md font-normal bg-[#F1F1F0] text-[#78716C] shrink-0">
                          不参与考核
                        </span>
                      )}
                    </div>
                    <SheetDescription className="text-[13px] text-[#1F1E1D] mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      {activeMember.team_name && <span>{activeMember.team_name}</span>}
                      {activeMember.email && (
                        <>
                          {activeMember.team_name && <span className="text-[#E2E2DF]">·</span>}
                          <span className="truncate">{activeMember.email}</span>
                        </>
                      )}
                      {activeMember.last_sign_in_at && (
                        <>
                          <span className="text-[#E2E2DF]">|</span>
                          <span className="text-[12px] text-[#78716C]">
                            上次登录：{activeMember.last_sign_in_at.slice(0, 16).replace("T", " ")}
                          </span>
                        </>
                      )}
                    </SheetDescription>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {activeMember.membership_status !== "archived" && !activeMemberIsReadOnly && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        setIsAiDialogOpen(true);
                        if (!aiSuggestion) handleFetchAiSuggestion();
                      }}
                      className="h-7 px-2.5 text-[13px] font-normal text-[#1F1E1D] hover:text-[#D97757] hover:border-[#D97757]/40 gap-1 rounded-md"
                    >
                      <Sparkles className="size-3.5 text-[#D97757]" />
                      AI 诊断
                    </Button>
                  )}
                  <button
                    type="button"
                    aria-label="关闭成员权限详情"
                    onClick={() => {
                      closeMemberDrawer();
                    }}
                    className="p-1.5 text-[#78716C] hover:text-[#1F1E1D] hover:bg-[#EBEBE9] rounded-md transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </SheetHeader>
            <MemberInspectorBody
              activeMember={activeMember}
              activeMemberCompanyRole={activeMemberCompanyRole}
              activeMemberIsReadOnly={activeMemberIsReadOnly}
              {...bodyProps}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
