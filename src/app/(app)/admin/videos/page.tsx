import { redirect } from "next/navigation";
/** 素材库已并入视频复盘；保留旧链接以兼容书签和历史深链。 */
export default function VideosRedirectPage() {
  redirect("/admin/content");
}
