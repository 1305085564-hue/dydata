import { loadTopicOptions } from "@/lib/topics/service";
import { jsonResult, requireTopicsContext } from "../_shared";

export async function GET() {
  const auth = await requireTopicsContext();
  if (!auth.ok) return auth.response;

  return jsonResult(await loadTopicOptions(auth.context.supabase));
}
