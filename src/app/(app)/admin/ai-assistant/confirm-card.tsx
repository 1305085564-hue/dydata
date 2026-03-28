"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy } from "lucide-react";

type ConfirmCardProps = {
  data: {
    toolName: string;
    confirmationMessage?: string;
    affectedData?: unknown;
    backupSql?: string | null;
  };
  submitting?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function formatContent(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function ConfirmCard({ data, submitting = false, onConfirm, onCancel }: ConfirmCardProps) {
  const affectedData = formatContent(data.affectedData);

  return (
    <Card className="border-orange-200 bg-orange-50/60 dark:border-orange-900 dark:bg-orange-950/20">
      <CardHeader className="gap-2">
        <CardTitle className="text-sm text-orange-700 dark:text-orange-300">
          高危操作，确认后才会执行
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {data.confirmationMessage || `即将执行 ${data.toolName}`}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {affectedData ? (
          <div className="space-y-1">
            <div className="text-sm font-medium">影响范围</div>
            <pre className="overflow-x-auto rounded-md bg-background/80 p-3 text-xs whitespace-pre-wrap">
              {affectedData}
            </pre>
          </div>
        ) : null}

        {data.backupSql ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">备份 SQL</div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => navigator.clipboard.writeText(data.backupSql || "")}
              >
                <Copy className="h-3.5 w-3.5" />
                复制
              </Button>
            </div>
            <pre className="overflow-x-auto rounded-md bg-background/80 p-3 text-xs whitespace-pre-wrap">
              {data.backupSql}
            </pre>
          </div>
        ) : null}
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          取消
        </Button>
        <Button onClick={onConfirm} disabled={submitting}>
          {submitting ? "处理中..." : "确认执行"}
        </Button>
      </CardFooter>
    </Card>
  );
}
