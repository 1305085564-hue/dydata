"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminUpdateReport, adminDeleteReport } from "./actions";

interface Report {
  id: string;
  submitter: string;
  title: string;
  report_date: string;
  play_count: number | null;
  completion_rate: string | null;
  avg_play_duration: string | null;
  bounce_rate_2s: string | null;
  completion_rate_5s: string | null;
  likes: number;
  comments: number;
  shares: number;
  favorites: number;
  content?: string | null;
}

interface DataManagerProps {
  reports: Report[];
  defaultDate: string;
  avgPlayBySubmitter?: Record<string, number>; // 近7天人均播放量
  dayCountBySubmitter?: Record<string, number>; // 近7天提交天数
}

function stripSuffix(val: string | null, suffix: string): string {
  if (!val) return "";
  return val.replace(suffix, "");
}


function detectAnomaly(playCount: number | null, avg: number | undefined, dayCount: number | undefined): { type: "high" | "low"; pct: number } | null {
  if (playCount == null || !avg || avg === 0) return null;
  if (!dayCount || dayCount < 3) return null;
  const ratio = playCount / avg;
  if (ratio >= 2.5) return { type: "high", pct: Math.round((ratio - 1) * 100) };
  if (ratio <= 0.3) return { type: "low", pct: Math.round((1 - ratio) * 100) };
  return null;
}

