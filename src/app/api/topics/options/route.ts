import { loadTopicOptions } from "@/lib/topics/service";
import { jsonResult, requireActiveTeamContext } from "../_shared";

export async function GET() {
  const auth = await requireActiveTeamContext();
  if (!auth.ok) return auth.response;

  return jsonResult(await loadTopicOptions(auth.context.supabase));
}
