import type {
  SubmissionWorkflowState,
  WorkflowAction,
  WorkflowDraftState,
} from "./types";

export type {
  SubmissionWorkflowState,
  WorkflowAction,
  WorkflowDraftState,
} from "./types";

export function createWorkflowState({
  meta,
  fields,
  slots,
  draft,
}: Pick<SubmissionWorkflowState, "meta" | "fields" | "slots"> & {
  draft?: Partial<WorkflowDraftState>;
}): SubmissionWorkflowState {
  return {
    meta,
    fields,
    slots,
    scriptText: draft?.scriptText ?? "",
    keywordInput: draft?.keywordInput ?? "",
    hasManualEdit: draft?.hasManualEdit ?? false,
    hasManualScriptAuthorSelection:
      draft?.hasManualScriptAuthorSelection ?? false,
    hasManualOperatorSelection: draft?.hasManualOperatorSelection ?? false,
  };
}

function readDraftState(state: SubmissionWorkflowState): WorkflowDraftState {
  return {
    scriptText: state.scriptText,
    keywordInput: state.keywordInput,
    hasManualEdit: state.hasManualEdit,
    hasManualScriptAuthorSelection: state.hasManualScriptAuthorSelection,
    hasManualOperatorSelection: state.hasManualOperatorSelection,
  };
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
    case "draft/update":
      return { ...state, ...action.updater(readDraftState(state)) };
    case "ocr/commit":
      return {
        ...state,
        meta: action.meta ? action.meta(state.meta) : state.meta,
        fields: action.fields ? action.fields(state.fields) : state.fields,
        slots: action.slots ? action.slots(state.slots) : state.slots,
        hasManualEdit: action.hasManualEdit ?? state.hasManualEdit,
      };
    case "draft/restore":
      return {
        ...state,
        meta: action.meta,
        fields: action.fields,
        slots: action.slots,
        ...(action.draft ? { ...readDraftState(state), ...action.draft } : {}),
      };
    default:
      return state;
  }
}
