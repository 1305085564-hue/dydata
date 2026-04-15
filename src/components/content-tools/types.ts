export type BootstrapPayload = {
  feature: {
    key: string;
    label: string;
    enabled: boolean;
  };
  defaults: {
    autoModeEnabled: boolean;
    fixedModeId: string | null;
    modelViewId: string | null;
    modeId: string | null;
    lengthPresetId: string | null;
    workflowId: string | null;
  };
  fixedModes: Array<{
    id: string;
    key: string;
    name: string;
    description: string | null;
    isEnabled: boolean;
    modelViewId: string;
    lengthPresetId: string | null;
  }>;
  modelViews: Array<{
    id: string;
    key: string;
    label: string;
    description: string | null;
    isDefault: boolean;
  }>;
  modes: Array<{
    id: string;
    key: string;
    name: string;
    description: string | null;
    isDefault: boolean;
  }>;
  lengthPresets: Array<{
    id: string;
    key: string;
    name: string;
    description: string | null;
    isDefault: boolean;
  }>;
  workflow: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    steps: Array<{
      id: string;
      key: string;
      name: string;
      description: string | null;
      sortOrder: number;
      modelViewId: string | null;
    }>;
  } | null;
};

export interface Conversation {
  id: string;
  title: string;
  selected: {
    autoModeEnabled: boolean;
    fixedModeId: string | null;
    modelViewId: string | null;
    modeId: string | null;
    lengthPresetId: string | null;
    fixedMode: {
      id: string;
      key: string;
      name: string;
      description: string | null;
      isEnabled: boolean;
      modelViewId: string;
      lengthPresetId: string | null;
    } | null;
    modelView: {
      id: string;
      key: string;
      label: string;
      description: string | null;
      isDefault: boolean;
    } | null;
    mode: {
      id: string;
      key: string;
      name: string;
      description: string | null;
      isDefault: boolean;
    } | null;
    lengthPreset: {
      id: string;
      key: string;
      name: string;
      description: string | null;
      isDefault: boolean;
    } | null;
  };
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system_note';
  content: string;
  createdAt: string;
  generationMode: 'auto' | 'single' | null;
  status: 'success' | 'partial_success' | 'failed' | null;
  requestSnapshot: {
    autoModeEnabled: boolean | null;
    fixedModeId: string | null;
    modelViewId: string | null;
    modeId: string | null;
    lengthPresetId: string | null;
    workflowId: string | null;
  } | null;
  errorMessage: string | null;
  structuredResult?: {
    generationMode: 'auto' | 'single';
    status: 'success' | 'partial_success' | 'failed';
    selected: {
      autoModeEnabled: boolean;
      fixedModeId: string | null;
      modelViewId: string | null;
      modeId: string | null;
      lengthPresetId: string | null;
      workflowId: string | null;
      fixedMode: Conversation['selected']['fixedMode'];
      modelView: Conversation['selected']['modelView'];
      mode: Conversation['selected']['mode'];
      lengthPreset: Conversation['selected']['lengthPreset'];
      workflow: {
        id: string;
        key: string;
        name: string;
      } | null;
    };
    snapshots: {
      featureSystemPrompt: string | null;
      fixedModePrompt: string | null;
      modePrompt: string | null;
      lengthPrompt: string | null;
    };
    steps: Array<{
      stepKey: string;
      stepName: string;
      description: string | null;
      status: 'pending' | 'success' | 'failed';
      modelViewId: string | null;
      modelViewKey: string | null;
      modelViewLabel: string | null;
      routeId: string | null;
      channelId: string | null;
      channelName: string | null;
      actualModel: string | null;
      elapsedMs: number | null;
      errorMessage: string | null;
      normalizedResult: {
        title: string | null;
        summary: string | null;
        versions: Array<{
          title: string;
          content: string;
        }>;
        notes: string[];
        followUpSuggestions: string[];
        recommendedText: string;
      } | null;
    }>;
    final: {
      responseMode: 'chat' | 'versions';
      title: string | null;
      summary: string | null;
      versions: Array<{
        title: string;
        content: string;
      }>;
      notes: string[];
      followUpSuggestions: string[];
      recommendedText: string;
    };
  } | null;
}
