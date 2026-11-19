import { ItemHeading } from "@/components/ui/item-heading";
import { Switch } from "@/components/ui/switch";
import { canManagePermanentExemption, type PermanentExemptionState } from "@/app/(app)/admin/modules/permanent-exemption-logic";
import type { CompanyRole } from "@/types";
import type { ProfileSummary } from "@/lib/modules/types";

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
  if (!canManagePermanentExemption(currentCompanyRole) || activeMember.membership_status === "archived") return null;

  // 不参与考核：仅公司所有者可见和操作，判定收口在 permanent-exemption-logic
  const note = activeMemberExemptionState.isPermanent
    ? activeMember.exempt_reason ? `原因：${activeMember.exempt_reason}` : "已设为不参与考核"
    : activeMemberExemptionState.isTemporary && activeMember.exempt_end_date
      ? `临时豁免到 ${activeMember.exempt_end_date}；设为长期会覆盖它`
      : "打开后不再算应发、缺交";

  return (
    <section className="space-y-1" aria-labelledby="member-exemption-title">
      <ItemHeading as="h4" id="member-exemption-title">考核</ItemHeading>
      <div className="flex min-h-9 items-center justify-between gap-3 py-1">
        <div className="min-w-0">
          <p className="text-[14px] text-[#1F1E1D]">不参与考核</p>
          <p className="truncate text-[12px] text-[#78716C]" title={note}>{note}</p>
        </div>
        <Switch
          checked={activeMemberExemptionState.isPermanent}
          disabled={isPermanentSubmitting}
          onCheckedChange={() => {
            if (activeMemberExemptionState.isPermanent) {
              setClearPermanentTarget(activeMember);
              return;
            }
            setSetPermanentTarget(activeMember);
            setPermanentReason("");
            setPermanentReasonError(null);
          }}
          aria-label={activeMemberExemptionState.isPermanent ? "撤销不参与考核" : "设为不参与考核"}
        />
      </div>
    </section>
  );
}
