import type {
  EditableMetricField,
  FormMetaState,
  SlotViewState,
} from "@/lib/video-submit/domain/video-submit-form-model";
import type { EditableMetricKey, SubmissionSlotRole } from "@/components/submission/提交状态机";

export type SubmissionWorkflowState = {
  meta: FormMetaState;
  fields: Record<EditableMetricKey, EditableMetricField>;
  slots: Record<SubmissionSlotRole, SlotViewState>;
  keywordInput: string;
  hasManualEdit: boolean;
  hasManualScriptAuthorSelection: boolean;
  hasManualOperatorSelection: boolean;
};

export type WorkflowDraftState = Pick<
  SubmissionWorkflowState,
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
      /** 未显式指定时，字段识别提交按保留的手填字段推导；纯元数据提交保留原标记。 */
      hasManualEdit?: boolean;
    }
  | {
      type: "draft/restore";
      meta: FormMetaState;
      fields: Record<EditableMetricKey, EditableMetricField>;
      slots: Record<SubmissionSlotRole, SlotViewState>;
      draft?: Partial<WorkflowDraftState>;
    };
