import type {
  EditableMetricField,
  FormMetaState,
  SlotViewState,
} from "@/app/(app)/dashboard/video-submit-form-model";
import type { EditableMetricKey, SubmissionSlotRole } from "@/components/submission/提交状态机";

export type SubmissionWorkflowState = {
  meta: FormMetaState;
  fields: Record<EditableMetricKey, EditableMetricField>;
  slots: Record<SubmissionSlotRole, SlotViewState>;
  scriptText: string;
  keywordInput: string;
  hasManualEdit: boolean;
  hasManualScriptAuthorSelection: boolean;
  hasManualOperatorSelection: boolean;
};

export type WorkflowDraftState = Pick<
  SubmissionWorkflowState,
  | "scriptText"
  | "keywordInput"
  | "hasManualEdit"
  | "hasManualScriptAuthorSelection"
  | "hasManualOperatorSelection"
>;

// 旧 localStorage 草稿可能没有新增的手工标记，读取时由 controller 回退为 false。
export type VideoSubmitDraftData = Omit<
  SubmissionWorkflowState,
  keyof WorkflowDraftState
> &
  Partial<WorkflowDraftState> & {
    scriptText: string;
    keywordInput: string;
  };

export type WorkflowUpdater<T> = (current: T) => T;

export type WorkflowAction =
  | { type: "meta/update"; updater: WorkflowUpdater<FormMetaState> }
  | {
      type: "fields/update";
      updater: WorkflowUpdater<Record<EditableMetricKey, EditableMetricField>>;
    }
  | {
      type: "slots/update";
      updater: WorkflowUpdater<Record<SubmissionSlotRole, SlotViewState>>;
    }
  | {
      type: "draft/update";
      updater: WorkflowUpdater<WorkflowDraftState>;
    }
  | {
      type: "ocr/commit";
      meta?: WorkflowUpdater<FormMetaState>;
      fields?: WorkflowUpdater<Record<EditableMetricKey, EditableMetricField>>;
      slots?: WorkflowUpdater<Record<SubmissionSlotRole, SlotViewState>>;
      /** 重新上传截图触发的识别要把手工标记交还给机器，见 daily-report-data-source 的来源判定。 */
      hasManualEdit?: boolean;
    }
  | {
      type: "draft/restore";
      meta: FormMetaState;
      fields: Record<EditableMetricKey, EditableMetricField>;
      slots: Record<SubmissionSlotRole, SlotViewState>;
      draft?: Partial<WorkflowDraftState>;
    };
