import { redirect } from "next/navigation";

interface Props {
  searchParams: Promise<{ status?: string; category?: string; q?: string }>;
}

export default async function LegacyAdminViolationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const qs = new URLSearchParams({ tab: "violations" });
  if (params.status) qs.set("status", params.status);
  if (params.category) qs.set("category", params.category);
  if (params.q) qs.set("q", params.q);
  redirect(`/admin/conversion-hub?${qs.toString()}`);
}
