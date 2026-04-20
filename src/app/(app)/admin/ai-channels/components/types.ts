import { AiFeatureMetadata } from "@/lib/ai/feature-metadata";

export type AiChannelRow = {
  id: string;
  name: string;
  base_url: string;
  api_key_masked: string;
  model: string | null;
  priority: number;
  is_enabled: boolean;
  unhealthy_until: string | null;
  consecutive_failures: number;
  last_failure_at: string | null;
  last_success_at: string | null;
  last_error_message: string | null;
};

export type ChannelFormState = {
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  priority: string;
};

export type ChannelStatus = "healthy" | "circuit" | "disabled";

export type AiFeatureApiRow = {
  id: string;
  feature_key: string;
  label: string;
  channel_id: string | null;
  channel_name: string | null;
  model: string | null;
  system_prompt: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type AiFeatureItem = {
  id: string;
  feature_key: string;
  label: string;
  channel_id: string;
  channel_name: string | null;
  model: string;
  system_prompt: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type AiFeatureCardItem = AiFeatureItem & {
  metadata: AiFeatureMetadata;
};
