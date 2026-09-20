import { permanentRedirect } from "next/navigation";
/** 素材库已并入视频复盘；保留旧链接以兼容书签和历史深链。 */
export default async function VideosRedirectPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const values = (await searchParams) ?? {};
  const params = new URLSearchParams();
  for (const key of ["view", "scope", "teamId", "videoId"]) {
    const value = values[key];
    if (typeof value === "string" && value) params.set(key, value);
  }
  permanentRedirect(`/admin/content${params.toString() ? `?${params.toString()}` : ""}`);
}
