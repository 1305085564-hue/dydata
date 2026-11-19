import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getRoleLabel } from "@/lib/role-label";
import { archiveSnapshotRoleLabel, runtimeRoleForView } from "@/lib/modules/domain/view-rules";
import { describeLastLogin } from "@/app/(app)/admin/modules/members-page-view";
import { MemberAvatar, QuietChip, RoleChip } from "./member-identity";
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
  const isArchived = activeMember?.membership_status === "archived";
  const login = describeLastLogin(activeMember?.last_sign_in_at);
  return (
    <Sheet
      open={activeMember !== null}
      onOpenChange={(open) => {
        if (!open) {
          closeMemberDrawer();
        }
      }}
    >
      <SheetContent showCloseButton={false} className="w-full max-w-xl sm:max-w-xl p-0 flex flex-col bg-white border-l border-[#E2E2DF] shadow-claude-dialog">
        {activeMember && (
          <div className="flex flex-col h-full overflow-hidden">
              {/* 抽屉头部：名字是标题；身份和团队只说一次，在下面一行 */}
              <SheetHeader className="pt-5 pb-4 flex flex-row items-start justify-between gap-3 shrink-0">
                <div className="flex min-w-0 items-start gap-3">
                  <MemberAvatar name={activeMember.name} size="lg" />
                  <div className="min-w-0 space-y-1">
                    <SheetTitle className="truncate">
                      {activeMember.name || "未命名"}
                      {isArchived && <span className="text-[#78716C]"> · 已归档</span>}
                    </SheetTitle>
                    <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-[#1F1E1D]">
                      {isArchived ? (
                        <QuietChip>{archiveSnapshotRoleLabel(activeMember.archive_snapshot)}</QuietChip>
                      ) : (
                        <RoleChip
                          role={activeMemberCompanyRole}
                          label={getRoleLabel(runtimeRoleForView(activeMemberCompanyRole), { membershipStatus: activeMember.membership_status })}
                        />
                      )}
                      {isCompanyOwner && !isArchived && activeMember.exempt_type === "permanent" && <QuietChip>不参与考核</QuietChip>}
                      {!isArchived && <span>{activeMember.team_name || "还没分团队"}</span>}
                    </SheetDescription>
                    <p className="text-[12px] text-[#78716C] tabular-nums">
                      {[activeMember.email, `上次登录 ${login.text}`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {!isArchived && !activeMemberIsReadOnly && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setIsAiDialogOpen(true);
                        if (!aiSuggestion) handleFetchAiSuggestion();
                      }}
                      className="text-[#1F1E1D]"
                    >
                      <Sparkles className="size-3.5 text-[#78716C]" />
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