export function DataManager({ reports, defaultDate, avgPlayBySubmitter = {}, dayCountBySubmitter = {} }: DataManagerProps) {
  const [date, setDate] = useState(defaultDate);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Report>>({});
  const [isPending, startTransition] = useTransition();
  const [contentDialog, setContentDialog] = useState<{ title: string; content: string } | null>(null);
  const router = useRouter();

  function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDate(e.target.value);
    router.push(`/admin?date=${e.target.value}`);
  }

  function startEdit(r: Report) {
    setEditingId(r.id);
    setEditData({
      title: r.title,
      play_count: r.play_count,
      completion_rate: r.completion_rate,
      avg_play_duration: r.avg_play_duration,
      bounce_rate_2s: r.bounce_rate_2s,
      completion_rate_5s: r.completion_rate_5s,
      likes: r.likes,
      comments: r.comments,
      shares: r.shares,
      favorites: r.favorites,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditData({});
  }

  function handleSave(reportId: string) {
    startTransition(async () => {
      const result = await adminUpdateReport(reportId, {
        title: editData.title ?? "",
        play_count: editData.play_count ?? 0,
        completion_rate: editData.completion_rate || null,
        avg_play_duration: editData.avg_play_duration || null,
        bounce_rate_2s: editData.bounce_rate_2s || null,
        completion_rate_5s: editData.completion_rate_5s || null,
        likes: editData.likes ?? 0,
        comments: editData.comments ?? 0,
        shares: editData.shares ?? 0,
        favorites: editData.favorites ?? 0,
      });
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("已更新");
        setEditingId(null);
      }
    });
  }

  function handleDelete(reportId: string, submitter: string) {
    if (!confirm(`确定删除 ${submitter} 的这条记录？`)) return;
    startTransition(async () => {
      const result = await adminDeleteReport(reportId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("已删除");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Input
          type="date"
          value={date}
          onChange={handleDateChange}
          className="w-auto h-9"
        />
        <span className="text-sm text-muted-foreground">{reports.length} 条记录</span>
      </div>

      {reports.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">该日期暂无提交记录</p>
      ) : (
        <>
          {/* 桌面端表格 */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>提交人</TableHead>
                  <TableHead>标题</TableHead>
                  <TableHead className="text-right">播放量(万)</TableHead>
                  <TableHead className="text-right">完播率</TableHead>
                  <TableHead className="text-right">点赞</TableHead>
                  <TableHead className="text-right">评论</TableHead>
                  <TableHead className="text-right">分享</TableHead>
                  <TableHead className="text-right">收藏</TableHead>
                  <TableHead>文案</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id}>
                    {editingId === r.id ? (
                      <>
                        <TableCell>{r.submitter}</TableCell>
                        <TableCell>
                          <Input value={editData.title ?? ""} onChange={(e) => setEditData({ ...editData, title: e.target.value })} className="h-8 w-32" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input type="number" step="0.01" value={editData.play_count != null ? (editData.play_count / 10000).toFixed(2) : ""} onChange={(e) => setEditData({ ...editData, play_count: Math.round(Number(e.target.value) * 10000) })} className="h-8 w-20 text-right" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input value={stripSuffix(editData.completion_rate ?? null, "%")} onChange={(e) => setEditData({ ...editData, completion_rate: e.target.value ? `${e.target.value}%` : null })} className="h-8 w-16 text-right" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input type="number" value={editData.likes ?? 0} onChange={(e) => setEditData({ ...editData, likes: Number(e.target.value) })} className="h-8 w-16 text-right" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input type="number" value={editData.comments ?? 0} onChange={(e) => setEditData({ ...editData, comments: Number(e.target.value) })} className="h-8 w-16 text-right" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input type="number" value={editData.shares ?? 0} onChange={(e) => setEditData({ ...editData, shares: Number(e.target.value) })} className="h-8 w-16 text-right" />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input type="number" value={editData.favorites ?? 0} onChange={(e) => setEditData({ ...editData, favorites: Number(e.target.value) })} className="h-8 w-16 text-right" />
                        </TableCell>
                        <TableCell />
                        <TableCell className="text-right space-x-1">
                          <Button size="sm" disabled={isPending} onClick={() => handleSave(r.id)} className="h-7 text-xs">保存</Button>
                          <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 text-xs">取消</Button>
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>{r.submitter}</TableCell>
                        <TableCell className="max-w-[160px] truncate">{r.title}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.play_count != null ? (r.play_count / 10000).toFixed(2) : "-"}
                          {(() => {
                            const anomaly = detectAnomaly(r.play_count, avgPlayBySubmitter[r.submitter], dayCountBySubmitter[r.submitter]);
                            if (!anomaly) return null;
                            const avg = avgPlayBySubmitter[r.submitter];
                            const tip = `相比近7日均值${avg ? (avg / 10000).toFixed(2) + "万" : ""}，${anomaly.type === "high" ? "上涨" : "下降"}${anomaly.pct}%`;
                            if (anomaly.type === "high") return <Badge variant="destructive" className="text-[10px] ml-1 px-1 py-0 cursor-help" title={tip}>暴涨</Badge>;
                            return <Badge variant="outline" className="text-[10px] ml-1 px-1 py-0 text-orange-500 border-orange-300 cursor-help" title={tip}>暴跌</Badge>;
                          })()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.completion_rate ?? "-"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.likes}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.comments}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.shares}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.favorites}</TableCell>
                        <TableCell>
                          {r.content ? (
                            <Button size="sm" variant="ghost" onClick={() => setContentDialog({ title: r.title, content: r.content! })} className="h-7 text-xs text-blue-500 hover:text-blue-600">查看</Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button size="sm" variant="ghost" onClick={() => startEdit(r)} className="h-7 text-xs">编辑</Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(r.id, r.submitter)} className="h-7 text-xs text-red-500 hover:text-red-600">删除</Button>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* 手机端卡片 */}
          <div className="md:hidden space-y-3">
            {reports.map((r) => (
              <div key={r.id} className="rounded-lg border bg-background p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{r.submitter}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">{r.title}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(r)} className="h-7 text-xs">编辑</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(r.id, r.submitter)} className="h-7 text-xs text-red-500">删除</Button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">播放量</p>
                    <p className="font-medium tabular-nums">
                      {r.play_count != null ? (r.play_count / 10000).toFixed(2) + "万" : "-"}
                      {(() => {
                        const anomaly = detectAnomaly(r.play_count, avgPlayBySubmitter[r.submitter], dayCountBySubmitter[r.submitter]);
                        if (!anomaly) return null;
                        const avg = avgPlayBySubmitter[r.submitter];
                        const tip = `相比近7日均值${avg ? (avg / 10000).toFixed(2) + "万" : ""}，${anomaly.type === "high" ? "上涨" : "下降"}${anomaly.pct}%`;
                        if (anomaly.type === "high") return <Badge variant="destructive" className="text-[10px] ml-1 px-1 py-0 cursor-help" title={tip}>暴涨</Badge>;
                        return <Badge variant="outline" className="text-[10px] ml-1 px-1 py-0 text-orange-500 border-orange-300 cursor-help" title={tip}>暴跌</Badge>;
                      })()}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">完播率</p>
                    <p className="tabular-nums">{r.completion_rate ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">点赞</p>
                    <p className="tabular-nums">{r.likes}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">评论</p>
                    <p className="tabular-nums">{r.comments}</p>
                  </div>
                </div>
                {r.content && (
                  <Button size="sm" variant="ghost" onClick={() => setContentDialog({ title: r.title, content: r.content! })} className="h-7 text-xs text-blue-500 w-full justify-start">查看文案</Button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <Dialog open={!!contentDialog} onOpenChange={() => setContentDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">{contentDialog?.title}</DialogTitle>
          </DialogHeader>
          <p className="text-sm whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto">{contentDialog?.content}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

