/**
 * 我管什么：本文件负责作品提交表单编辑期的可变状态容器与动作分发（meta/fields/slots、草稿恢复、OCR 写入与手改标记），不管提交前校验或阶段标签。
 * 另一个管什么：提交就绪判定、缺项汇总与阶段推导由 src/components/submission/提交状态机.ts 负责。
 */
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
    keywordInput: draft?.keywordInput ?? "",
    hasManualEdit: draft?.hasManualEdit ?? false,
    hasManualScriptAuthorSelection:
      draft?.hasManualScriptAuthorSelection ?? false,
    hasManualOperatorSelection: draft?.hasManualOperatorSelection ?? false,
  };
}

function readDraftState(state: SubmissionWorkflowState): WorkflowDraftState {
  return {
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
    case "ocr/commit": {
      const fields = action.fields ? action.fields(state.fields) : state.fields;
      return {
        ...state,
        meta: action.meta ? action.meta(state.meta) : state.meta,
        fields,
        slots: action.slots ? action.slots(state.slots) : state.slots,
        hasManualEdit: action.hasManualEdit ?? (action.fields
          ? Object.values(fields).some((field) => field.manuallyEdited === true)
          : state.hasManualEdit),
      };
    }
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
