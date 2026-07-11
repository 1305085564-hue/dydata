"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";
import { badgeVariants } from "@/components/ui/badge";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

interface AuditLog {
  id: string;
  created_at: string;
  user_id: string;
  action: string;
  target: string;
  detail: string | null;
  user_name?: string;
}

interface AuditLogListProps {
  logs: AuditLog[];
}

const ACTION_META: Record<string, { label: string; variant: BadgeVariant }> = {
  update_report: { label: "编辑数据", variant: "neutral" },
  delete_report: { label: "删除数据", variant: "danger" },
  set_exempt: { label: "设置豁免", variant: "warning" },
  clear_exempt: { label: "清除豁免", variant: "success" },
  submit_notify: { label: "提交通知", variant: "accent" },
};

export function AuditLogList({ logs }: AuditLogListProps) {
  if (logs.length === 0) {
    return <p className="py-4 text-[13px] text-stone-500">暂无操作记录</p>;
  }

  return (
    <>
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow className="border-stone-200 hover:bg-transparent">
              <TableHead>时间</TableHead>
              <TableHead>操作人</TableHead>
              <TableHead>操作</TableHead>
              <TableHead>详情</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => {
              const meta = ACTION_META[log.action] ?? {
                label: log.action,
                variant: "neutral" as BadgeVariant,
              };
              return (
                <TableRow key={log.id} className="border-stone-200">
                  <TableCell className="whitespace-nowrap text-[13px] text-stone-500">
                    {new Date(log.created_at).toLocaleString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell className="text-[13px] text-stone-900">
                    {log.user_name ?? log.user_id.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate text-[13px] text-stone-500">
                    {log.detail ?? "-"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 sm:hidden">
        {logs.map((log) => {
          const meta = ACTION_META[log.action] ?? {
            label: log.action,
            variant: "neutral" as BadgeVariant,
          };
          return (
            <div
              key={log.id}
              className="space-y-1 rounded-xl border border-stone-200 bg-white p-3"
            >
              <div className="flex items-center justify-between">
                <Badge variant={meta.variant}>{meta.label}</Badge>
                <span className="text-[12px] text-stone-500">
                  {new Date(log.created_at).toLocaleString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-[12px] text-stone-500">
                {log.user_name ?? log.user_id.slice(0, 8)}
              </p>
              {log.detail && (
                <p className="truncate text-[12px] text-stone-500">{log.detail}</p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
