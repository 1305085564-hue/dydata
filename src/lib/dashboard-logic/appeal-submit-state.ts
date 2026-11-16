export type AppealStatus = "idle" | "pending" | "resume_pending" | "approved" | "rejected";

export function shouldShowAppealSubmitAction(input: {
  appealRequired: boolean;
  appealPrecheckRequired: boolean;
  appealStatus: AppealStatus;
  isSubmitted: boolean;
}) {
  return !input.isSubmitted && (
    input.appealRequired ||
    input.appealPrecheckRequired ||
    input.appealStatus === "rejected"
  );
}
