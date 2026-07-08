export type VideoReviewAdminAction = {
  key: "dashboard";
  label: "产量看板";
};

const VIDEO_REVIEW_ADMIN_ACTIONS: VideoReviewAdminAction[] = [
  { key: "dashboard", label: "产量看板" },
];

export function getVideoReviewAdminActions(): VideoReviewAdminAction[] {
  return VIDEO_REVIEW_ADMIN_ACTIONS;
}
