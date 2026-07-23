export function getClaimToggleRequest(subTopicId: string, isClaimedByMe: boolean) {
  const action = isClaimedByMe ? "return" : "claim";

  return {
    endpoint: `/api/topics/sub-topics/${subTopicId}/${action}`,
    successMessage: isClaimedByMe ? "已放回选题池" : "认领选题成功",
  };
}
