"use client";

import { useState, useTransition } from "react";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { generateInviteCode } from "./actions";

interface InviteCode {
  id: string;
  code: string;
  used: boolean;
  used_by: string | null;
  expires_at: string | null;
  created_at: string;
}

interface Props {
  adminId: string;
  existingCodes: InviteCode[];
  profileNames?: Record<string, string>; // user_id → name
}

export function InviteCodeManager({ adminId, existingCodes, profileNames = {} }: Props) {
  const [codes, setCodes] = useState<string[]>([]);
  const [count, setCount] = useState(5);
  const [expiresInDays, setExpiresInDays] = useState<number | "">(7);
  const [isPending, startTransition] = useTransition();

  function handleGenerate() {
    startTransition(async () => {
      const result = await generateInviteCode(
        adminId,
        count,
        expiresInDays === "" ? null : expiresInDays
      );
      if (result.error) {
        feedbackToast.error(result.error);
      } else if (result.codes) {
        setCodes(result.codes);
        feedbackToast.success(`已生成 ${result.codes.length} 个邀请码`);
      }
    });
  }

  function handleCopyAll() {
    if (codes.length === 0) return;
    navigator.clipboard.writeText(codes.join("\n"));
    feedbackToast.success("已复制全部邀请码");
  }

  const now = new Date();

  return (
    <div className="space-y-6">
      {/* 生成区域 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="space-y-1.5">
          <Label>数量</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="h-9 w-20"
          />
        </div>
        <div className="space-y-1.5">
          <Label>有效期（天，留空=永久）</Label>
          <Input
            type="number"
            min={1}
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="永久"
            className="h-9 w-28"
          />
        </div>
        <Button onClick={handleGenerate} disabled={isPending}>
          {isPending ? "生成中..." : `生成 ${count} 个`}
        </Button>
      </div>

      {/* 新生成的邀请码 */}
      {codes.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">新生成的邀请码</span>
            <Button variant="outline" size="sm" onClick={handleCopyAll}>复制全部</Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {codes.map((c) => (
              <code
                key={c}
                className="rounded bg-muted px-3 py-2 text-sm font-mono tracking-widest cursor-pointer hover:bg-muted/80"
                onClick={() => { navigator.clipboard.writeText(c); feedbackToast.success(`已复制 ${c}`); }}
              >
                {c}
              </code>
            ))}
          </div>
        </div>
      )}

      {/* 已有邀请码列表 */}
      {existingCodes.length > 0 && (
        <div className="space-y-2">
          <span className="text-sm font-medium">历史邀请码</span>
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>邀请码</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>使用者</TableHead>
                  <TableHead>有效期</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {existingCodes.map((c) => {
                  const expired = c.expires_at && new Date(c.expires_at) < now;
                  return (
                    <TableRow key={c.id} className={expired ? "opacity-50" : ""}>
                      <TableCell className="font-mono tracking-wider text-sm">{c.code}</TableCell>
                      <TableCell>
                        {c.used ? (
                          <Badge variant="secondary" className="text-xs">已使用</Badge>
                        ) : expired ? (
                          <Badge variant="outline" className="text-xs">已过期</Badge>
                        ) : (
                          <Badge variant="default" className="text-xs">可用</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.used_by ? (profileNames[c.used_by] ?? c.used_by.slice(0, 8)) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.expires_at ? new Date(c.expires_at).toLocaleDateString("zh-CN") : "永久"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("zh-CN")}
                      </TableCell>
                      <TableCell className="text-right">
                        {!c.used && !expired && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => { navigator.clipboard.writeText(c.code); feedbackToast.success(`已复制 ${c.code}`); }}
                          >
                            复制
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="sm:hidden space-y-2">
            {existingCodes.map((c) => {
              const expired = c.expires_at && new Date(c.expires_at) < now;
              return (
                <div key={c.id} className={`flex items-center justify-between rounded-lg border p-3 ${expired ? "opacity-50" : ""}`}>
                  <code
                    className="font-mono text-sm tracking-wider cursor-pointer hover:text-primary"
                    onClick={() => { navigator.clipboard.writeText(c.code); feedbackToast.success(`已复制 ${c.code}`); }}
                  >
                    {c.code}
                  </code>
                  <div className="flex items-center gap-2">
                    {c.used ? (
                      <Badge variant="secondary" className="text-xs">已使用</Badge>
                    ) : expired ? (
                      <Badge variant="outline" className="text-xs">已过期</Badge>
                    ) : (
                      <Badge variant="default" className="text-xs">可用</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
