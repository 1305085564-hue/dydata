import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "管理后台",
  description: "进入 DYData 内部管理后台。",
};

export default function AdminPage() {
  redirect("/admin/content");
}
