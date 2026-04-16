export type ModelViewRow = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type LengthPresetRef = {
  id: string;
  key: string;
  name: string;
};

export type ModelViewRef = {
  id: string;
  key: string;
  label: string;
};

export type FixedModeRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  fixed_prompt: string;
  model_view_id: string;
  length_preset_id: string | null;
  sort_order: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  model_view: ModelViewRef | null;
  length_preset: LengthPresetRef | null;
};

export type ChannelRow = {
  id: string;
  name: string;
  model: string | null;
  is_enabled: boolean;
  priority: number;
};

export type WorkflowRef = {
  id: string;
  key: string;
  name: string;
};

export type WorkflowStepRef = {
  id: string;
  workflow_id: string;
  step_key: string;
  name: string;
};

export type WorkflowStepRow = {
  id: string;
  workflow_id: string;
  model_view_id: string | null;
  step_key: string;
  name: string;
  description: string | null;
  step_prompt: string;
  sort_order: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  workflow: WorkflowRef | null;
  model_view: ModelViewRef | null;
};

export type ModelRouteRow = {
  id: string;
  model_view_id: string;
  workflow_step_id: string | null;
  channel_id: string;
  actual_model: string;
  priority: number;
  weight: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  model_view: ModelViewRef | null;
  workflow_step: WorkflowStepRef | null;
  channel: Pick<ChannelRow, "id" | "name" | "model" | "is_enabled"> | null;
};

export type ModeRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  mode_prompt: string;
  sort_order: number;
  is_enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type LengthPresetRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  length_prompt: string;
  sort_order: number;
  is_enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type WorkflowRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type FeatureConfigRow = {
  id: string;
  feature_key: string;
  label: string;
  system_prompt: string | null;
  is_enabled: boolean;
  output_token_limit: number | null;
  context_message_limit: number | null;
};

export type RewriteBundle = {
  featureConfig: FeatureConfigRow | null;
  modelViews: ModelViewRow[];
  fixedModes: FixedModeRow[];
  modelRoutes: ModelRouteRow[];
  modes: ModeRow[];
  lengthPresets: LengthPresetRow[];
  workflows: WorkflowRow[];
  workflowSteps: WorkflowStepRow[];
  channels: ChannelRow[];
};

export type EditorKind =
  | "fixed_mode"
  | "model_view"
  | "model_route"
  | "mode"
  | "length_preset"
  | "workflow"
  | "workflow_step";

export type EditorState = {
  kind: EditorKind;
  mode: "create" | "edit";
};

export type FormState = Record<string, string | boolean>;
export type RuntimeFormState = {
  is_enabled: boolean;
  output_token_limit: string;
  context_message_limit: string;
};

export const NONE_VALUE = "__none__";

export const EMPTY_BUNDLE: RewriteBundle = {
  featureConfig: null,
  modelViews: [],
  fixedModes: [],
  modelRoutes: [],
  modes: [],
  lengthPresets: [],
  workflows: [],
  workflowSteps: [],
  channels: [],
};

export const EMPTY_RUNTIME_FORM: RuntimeFormState = {
  is_enabled: true,
  output_token_limit: "3600",
  context_message_limit: "30",
};
