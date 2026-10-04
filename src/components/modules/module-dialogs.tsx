import { MemberAiDialogs } from "@/app/(app)/admin/modules/member-ai-dialogs";
import type { AiSuggestionItem } from "@/app/(app)/admin/modules/member-ai-dialogs";

import type { ModuleDialogsProps } from "./module-dialogs.types";
import { ModuleDialogsAccount } from "./module-dialogs-account";
import { ModuleDialogsLifecycle } from "./module-dialogs-lifecycle";
import { ModuleDialogsTeam } from "./module-dialogs-team";

export function ModuleDialogs({
  isAiDialogOpen,
  setIsAiDialogOpen,
  aiSuggestion,
  executingAiKey,
  isPending,
  toolConfirmationModal,
  localProfiles,
  localArchivedProfiles,
  selectedMemberIds,
  handleFetchAiSuggestion,
  routerPush,
  handleExecuteAiSuggestion,
  setToolConfirmationModal,
  teamManagementDialogOpen,
  setTeamManagementDialogOpen,
  canManageTeamStructure,
  newTeamName,
  setNewTeamName,
  handleCreateTeam,
  localTeams,
  setDeleteTeamTarget,
  handleDeleteTeam,
  deleteTeamTarget,
  archiveTarget,
  setArchiveTarget,
  archiveReason,
  setArchiveReason,
  handleArchiveMember,
  batchArchiveOpen,
  setBatchArchiveOpen,
  batchArchiveReason,
  setBatchArchiveReason,
  handleBatchArchive,
  restoreTarget,
  setRestoreTarget,
  handleRestoreMember,
  roleChangeConfirm,
  setRoleChangeConfirm,
  handleRoleChangeConfirm,
  passwordResetTarget,
  setPasswordResetTarget,
  newPassword,
  setNewPassword,
  handleResetPassword,
  currentCompanyRole,
  setPermanentTarget,
  setSetPermanentTarget,

  permanentReason,
  setPermanentReason,
  permanentReasonError,
  setPermanentReasonError,
  isPermanentSubmitting,
  handleConfirmSetPermanent,
  clearPermanentTarget,
  setClearPermanentTarget,
  handleConfirmClearPermanent,
}: ModuleDialogsProps) {
  return (
    <>
      {/* ── Dialogs ── */}

      <MemberAiDialogs
        open={isAiDialogOpen}
        onOpenChange={setIsAiDialogOpen}
        suggestion={aiSuggestion}
        executingKey={executingAiKey}
        pending={isPending}
        confirmation={toolConfirmationModal}
        profiles={[...localProfiles, ...localArchivedProfiles]}
        onRefresh={() => void handleFetchAiSuggestion()}
        onNavigate={routerPush}
        onExecute={(suggestion, key) => void handleExecuteAiSuggestion(suggestion, key)}
        onCancelConfirmation={() => setToolConfirmationModal(null)}
        onConfirm={() => {
          if (!toolConfirmationModal) return;
          const fakeSuggestion: AiSuggestionItem = {
            label: "确认执行",
            description: "",
            action: {
              type: "execute_tool",
              toolName: toolConfirmationModal.toolName,
              toolArgs: toolConfirmationModal.toolArgs,
            },
          };
          void handleExecuteAiSuggestion(fakeSuggestion, "confirmed", toolConfirmationModal.confirmationToken);
        }}
      />

      <ModuleDialogsTeam
        teamManagementDialogOpen={teamManagementDialogOpen}
        setTeamManagementDialogOpen={setTeamManagementDialogOpen}
        canManageTeamStructure={canManageTeamStructure}
        newTeamName={newTeamName}
        setNewTeamName={setNewTeamName}
        handleCreateTeam={handleCreateTeam}
        localTeams={localTeams}
        setDeleteTeamTarget={setDeleteTeamTarget}
        handleDeleteTeam={handleDeleteTeam}
        deleteTeamTarget={deleteTeamTarget}
        isPending={isPending}
        localProfiles={localProfiles}
      />

      <ModuleDialogsLifecycle
        isPending={isPending}
        archiveTarget={archiveTarget}
        setArchiveTarget={setArchiveTarget}
        archiveReason={archiveReason}
        setArchiveReason={setArchiveReason}
        handleArchiveMember={handleArchiveMember}
        batchArchiveOpen={batchArchiveOpen}
        setBatchArchiveOpen={setBatchArchiveOpen}
        batchArchiveReason={batchArchiveReason}
        setBatchArchiveReason={setBatchArchiveReason}
        handleBatchArchive={handleBatchArchive}
        selectedMemberIds={selectedMemberIds}
        restoreTarget={restoreTarget}
        setRestoreTarget={setRestoreTarget}
        handleRestoreMember={handleRestoreMember}
        roleChangeConfirm={roleChangeConfirm}
        setRoleChangeConfirm={setRoleChangeConfirm}
        handleRoleChangeConfirm={handleRoleChangeConfirm}
      />

      <ModuleDialogsAccount
        passwordResetTarget={passwordResetTarget}
        setPasswordResetTarget={setPasswordResetTarget}
        newPassword={newPassword}
        setNewPassword={setNewPassword}
        handleResetPassword={handleResetPassword}
        currentCompanyRole={currentCompanyRole}
        setPermanentTarget={setPermanentTarget}
        setSetPermanentTarget={setSetPermanentTarget}
        permanentReason={permanentReason}
        setPermanentReason={setPermanentReason}
        permanentReasonError={permanentReasonError}
        setPermanentReasonError={setPermanentReasonError}
        isPermanentSubmitting={isPermanentSubmitting}
        handleConfirmSetPermanent={handleConfirmSetPermanent}
        clearPermanentTarget={clearPermanentTarget}
        setClearPermanentTarget={setClearPermanentTarget}
        handleConfirmClearPermanent={handleConfirmClearPermanent}
        isPending={isPending}
      />
    </>
  );
}
