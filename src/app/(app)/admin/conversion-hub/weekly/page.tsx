import { redirect } from "next/navigation";

export default function LegacyWeeklyPage() {
  redirect("/admin/conversion-hub?tab=weekly");
}
