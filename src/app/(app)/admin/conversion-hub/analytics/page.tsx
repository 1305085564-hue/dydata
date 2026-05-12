import { redirect } from "next/navigation";

interface Props {
  searchParams: Promise<{ sort?: string; format?: string }>;
}

export default async function LegacyAnalyticsPage({ searchParams }: Props) {
  const params = await searchParams;
  const qs = new URLSearchParams({ tab: "analytics" });
  if (params.sort) qs.set("sort", params.sort);
  if (params.format) qs.set("format", params.format);
  redirect(`/admin/conversion-hub?${qs.toString()}`);
}
