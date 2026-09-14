export interface TopicWritingStateLike {
  id: string;
  isWritingByMe?: boolean;
  myClaim?: { status?: string | null } | null;
}

export function isTopicWritingByCurrentUser(
  topic: TopicWritingStateLike,
  writingTopicIds: ReadonlySet<string>,
) {
  return (
    topic.isWritingByMe === true ||
    topic.myClaim?.status === "writing" ||
    writingTopicIds.has(topic.id)
  );
}
