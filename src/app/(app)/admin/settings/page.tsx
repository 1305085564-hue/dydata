import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { canAccessAdminPath } from "@/lib/analytics-access";
import { getUserPermissions } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "系统设置 - DYData",
  description: "系统设置入口已退役，统一前往发布管理。",
};

/**
 * 旧系统设置页已于 2026-09-26 退役：原来的异常阈值与产量目标都没有业务消费者，
 * 页面、接口与首屏 loader 一并删除。旧地址保留登录与 manage_system 闸机后跳到
 * 发布管理，让旧书签落到真正在用的飞书催交开关所在页。
 */
export default async function AdminSettingsPage() {
  const permission = await getUserPermissions();
  if (!permission) redirect("/login");
  if (!canAccessAdminPath("/admin/settings", permission.role, permission.permissions)) {
    redirect("/admin");
  }
  redirect("/admin/fulfillment");
}
