import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "视频审核管理",
  description: "进入 DYData 视频审核管理工作台。",
};

export default async function VideoReviewManagePage() {
  redirect("/admin/content");
}
