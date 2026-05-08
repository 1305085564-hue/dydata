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

const ACTION_STYLES: Record<
  string,
  { label: string; className: string }
> = {
  update_report: {
    label: "编辑数据",
    className: "bg-zinc-100 text-zinc-700 border-zinc-200",
  },
  delete_report: {
    label: "删除数据",
    className: "bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]",
  },
  set_exempt: {
    label: "设置豁免",
    className: "bg-[#FEFCE8] text-[#92400E] border-[#FDE68A]",
  },
  clear_exempt: {
    label: "清除豁免",
    className: "bg-[#ECFDF3] text-[#067647] border-[#A7F3D0]",
  },
  submit_notify: {
    label: "提交通知",
    className: "bg-[#EEF4FF] text-[#444CE7] border-[#C7D2FE]",
  },
};

export function AuditLogList({ logs }: AuditLogListProps) {
  if (logs.length === 0) {
    return <p className="py-4 text-sm text-zinc-500">暂无操作记录</p>;
  }

  return (
    <>
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-200 hover:bg-transparent">
              <TableHead className="bg-zinc-50 text-zinc-500 text-[11px] uppercase tracking-wider font-medium">时间</TableHead>
              <TableHead className="bg-zinc-50 text-zinc-500 text-[11px] uppercase tracking-wider font-medium">操作人</TableHead>
              <TableHead className="bg-zinc-50 text-zinc-500 text-[11px] uppercase tracking-wider font-medium">操作</TableHead>
              <TableHead className="bg-zinc-50 text-zinc-500 text-[11px] uppercase tracking-wider font-medium">详情</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => {
              const actionInfo = ACTION_STYLES[log.action] ?? {
                label: log.action,
                className: "bg-zinc-100 text-zinc-700 border-zinc-200",
              };
              return (
                <TableRow key={log.id} className="border-zinc-200 hover:bg-zinc-50">
                  <TableCell className="whitespace-nowrap text-sm text-zinc-500">
                    {new Date(log.created_at).toLocaleString("zh-CN", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </TableCell>
                  <TableCell className="text-sm text-zinc-950">
                    {log.user_name ?? log.user_id.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${actionInfo.className}`}>
                      {actionInfo.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[300px] truncate text-sm text-zinc-500">
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
          const actionInfo = ACTION_STYLES[log.action] ?? {
            label: log.action,
            className: "bg-zinc-100 text-zinc-700 border-zinc-200",
          };
          return (
            <div
              key={log.id}
              className="space-y-1 rounded-xl border border-zinc-200 bg-white p-3"
            >
              <div className="flex items-center justify-between">
                <Badge variant="outline" className={`text-xs ${actionInfo.className}`}>
                  {actionInfo.label}
                </Badge>
                <span className="text-xs text-zinc-500">
                  {new Date(log.created_at).toLocaleString("zh-CN", {
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                {log.user_name ?? log.user_id.slice(0, 8)}
              </p>
              {log.detail && (
                <p className="truncate text-xs text-zinc-500">{log.detail}</p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
