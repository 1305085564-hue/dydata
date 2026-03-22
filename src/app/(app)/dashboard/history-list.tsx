"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

type HistoryReport = {
  id: string;
  report_date: string | null;
  title: string | null;
  play_count: number | null;
  completion_rate: string | null;
  avg_play_duration: string | null;
  bounce_rate_2s: string | null;
  completion_rate_5s: string | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
  accounts: unknown;
};

function getAccountName(accountRelation: unknown) {
  if (Array.isArray(accountRelation)) {
    const first = accountRelation[0] as { name?: string | null } | undefined;
    return first?.name;
  }
  if (accountRelation && typeof accountRelation === "object") {
    return (accountRelation as { name?: string | null }).name;
  }
  return undefined;
}

const DEFAULT_VISIBLE = 10;

export function HistoryList({ history }: { history: HistoryReport[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? history : history.slice(0, DEFAULT_VISIBLE);
  const hasMore = history.length > DEFAULT_VISIBLE;

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>日期</TableHead>
              <TableHead>账号</TableHead>
              <TableHead>视频标题</TableHead>
              <TableHead className="text-right">播放量</TableHead>
              <TableHead className="text-right">完播率</TableHead>
              <TableHead className="text-right">均播时长</TableHead>
              <TableHead className="text-right hidden lg:table-cell">2s跳出</TableHead>
              <TableHead className="text-right hidden lg:table-cell">5s完播</TableHead>
              <TableHead className="text-right">点赞</TableHead>
              <TableHead className="text-right">评论</TableHead>
              <TableHead className="text-right">分享</TableHead>
              <TableHead className="text-right hidden lg:table-cell">收藏</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((report) => (
              <TableRow key={report.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {report.report_date?.slice(5)}
                </TableCell>
                <TableCell className="max-w-[120px] truncate text-muted-foreground">
                  {getAccountName(report.accounts) ?? "-"}
                </TableCell>
                <TableCell className="max-w-[160px] truncate">{report.title}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {report.play_count != null ? `${(report.play_count / 10000).toFixed(2)}万` : "-"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{report.completion_rate ?? "-"}</TableCell>
                <TableCell className="text-right tabular-nums">{report.avg_play_duration ?? "-"}</TableCell>
                <TableCell className="text-right tabular-nums hidden lg:table-cell">{report.bounce_rate_2s ?? "-"}</TableCell>
                <TableCell className="text-right tabular-nums hidden lg:table-cell">{report.completion_rate_5s ?? "-"}</TableCell>
                <TableCell className="text-right tabular-nums">{report.likes}</TableCell>
                <TableCell className="text-right tabular-nums">{report.comments}</TableCell>
                <TableCell className="text-right tabular-nums">{report.shares}</TableCell>
                <TableCell className="text-right tabular-nums hidden lg:table-cell">{report.favorites}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {visible.map((report) => (
          <div key={report.id} className="space-y-2 rounded-lg border bg-background p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{report.report_date?.slice(5)}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {getAccountName(report.accounts) ?? "-"}
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums">
                {report.play_count != null ? `${(report.play_count / 10000).toFixed(2)}万` : "-"}
              </p>
            </div>
            <p className="truncate text-sm">{report.title}</p>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">完播率</p>
                <p className="tabular-nums">{report.completion_rate ?? "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">点赞</p>
                <p className="tabular-nums">{report.likes}</p>
              </div>
              <div>
                <p className="text-muted-foreground">评论</p>
                <p className="tabular-nums">{report.comments}</p>
              </div>
              <div>
                <p className="text-muted-foreground">分享</p>
                <p className="tabular-nums">{report.shares}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="mt-3 flex justify-center">
          <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "收起" : `展开全部（${history.length} 条）`}
          </Button>
        </div>
      )}
    </>
  );
}
