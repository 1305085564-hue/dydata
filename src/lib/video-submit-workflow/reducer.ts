import type { SubmissionWorkflowState, WorkflowAction } from "./types";

export type { SubmissionWorkflowState, WorkflowAction } from "./types";

export function createWorkflowState({
  meta,
  fields,
  slots,
}: SubmissionWorkflowState): SubmissionWorkflowState {
  return { meta, fields, slots };
}

export function workflowReducer(
  state: SubmissionWorkflowState,
  action: WorkflowAction,
): SubmissionWorkflowState {
  switch (action.type) {
    case "meta/update":
      return { ...state, meta: action.updater(state.meta) };
    case "fields/update":
      return { ...state, fields: action.updater(state.fields) };
    case "slots/update":
      return { ...state, slots: action.updater(state.slots) };
    case "draft/restore":
      return {
        meta: action.meta,
        fields: action.fields,
        slots: action.slots,
      };
    default:
      return state;
  }
}
