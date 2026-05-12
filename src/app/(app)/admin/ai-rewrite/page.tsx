import { redirect } from "next/navigation";

export default function LegacyAIRewritePage() {
  redirect("/admin/ai-channels?tab=rewrite");
}
