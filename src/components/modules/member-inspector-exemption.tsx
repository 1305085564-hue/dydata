import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { canManagePermanentExemption, type PermanentExemptionState } from "@/app/(app)/admin/modules/permanent-exemption-logic";
import type { CompanyRole } from "@/types";
import type { ProfileSummary } from "@/lib/modules/types";
import { cn } from "@/lib/utils";

type MemberInspectorExemptionProps = {
  activeMember: ProfileSummary;
  currentCompanyRole: CompanyRole | null;
  activeMemberExemptionState: PermanentExemptionState;
  isPermanentSubmitting: boolean;
  setClearPermanentTarget: (member: ProfileSummary) => void;
  setSetPermanentTarget: (member: ProfileSummary) => void;
  setPermanentReason: (reason: string) => void;
  setPermanentReasonError: (error: string | null) => void;
};

export function MemberInspectorExemption({
  activeMember,
  currentCompanyRole,
  activeMemberExemptionState,
  isPermanentSubmitting,
  setClearPermanentTarget,
  setSetPermanentTarget,
  setPermanentReason,
  setPermanentReasonError,
}: MemberInspectorExemptionProps) {
  return (
    <>
                      {/* 不参与考核 (仅公司所有者可见和操作，判定收口在 permanent-exemption-logic) */}
                      {canManagePermanentExemption(currentCompanyRole) && activeMember.membership_status !== "archived" && (
                        <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-[#F7F7F6] transition-colors">
                          <div className="flex items-center gap-2 min-w-0 flex-1 mr-3">
                            <ShieldOff
                              className={cn(
                                "size-3.5 shrink-0",
                                activeMemberExemptionState.isPermanent
                                  ? "text-[#1F1E1D]"
                                  : "text-[#78716C]"
                              )}
                            />
                            <div className="flex flex-col min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] text-[#1F1E1D]">不参与考核</span>
                                {activeMemberExemptionState.isPermanent ? (
                                  <span className="text-[12px] px-1.5 py-0.5 rounded-md font-normal bg-[#F1F1F0] text-[#78716C] shrink-0">
                                    已设置不参与考核
                                  </span>
                                ) : activeMemberExemptionState.isTemporary ? (
                                  <span className="text-[12px] px-1.5 py-0.5 rounded-md font-normal bg-[#F1F1F0] text-[#78716C] shrink-0">
                                    临时豁免中
                                  </span>
                                ) : null}
                              </div>
                              {activeMemberExemptionState.isPermanent && activeMember.exempt_reason ? (
                                <span
                                  className="text-[12px] text-[#78716C] truncate max-w-[280px]"
                                  title={activeMember.exempt_reason}
                                >
                                  原因：{activeMember.exempt_reason}
                                </span>
                              ) : activeMemberExemptionState.isTemporary && activeMember.exempt_end_date ? (
                                <span className="text-[12px] text-[#78716C]">
                                  临时豁免至 {activeMember.exempt_end_date}，设为永久将优先
                                </span>
                              ) : (
                                <span className="text-[12px] text-[#78716C]">
                                  开启后不再进入应交与缺交考核统计
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {activeMemberExemptionState.isPermanent ? (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="xs"
                                  disabled={isPermanentSubmitting}
                                  onClick={() => setClearPermanentTarget(activeMember)}
                                  className="h-7 px-2.5 text-[12px] font-normal text-[#C0685C] hover:text-[#C0685C] hover:bg-[#C0685C]/10 hover:border-[#C0685C]/30 rounded-md"
                                >
                                  撤销
                                </Button>
                                <Switch
                                  checked={true}
                                  disabled={isPermanentSubmitting}
                                  onCheckedChange={() => setClearPermanentTarget(activeMember)}
                                  aria-label="撤销不参与考核"
                                />
                              </>
                            ) : (
                              <Switch
                                checked={false}
                                disabled={isPermanentSubmitting}
                                onCheckedChange={() => {
                                  setSetPermanentTarget(activeMember);
                                  setPermanentReason("");
                                  setPermanentReasonError(null);
                                }}
                                aria-label="设为不参与考核"
                              />
                            )}
                          </div>
                        </div>
                      )}
    </>
);
}
