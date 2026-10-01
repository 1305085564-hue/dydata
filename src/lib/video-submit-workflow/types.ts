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
      type: "draft/restore";
      meta: FormMetaState;
      fields: Record<EditableMetricKey, EditableMetricField>;
      slots: Record<SubmissionSlotRole, SlotViewState>;
    };
