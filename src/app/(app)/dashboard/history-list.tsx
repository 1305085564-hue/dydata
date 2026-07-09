"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DashboardForm, type DashboardAccountOption, type DashboardReportData } from "./dashboard-form";

type HistoryReport = {
  id: string;
  account_id: string;
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
  follower_gain: number | null;
  follower_convert: number | null;
  content: string | null;
  published_at: string | null;
  uploaded_at: string | null;
};

interface HistoryListProps {
  history: HistoryReport[];
  accounts: DashboardAccountOption[];
  accountDisplayNameMap: Record<string, string>;
  today: string;
  onReportOpen?: (report: HistoryReport) => void;
}

function toExistingData(report: HistoryReport): DashboardReportData {
  return {
    id: report.id,
    account_id: report.account_id,
    title: report.title ?? "",
    report_date: report.report_date ?? "",
    play_count: report.play_count,
    completion_rate: report.completion_rate,
    avg_play_duration: report.avg_play_duration,
    bounce_rate_2s: report.bounce_rate_2s,
    completion_rate_5s: report.completion_rate_5s,
    likes: report.likes ?? 0,
    comments: report.comments ?? 0,
    shares: report.shares ?? 0,
    favorites: report.favorites ?? 0,
    follower_gain: report.follower_gain ?? 0,
    follower_convert: report.follower_convert,
    content: report.content,
    published_at: report.published_at,
    uploaded_at: report.uploaded_at ?? "",
  };
}

const DEFAULT_VISIBLE = 10;

export function HistoryList({ history, accounts, accountDisplayNameMap, today, onReportOpen }: HistoryListProps) {
  const [expanded, setExpanded] = useState(false);
  const [editingReport, setEditingReport] = useState<HistoryReport | null>(null);
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
              <TableHead className="hidden text-right lg:table-cell">2s跳出</TableHead>
              <TableHead className="hidden text-right lg:table-cell">5s完播</TableHead>
              <TableHead className="text-right">点赞</TableHead>
              <TableHead className="text-right">评论</TableHead>
              <TableHead className="text-right">分享</TableHead>
              <TableHead className="hidden text-right lg:table-cell">收藏</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((report) => (
              <TableRow
                key={report.id}
                className={"group " + (onReportOpen ? "cursor-pointer" : "")}
                onClick={onReportOpen ? () => onReportOpen(report) : undefined}
              >
                <TableCell className="whitespace-nowrap text-stone-500 font-mono tabular-nums">
                  {report.report_date?.slice(5)}
                </TableCell>
                <TableCell className="max-w-[120px] truncate text-stone-500">
                  {accountDisplayNameMap[report.account_id] ?? "-"}
                </TableCell>
                <TableCell className="max-w-[160px] truncate text-stone-800">{report.title}</TableCell>
                <TableCell className="text-right font-semibold font-mono tabular-nums text-stone-800">
                  {report.play_count != null ? report.play_count.toLocaleString("zh-CN") : "-"}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-stone-800">{report.completion_rate ?? "-"}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-stone-800">{report.avg_play_duration ?? "-"}</TableCell>
                <TableCell className="hidden text-right font-mono tabular-nums text-stone-800 lg:table-cell">{report.bounce_rate_2s ?? "-"}</TableCell>
                <TableCell className="hidden text-right font-mono tabular-nums text-stone-800 lg:table-cell">{report.completion_rate_5s ?? "-"}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-stone-800">{report.likes}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-stone-800">{report.comments}</TableCell>
                <TableCell className="text-right font-mono tabular-nums text-stone-800">{report.shares}</TableCell>
                <TableCell className="hidden text-right font-mono tabular-nums text-stone-800 lg:table-cell">{report.favorites}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto focus-within:pointer-events-auto"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditingReport(report);
                    }}
                  >
                    <Pencil className="size-3.5 stroke-[1.5]" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {visible.map((report) => (
          <div
            key={report.id}
            className={
              onReportOpen
                ? "cursor-pointer space-y-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
                : "space-y-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
            }
            onClick={onReportOpen ? () => onReportOpen(report) : undefined}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12px] text-stone-400 font-mono tabular-nums">{report.report_date?.slice(5)}</p>
                <p className="mt-1 text-[12px] text-stone-400">
                  {accountDisplayNameMap[report.account_id] ?? "-"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-semibold font-mono tabular-nums text-stone-800">
                  {report.play_count != null ? report.play_count.toLocaleString("zh-CN") : "-"}
                </p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={(event) => {
                    event.stopPropagation();
                    setEditingReport(report);
                  }}
                >
                  <Pencil className="size-3.5 stroke-[1.5]" />
                </Button>
              </div>
            </div>
            <p className="truncate text-[13px] text-stone-800">{report.title}</p>
            <div className="grid grid-cols-4 gap-2 text-[12px]">
              <div>
                <p className="text-stone-400">完播率</p>
                <p className="font-mono tabular-nums text-stone-800">{report.completion_rate ?? "-"}</p>
              </div>
              <div>
                <p className="text-stone-400">点赞</p>
                <p className="font-mono tabular-nums text-stone-800">{report.likes}</p>
              </div>
              <div>
                <p className="text-stone-400">评论</p>
                <p className="font-mono tabular-nums text-stone-800">{report.comments}</p>
              </div>
              <div>
                <p className="text-stone-400">分享</p>
                <p className="font-mono tabular-nums text-stone-800">{report.shares}</p>
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

      <Dialog open={editingReport !== null} onOpenChange={(open) => !open && setEditingReport(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[18px] font-semibold tracking-tight text-stone-800">修改日报</DialogTitle>
          </DialogHeader>
          {editingReport && (
            <DashboardForm
              key={editingReport.id}
              accounts={accounts}
              defaultAccountId={editingReport.account_id}
              today={today}
              existingData={toExistingData(editingReport)}
              actionBarMode="inline"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
