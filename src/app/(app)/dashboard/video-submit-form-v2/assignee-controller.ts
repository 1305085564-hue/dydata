"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { filterOperatorMembers } from "@/lib/video-submit/domain/form-rules";
import {
  fetchCachedOperatorMembers,
  type OperatorMember,
} from "@/lib/video-submit-workflow/operator-members";
import {
  addRoleOverride as addSubmissionRoleOverride,
  removeRoleOverride as removeSubmissionRoleOverride,
  setOperatorUser as resolveSelectedOperatorUserId,
  type SubmissionAssigneeRole,
} from "../video-submit-form-state";
import type { FormMetaState } from "../video-submit-form-model";

type Setter<T> = (next: T | ((current: T) => T)) => void;
export type AssigneeControllerOptions = {
  userId: string;
  memberSearchQuery: string;
  setMeta: Setter<FormMetaState>;
  setHasManualScriptAuthorSelection: Setter<boolean>;
  setHasManualOperatorSelection: Setter<boolean>;
  setHiddenRoles: Setter<Set<SubmissionAssigneeRole>>;
};

export function useAssigneeController({
  userId,
  memberSearchQuery,
  setMeta,
  setHasManualScriptAuthorSelection,
  setHasManualOperatorSelection,
  setHiddenRoles,
}: AssigneeControllerOptions) {
  const [operatorMembers, setOperatorMembers] = useState<OperatorMember[]>([]);

  const loadOperatorMembers = useCallback(() => {
    void fetchCachedOperatorMembers().then((members) => {
      if (Array.isArray(members) && members.length > 0) {
        setOperatorMembers(members);
      }
    });
  }, []);

  useEffect(() => {
    loadOperatorMembers();
  }, [loadOperatorMembers]);

  const filteredModalMembers = useMemo(
    () => filterOperatorMembers(operatorMembers, memberSearchQuery),
    [memberSearchQuery, operatorMembers],
  );

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
    [
      operatorMembers,
      setHasManualOperatorSelection,
      setHasManualScriptAuthorSelection,
      setMeta,
      userId,
    ],
  );

  const removeRoleOverride = useCallback(
    (role: SubmissionAssigneeRole) => {
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
    [
      setHasManualOperatorSelection,
      setHasManualScriptAuthorSelection,
      setMeta,
      userId,
    ],
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

  return {
    operatorMembers,
    filteredModalMembers,
    loadOperatorMembers,
    setRoleUser,
    removeRoleOverride,
    hideRole,
    showAllRoles,
    setOperatorToSelf,
    setOperatorUser,
    setScriptAuthorUser,
  };
}
