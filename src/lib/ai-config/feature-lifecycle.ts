type FeatureLifecycleRpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ error: { message: string } | null }>;
};

export type AiFeatureLifecycleAction = "archive" | "restore";

export async function changeAiFeatureLifecycle(
  supabase: FeatureLifecycleRpcClient,
  input: {
    featureKey: string;
    label: string;
    action: AiFeatureLifecycleAction;
  },
) {
  const { error } = await supabase.rpc("manage_ai_feature_lifecycle", {
    p_feature_key: input.featureKey,
    p_label: input.label,
    p_action: input.action,
  });

  if (error) throw new Error(error.message);
}
