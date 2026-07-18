type FilterableMutation<T> = {
  eq: (column: string, value: string) => T;
};

export function scopeFeedbackCardMutation<T extends FilterableMutation<T>>(
  query: T,
  cardId: string,
  targetUserId: string
) {
  return query.eq("id", cardId).eq("target_user_id", targetUserId);
}
