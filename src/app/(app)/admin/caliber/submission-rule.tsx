import { VIDEO_SUBMIT_EXPIRED_POST_REVIEW_NOTICE, VIDEO_SUBMIT_MANUAL_POST_REVIEW_NOTICE } from "@/lib/video-submit-deadline";

export function SubmissionRule() {
  return <>{VIDEO_SUBMIT_EXPIRED_POST_REVIEW_NOTICE}；{VIDEO_SUBMIT_MANUAL_POST_REVIEW_NOTICE}。管理员事后核查判为无效的作品不计优结算。</>;
}
