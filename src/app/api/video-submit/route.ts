import { POST as postVideoSubmit } from "./route-core";

export const POST = postVideoSubmit;

export {
  buildVideoSubmitResponse,
  defaultVideoSubmitDeps,
  rollbackNewVideoSubmission,
  rollbackSafely,
  type VideoSubmitDeps,
  type VideoSubmissionRollbackRpc,
} from "./route-core";
