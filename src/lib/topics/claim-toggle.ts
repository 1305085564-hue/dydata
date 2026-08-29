export function getClaimToggleRequest(subTopicId: string, isClaimedByMe: boolean) {
  const action = isClaimedByMe ? "return" : "claim";

  return {
    endpoint: `/api/topics/sub-topics/${subTopicId}/${action}`,
    successMessage: isClaimedByMe ? "已取消写作状态" : "已开始写作",
  };
}
