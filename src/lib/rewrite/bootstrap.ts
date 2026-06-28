import { getOrCreateDocument } from "./documents";

// Dynamic v2 tables are not in the generated Supabase type map yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MinimalClient = any;

export async function createV2Conversation(
  service: MinimalClient,
  userId: string,
  title?: string,
): Promise<{ conversationId: string; documentId: string }> {
  const { data, error } = await service
    .from("rewrite_conversations")
    .insert({
      user_id: userId,
      title: title?.trim() || "新文案画布",
      auto_mode_enabled: false,
      selected_model_view_id: null,
      selected_mode_id: null,
      selected_length_preset_id: null,
      schema_version: 2,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "创建 v2 会话失败");
  }

  const document = await getOrCreateDocument(service, (data as { id: string }).id);
  return {
    conversationId: document.conversationId,
    documentId: document.id,
  };
}
