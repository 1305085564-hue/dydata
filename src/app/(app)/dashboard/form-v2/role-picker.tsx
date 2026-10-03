"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Check, Search } from "lucide-react";
import type { SubmissionAssigneeRole } from "../video-submit-form-state";
import { cn } from "@/lib/utils";

type RoleSelection = {
  role: SubmissionAssigneeRole;
  label: string;
  selectedUserId: string | null;
};

type OperatorMember = {
  id: string;
  name: string;
  display_name: string;
};

export interface FormV2RolePickerProps {
  selectingRole: RoleSelection | null;
  setSelectingRole: (role: RoleSelection | null) => void;
  memberSearchQuery: string;
  setMemberSearchQuery: (value: string) => void;
  filteredModalMembers: OperatorMember[];
  userId: string;
  selfLabel: string;
  setScriptAuthorUser: (id: string, options?: { isManual?: boolean }) => void;
  hideRole: (role: SubmissionAssigneeRole) => void;
  setRoleUser: (
    role: SubmissionAssigneeRole,
    id: string,
    options?: { isManual?: boolean },
  ) => void;
  setOperatorUser: (id: string, options?: { isManual?: boolean }) => void;
}

export function FormV2RolePicker({
  selectingRole,
  setSelectingRole,
  memberSearchQuery,
  setMemberSearchQuery,
  filteredModalMembers,
  userId,
  selfLabel,
  setScriptAuthorUser,
  hideRole,
  setRoleUser,
  setOperatorUser,
}: FormV2RolePickerProps) {
  return (
    <Dialog
      open={Boolean(selectingRole)}
      onOpenChange={(open) => {
        if (!open) {
          setSelectingRole(null);
          setMemberSearchQuery("");
        }
      }}
    >
      {/* 岗位成员选择弹窗 */}
      <DialogContent className="max-w-xs sm:max-w-sm rounded-2xl bg-white border border-[#E2E2DF] p-3.5 sm:p-4 shadow-claude-dialog">
        <DialogHeader className="pb-2 border-b border-[#E2E2DF]/60">
          <DialogTitle>选择{selectingRole?.label}负责人</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 pt-2.5">
          {/* 搜索框 */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-[#78716C]" />
            <Input
              value={memberSearchQuery}
              onChange={(e) => setMemberSearchQuery(e.target.value)}
              placeholder="搜索团队成员..."
              className="h-8 rounded-md border-[#E2E2DF] bg-white pl-8 text-[12px] text-[#1F1E1D] placeholder:text-[#A8A29E] focus-visible:ring-1 focus-visible:ring-[#141413]/10 focus-visible:border-[#78716C]"
            />
          </div>

          {/* 成员列表 (扩大视口至 320px~340px，搭配发丝细滚条) */}
          <div className="max-h-[300px] sm:max-h-[340px] overflow-y-auto space-y-0.5 pr-1 scrollbar-thin [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#E2E2DF] [&::-webkit-scrollbar-track]:bg-transparent [scrollbar-width:thin] [scrollbar-color:#E2E2DF_transparent]">
            {/* 本人快捷置顶项 */}
            {!memberSearchQuery && (
              <button
                type="button"
                onClick={() => {
                  if (!selectingRole) return;
                  if (selectingRole.role === "script_author") {
                    setScriptAuthorUser(userId, { isManual: true });
                    hideRole("script_author");
                  } else if (selectingRole.role === "video_editor") {
                    setRoleUser("video_editor", userId, { isManual: true });
                    hideRole("video_editor");
                  } else if (selectingRole.role === "operator") {
                    setOperatorUser(userId, { isManual: true });
                    hideRole("operator");
                  }
                  setSelectingRole(null);
                }}
                className={cn(
                  "w-full flex items-center justify-between rounded-md px-2.5 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 text-[12px] sm:text-[13px] transition-colors border cursor-pointer",
                  selectingRole?.selectedUserId === userId || !selectingRole?.selectedUserId
                    ? "bg-[#F1F1F0] text-[#141413] font-normal border-[#E2E2DF]/60 shadow-input"
                    : "border-transparent text-[#1F1E1D] hover:bg-white hover:border-[#E2E2DF]"
                )}
              >
                <div className="flex items-center gap-1">
                  <span>{selfLabel}</span>
                  <span className="rounded-md bg-[#E2E2DF] px-1 py-0.5 text-[12px] text-[#78716C] font-normal">
                    本人
                  </span>
                </div>
                {(selectingRole?.selectedUserId === userId || !selectingRole?.selectedUserId) && (
                  <Check className="size-3.5 stroke-[2.5] text-[#D97757]" />
                )}
              </button>
            )}

            {/* 过滤成员列表 */}
            {filteredModalMembers
              .filter((m) => m.id !== userId)
              .map((member) => {
                const isSelected = selectingRole?.selectedUserId === member.id;
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => {
                      if (!selectingRole) return;
                      if (selectingRole.role === "script_author") {
                        setScriptAuthorUser(member.id, { isManual: true });
                      } else if (selectingRole.role === "video_editor") {
                        setRoleUser("video_editor", member.id, { isManual: true });
                      } else if (selectingRole.role === "operator") {
                        setOperatorUser(member.id, { isManual: true });
                      }
                      setSelectingRole(null);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between rounded-md px-2.5 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 text-[12px] sm:text-[13px] transition-colors border cursor-pointer",
                      isSelected
                        ? "bg-[#F1F1F0] text-[#141413] font-normal border-[#E2E2DF]/60 shadow-input"
                        : "border-transparent text-[#1F1E1D] hover:bg-white hover:border-[#E2E2DF]"
                    )}
                  >
                    <span>{member.display_name || member.name}</span>
                    {isSelected && <Check className="size-3.5 stroke-[2.5] text-[#D97757]" />}
                  </button>
                );
              })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
