export type SubmissionPreferences = {
  scriptAuthorUserId: string | null;
  videoEditorUserId: string | null;
  operatorUserId: string | null;
  topicTag: string;
};

export type LastSubmittedReportPreferences = SubmissionPreferences;

export function resolveVisibleActiveMemberIds(input: {
  userId: string;
  teamId: string | null;
  members: Array<{ id: string; team_id: string | null; membership_status?: string | null }>;
}) {
  return new Set([
    input.userId,
    ...input.members
      .filter((member) =>
        member.membership_status === "active" &&
        (input.teamId ? member.team_id === input.teamId : member.id === input.userId),
      )
      .map((member) => member.id),
  ]);
}

export function resolveCreateSubmissionPreferences(input: {
  userId: string;
  lastReport?: Partial<LastSubmittedReportPreferences> | null;
  draft?: Partial<LastSubmittedReportPreferences> | null;
  visibleMemberIds?: ReadonlySet<string>;
}): SubmissionPreferences {
  const { userId, lastReport, draft, visibleMemberIds } = input;
  const rememberedAssignee = (value: string | null | undefined) =>
    value && (!visibleMemberIds || visibleMemberIds.has(value)) ? value : userId;

  const resolveAssignee = (
    draftValue: string | null | undefined,
    rememberedValue: string | null | undefined,
  ) => {
    if (draftValue != null) return rememberedAssignee(draftValue);
    return rememberedAssignee(rememberedValue);
  };

  const rememberedTag = lastReport?.topicTag;
  const draftTag = draft?.topicTag;

  return {
    scriptAuthorUserId: resolveAssignee(draft?.scriptAuthorUserId, lastReport?.scriptAuthorUserId),
    videoEditorUserId: resolveAssignee(draft?.videoEditorUserId, lastReport?.videoEditorUserId),
    operatorUserId: resolveAssignee(draft?.operatorUserId, lastReport?.operatorUserId),
    topicTag: draftTag ?? (rememberedTag === "干货" || rememberedTag === "复盘" ? rememberedTag : "复盘"),
  };
}
