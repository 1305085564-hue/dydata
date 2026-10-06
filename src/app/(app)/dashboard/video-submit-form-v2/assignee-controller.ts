"use client";

import type { MutableRefObject } from "react";
import { useCallback } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { hasActualFieldChange } from "@/lib/daily-report-data-source";
import { addRoleOverride as addSubmissionRoleOverride, removeRoleOverride as removeSubmissionRoleOverride, setOperatorUser as resolveSelectedOperatorUserId, type SubmissionAssigneeRole } from "../video-submit-form-state";
import type { FormMetaState } from "../video-submit-form-model";

type Setter<T> = (next: T | ((current: T) => T)) => void;
type OperatorMember = { id: string };
export type AssigneeControllerOptions = {
  userId: string; operatorMembers: OperatorMember[]; metaRef: MutableRefObject<FormMetaState>;
  setMeta: Setter<FormMetaState>; markManualEdit: () => void;
  setHasManualScriptAuthorSelection: Setter<boolean>; setHasManualOperatorSelection: Setter<boolean>;
  setHiddenRoles: Setter<Set<SubmissionAssigneeRole>>;
};

export function useAssigneeController({ userId, operatorMembers, metaRef, setMeta, markManualEdit, setHasManualScriptAuthorSelection, setHasManualOperatorSelection, setHiddenRoles }: AssigneeControllerOptions) {
  const setRoleUser = useCallback(
    (
      role: SubmissionAssigneeRole,
      id: string,
      options: { isManual?: boolean } = {},
    ) => {
      const operatorUserId = resolveSelectedOperatorUserId(id);
      if (
        operatorMembers.length > 0 &&
        !operatorMembers.some((member) => member.id === operatorUserId)
      ) {
        feedbackToast.error("责任人必须是当前团队或小组中的成员");
        return;
      }
      const assignmentKey =
        role === "script_author"
          ? "scriptAuthorUserId"
          : role === "video_editor"
            ? "videoEditorUserId"
            : "operatorUserId";
      const currentMeta = metaRef.current;
      const roleOverrideChanged = operatorUserId === userId
        ? currentMeta.roleOverrides.includes(role)
        : !currentMeta.roleOverrides.includes(role);
      if (
        (options.isManual ?? true) &&
        (hasActualFieldChange(currentMeta[assignmentKey], operatorUserId) || roleOverrideChanged)
      ) {
        markManualEdit();
      }
      setMeta((current) => {
        const next =
          operatorUserId === userId
            ? removeSubmissionRoleOverride({
                userId,
                role,
                assignments: current,
                overrides: current.roleOverrides,
              })
            : addSubmissionRoleOverride({
                userId,
                role,
                assignments: current,
                overrides: current.roleOverrides,
              });
        return {
          ...current,
          ...next.assignments,
          [assignmentKey]: operatorUserId,
          roleOverrides: next.overrides,
        };
      });
      if (role === "script_author")
        setHasManualScriptAuthorSelection(options.isManual ?? true);
      if (role === "operator")
        setHasManualOperatorSelection(options.isManual ?? true);
    },
    [markManualEdit, metaRef, operatorMembers, setHasManualOperatorSelection, setHasManualScriptAuthorSelection, setMeta, userId],
  );

  const removeRoleOverride = useCallback(
    (role: SubmissionAssigneeRole) => {
      const assignmentKey =
        role === "script_author"
          ? "scriptAuthorUserId"
          : role === "video_editor"
            ? "videoEditorUserId"
            : "operatorUserId";
      const currentMeta = metaRef.current;
      if (
        hasActualFieldChange(currentMeta[assignmentKey], userId) ||
        currentMeta.roleOverrides.includes(role)
      ) {
        markManualEdit();
      }
      setMeta((current) => {
        const next = removeSubmissionRoleOverride({
          userId,
          role,
          assignments: current,
          overrides: current.roleOverrides,
        });
        return {
          ...current,
          ...next.assignments,
          roleOverrides: next.overrides,
        };
      });
      if (role === "script_author") setHasManualScriptAuthorSelection(false);
      if (role === "operator") setHasManualOperatorSelection(false);
    },
    [markManualEdit, metaRef, setHasManualOperatorSelection, setHasManualScriptAuthorSelection, setMeta, userId],
  );

  const hideRole = useCallback(
    (role: SubmissionAssigneeRole) => {
      removeRoleOverride(role);
      setHiddenRoles((prev) => {
        const next = new Set(prev);
        next.add(role);
        return next;
      });
    },
    [removeRoleOverride, setHiddenRoles],
  );

  const showAllRoles = useCallback(() => {
    setHiddenRoles(new Set());
  }, [setHiddenRoles]);

  const setOperatorToSelf = useCallback(() => {
    removeRoleOverride("operator");
  }, [removeRoleOverride]);

  const setOperatorUser = useCallback(
    (id: string, options: { isManual?: boolean } = {}) => {
      setRoleUser("operator", id, options);
    },
    [setRoleUser],
  );

  const setScriptAuthorUser = useCallback(
    (id: string, options: { isManual?: boolean } = {}) => {
      setRoleUser("script_author", id, options);
    },
    [setRoleUser],
  );

  return { setRoleUser, removeRoleOverride, hideRole, showAllRoles, setOperatorToSelf, setOperatorUser, setScriptAuthorUser };
}
