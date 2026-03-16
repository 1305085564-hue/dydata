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

const ACTION_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  update_report: { label: "编辑数据", variant: "secondary" },
  delete_report: { label: "删除数据", variant: "destructive" },
  toggle_exempt: { label: "切换豁免", variant: "outline" },
  submit_notify: { label: "提交通知", variant: "default" },
};

export function AuditLogList({ logs }: AuditLogListProps) {
  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">暂无操作记录</p>;
  }

  return (
    <>
      <div className="hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>操作人</TableHead>
              <TableHead>操作</TableHead>
              <TableHead>详情</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => {
              const actionInfo = ACTION_LABELS[log.action] ?? { label: log.action, variant: "secondary" as const };
              return (
                <TableRow key={log.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell className="text-sm">{log.user_name ?? log.user_id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <Badge variant={actionInfo.variant} className="text-xs">{actionInfo.label}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">{log.detail ?? "-"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="sm:hidden space-y-2">
        {logs.map((log) => {
          const actionInfo = ACTION_LABELS[log.action] ?? { label: log.action, variant: "secondary" as const };
          return (
            <div key={log.id} className="rounded-lg border p-3 bg-background space-y-1">
              <div className="flex items-center justify-between">
                <Badge variant={actionInfo.variant} className="text-xs">{actionInfo.label}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(log.created_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{log.user_name ?? log.user_id.slice(0, 8)}</p>
              {log.detail && <p className="text-xs text-muted-foreground truncate">{log.detail}</p>}
            </div>
          );
        })}
      </div>
    </>
  );
}
