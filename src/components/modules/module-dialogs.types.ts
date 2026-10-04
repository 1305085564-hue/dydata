import type { Dispatch, SetStateAction } from "react";
import type {
  AiSuggestionItem,
  MemberAiSuggestionState,
  ToolConfirmationState,
} from "@/app/(app)/admin/modules/member-ai-dialogs";
import type { CompanyRole } from "@/types";
import type { ProfileSummary, TeamOption } from "@/lib/modules/types";

export interface ModuleDialogsProps {
  isAiDialogOpen: boolean;
  setIsAiDialogOpen: Dispatch<SetStateAction<boolean>>;
  aiSuggestion: MemberAiSuggestionState | null;
  executingAiKey: string | null;
  isPending: boolean;
  toolConfirmationModal: ToolConfirmationState | null;
  localProfiles: ProfileSummary[];
  localArchivedProfiles: ProfileSummary[];
  selectedMemberIds: string[];
  handleFetchAiSuggestion: () => Promise<void>;
  routerPush: (href: string) => void;
  handleExecuteAiSuggestion: (suggestion: AiSuggestionItem, key: string, confirmationToken?: string) => Promise<void>;
  setToolConfirmationModal: Dispatch<SetStateAction<ToolConfirmationState | null>>;
  teamManagementDialogOpen: boolean;
  setTeamManagementDialogOpen: Dispatch<SetStateAction<boolean>>;
  canManageTeamStructure: boolean;
  newTeamName: string;
  setNewTeamName: Dispatch<SetStateAction<string>>;
  handleCreateTeam: () => void;
  localTeams: TeamOption[];
  setDeleteTeamTarget: Dispatch<SetStateAction<TeamOption | null>>;
  handleDeleteTeam: (team: TeamOption) => void;
  deleteTeamTarget: TeamOption | null;
  archiveTarget: ProfileSummary | null;
  setArchiveTarget: Dispatch<SetStateAction<ProfileSummary | null>>;
  archiveReason: string;
  setArchiveReason: Dispatch<SetStateAction<string>>;
  handleArchiveMember: () => void;
  batchArchiveOpen: boolean;
  setBatchArchiveOpen: Dispatch<SetStateAction<boolean>>;
  batchArchiveReason: string;
  setBatchArchiveReason: Dispatch<SetStateAction<string>>;
  handleBatchArchive: () => void;
  restoreTarget: ProfileSummary | null;
  setRestoreTarget: Dispatch<SetStateAction<ProfileSummary | null>>;
  handleRestoreMember: () => void;
  roleChangeConfirm: { memberId: string; memberName: string; targetRole: "member" | "admin" } | null;
  setRoleChangeConfirm: Dispatch<SetStateAction<{ memberId: string; memberName: string; targetRole: "member" | "admin" } | null>>;
  handleRoleChangeConfirm: () => void;
  passwordResetTarget: ProfileSummary | null;
  setPasswordResetTarget: Dispatch<SetStateAction<ProfileSummary | null>>;
  newPassword: string;
  setNewPassword: Dispatch<SetStateAction<string>>;
  handleResetPassword: () => void;
  currentCompanyRole: CompanyRole | null;
  setPermanentTarget: ProfileSummary | null;
  setSetPermanentTarget: Dispatch<SetStateAction<ProfileSummary | null>>;
  permanentReason: string;
  setPermanentReason: Dispatch<SetStateAction<string>>;
  permanentReasonError: string | null;
  setPermanentReasonError: Dispatch<SetStateAction<string | null>>;
  isPermanentSubmitting: boolean;
  handleConfirmSetPermanent: () => Promise<void>;
  clearPermanentTarget: ProfileSummary | null;
  setClearPermanentTarget: Dispatch<SetStateAction<ProfileSummary | null>>;
  handleConfirmClearPermanent: () => Promise<void>;
}
