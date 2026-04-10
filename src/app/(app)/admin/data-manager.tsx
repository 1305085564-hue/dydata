"use client";

import { useMemo, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatShanghaiDateTime } from "@/lib/日报";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { adminUpdateReport, adminDeleteReport } from "./actions";

interface ReportAccount {
  id: string;
  name: string;
  profile_id: string;
  content_direction: string | null;
  presentation_format: string | null;
}

interface Report {
  id: string;
  user_id: string | null;
  account_id: string | null;
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
  follower_gain: number;
  follower_convert: number | null;
  content?: string | null;
  published_at: string | null;
  uploaded_at: string;
  accounts?: ReportAccount | ReportAccount[] | null;
}

interface DataManagerProps {
  reports: Report[];
  defaultDate: string;
  avgPlayBySubmitter?: Record<string, number>;
  dayCountBySubmitter?: Record<string, number>;
  avgPlayByAccount?: Record<string, number>;
  dayCountByAccount?: Record<string, number>;
}

type ViewMode = "profile" | "account";

function stripSuffix(val: string | null, suffix: string): string {
  if (!val) return "";
  return val.replace(suffix, "");
}

function detectAnomaly(
  playCount: number | null,
  avg: number | undefined,
  dayCount: number | undefined
): { type: "high" | "low"; pct: number } | null {
  if (playCount == null || !avg || avg === 0) return null;
  if (!dayCount || dayCount < 3) return null;
  const ratio = playCount / avg;
  if (ratio >= 2.5) return { type: "high", pct: Math.round((ratio - 1) * 100) };
  if (ratio <= 0.3) return { type: "low", pct: Math.round((1 - ratio) * 100) };
  return null;
}

function getAccount(report: Report): ReportAccount | null {
  if (Array.isArray(report.accounts)) {
    return report.accounts[0] ?? null;
  }

  return report.accounts ?? null;
}

function formatPlayCount(playCount: number | null) {
  if (playCount == null) return "-";
  return `${(playCount / 10000).toFixed(2)}万`;
}

export function DataManager({
  reports,
  defaultDate,
  avgPlayBySubmitter = {},
  dayCountBySubmitter = {},
  avgPlayByAccount = {},
  dayCountByAccount = {},
}: DataManagerProps) {
  const [date, setDate] = useState(defaultDate);
  const [viewMode, setViewMode] = useState<ViewMode>("profile");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Report>>({});
  const [isPending, startTransition] = useTransition();
  const [contentDialog, setContentDialog] = useState<{ title: string; content: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; submitter: string } | null>(null);
  const router = useRouter();

  const reportsWithMeta = useMemo(
    () =>
      reports.map((report) => {
        const account = getAccount(report);
        return {
          ...report,
          account,
          accountName: account?.name ?? "未绑定账号",
          profileId: account?.profile_id ?? report.user_id ?? report.submitter,
          profileName: report.submitter,
        };
      }),
    [reports]
  );

  const profileGroups = useMemo(() => {
    const grouped = new Map<
      string,
      {
        profileId: string;
        profileName: string;
        reports: typeof reportsWithMeta;
      }
    >();

    for (const report of reportsWithMeta) {
      const current = grouped.get(report.profileId) ?? {
        profileId: report.profileId,
        profileName: report.profileName,
        reports: [],
      };
      current.reports.push(report);
      grouped.set(report.profileId, current);
    }

    return Array.from(grouped.values())
      .map((group) => {
        const totalPlay = group.reports.reduce((sum, report) => sum + (report.play_count ?? 0), 0);
        const totalEngagement = group.reports.reduce(
          (sum, report) => sum + report.likes + report.comments + report.shares + report.favorites,
          0
        );
        const accountNames = Array.from(
          new Set(group.reports.map((report) => report.accountName).filter(Boolean))
        );

        return {
          ...group,
          totalPlay,
          totalEngagement,
          reportCount: group.reports.length,
          accountCount: accountNames.length,
          accountNames,
        };
      })
      .sort((a, b) => b.totalPlay - a.totalPlay || a.profileName.localeCompare(b.profileName, "zh-CN"));
  }, [reportsWithMeta]);

  function handleDateChange(e: ChangeEvent<HTMLInputElement>) {
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
      follower_gain: r.follower_gain,
      follower_convert: r.follower_convert,
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
        follower_gain: editData.follower_gain ?? 0,
        follower_convert: editData.follower_convert ?? null,
      });
      if (result.error) {
        feedbackToast.error(result.error);
      } else {
        feedbackToast.success("已更新");
        setEditingId(null);
      }
    });
  }

  function handleDelete(reportId: string, submitter: string) {
    setDeleteTarget({ id: reportId, submitter });
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;

    startTransition(async () => {
      const result = await adminDeleteReport(deleteTarget.id);
      if (result.error) {
        feedbackToast.error(result.error);
        return;
      }

      feedbackToast.success("已删除");
      setDeleteTarget(null);
    });
  }

  function renderAnomaly(report: (typeof reportsWithMeta)[number]) {
    const avg =
      viewMode === "account"
        ? report.account_id
          ? avgPlayByAccount[report.account_id]
          : undefined
        : avgPlayBySubmitter[report.submitter];
    const dayCount =
      viewMode === "account"
        ? report.account_id
          ? dayCountByAccount[report.account_id]
          : undefined
        : dayCountBySubmitter[report.submitter];
    const anomaly = detectAnomaly(report.play_count, avg, dayCount);
    if (!anomaly) return null;

    const tip = `相比近7日均值${avg ? `${(avg / 10000).toFixed(2)}万` : "-"}，${
      anomaly.type === "high" ? "上涨" : "下降"
    }${anomaly.pct}%`;

    if (anomaly.type === "high") {
      return (
        <Badge variant="destructive" className="ml-1 px-1 py-0 text-[10px] cursor-help" title={tip}>
          暴涨
        </Badge>
      );
    }

    return (
      <Badge
        variant="outline"
        className="ml-1 px-1 py-0 text-[10px] text-orange-500 border-orange-300 cursor-help"
        title={tip}
      >
        暴跌
      </Badge>
    );
  }

  function renderAccountMeta(report: (typeof reportsWithMeta)[number]) {
    if (!report.account?.content_direction && !report.account?.presentation_format) return null;

    return (
      <div className="flex flex-wrap gap-1">
        {report.account?.content_direction ? (
          <Badge variant="outline" className="text-[10px]">
            {report.account.content_direction}
          </Badge>
        ) : null}
        {report.account?.presentation_format ? (
          <Badge variant="outline" className="text-[10px]">
            {report.account.presentation_format}
          </Badge>
        ) : null}
      </div>
    );
  }

  function renderReportRow(report: (typeof reportsWithMeta)[number]) {
    return (
      <TableRow key={report.id}>
        {editingId === report.id ? (
          <>
            <TableCell>
              <div className="space-y-1">
                <p>{report.profileName}</p>
                <p className="text-xs text-muted-foreground">{report.accountName}</p>
              </div>
            </TableCell>
            <TableCell>
              <Input
                value={editData.title ?? ""}
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                className="h-8 w-32"
              />
            </TableCell>
            <TableCell className="text-right">
              <Input
                type="number"
                step="0.01"
                value={editData.play_count != null ? (editData.play_count / 10000).toFixed(2) : ""}
                onChange={(e) =>
                  setEditData({ ...editData, play_count: Math.round(Number(e.target.value) * 10000) })
                }
                className="h-8 w-20 text-right"
              />
            </TableCell>
            <TableCell className="text-right">
              <Input
                value={stripSuffix(editData.completion_rate ?? null, "%")}
                onChange={(e) =>
                  setEditData({
                    ...editData,
                    completion_rate: e.target.value ? `${e.target.value}%` : null,
                  })
                }
                className="h-8 w-16 text-right"
              />
            </TableCell>
            <TableCell className="text-right">
              <Input
                type="number"
                value={editData.follower_gain ?? 0}
                onChange={(e) => setEditData({ ...editData, follower_gain: Number(e.target.value) })}
                className="h-8 w-16 text-right"
              />
            </TableCell>
            <TableCell className="text-right">
              <Input
                type="number"
                value={editData.follower_convert ?? ""}
                onChange={(e) =>
                  setEditData({
                    ...editData,
                    follower_convert: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className="h-8 w-16 text-right"
              />
            </TableCell>
            <TableCell className="text-right">
              <Input
                type="number"
                value={editData.likes ?? 0}
                onChange={(e) => setEditData({ ...editData, likes: Number(e.target.value) })}
                className="h-8 w-16 text-right"
              />
            </TableCell>
            <TableCell className="text-right">
              <Input
                type="number"
                value={editData.comments ?? 0}
                onChange={(e) => setEditData({ ...editData, comments: Number(e.target.value) })}
                className="h-8 w-16 text-right"
              />
            </TableCell>
            <TableCell className="text-right">
              <Input
                type="number"
                value={editData.shares ?? 0}
                onChange={(e) => setEditData({ ...editData, shares: Number(e.target.value) })}
                className="h-8 w-16 text-right"
              />
            </TableCell>
            <TableCell className="text-right">
              <Input
                type="number"
                value={editData.favorites ?? 0}
                onChange={(e) => setEditData({ ...editData, favorites: Number(e.target.value) })}
                className="h-8 w-16 text-right"
              />
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatShanghaiDateTime(report.published_at)}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatShanghaiDateTime(report.uploaded_at)}
            </TableCell>
            <TableCell />
            <TableCell className="space-x-1 text-right">
              <Button size="sm" disabled={isPending} onClick={() => handleSave(report.id)} className="h-7 text-xs">
                保存
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 text-xs">
                取消
              </Button>
            </TableCell>
          </>
        ) : (
          <>
            <TableCell>
              <div className="space-y-1">
                <p>{viewMode === "account" ? report.accountName : report.profileName}</p>
                <p className="text-xs text-muted-foreground">
                  {viewMode === "account" ? report.profileName : `${report.accountName} · ${report.report_date}`}
                </p>
                {viewMode === "account" ? renderAccountMeta(report) : null}
              </div>
            </TableCell>
            <TableCell className="max-w-[160px] truncate">{report.title}</TableCell>
            <TableCell className="text-right tabular-nums">
              {report.play_count != null ? (report.play_count / 10000).toFixed(2) : "-"}
              {renderAnomaly(report)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{report.completion_rate ?? "-"}</TableCell>
            <TableCell className="text-right tabular-nums">{report.follower_gain}</TableCell>
            <TableCell className="text-right tabular-nums">{report.follower_convert ?? "-"}</TableCell>
            <TableCell className="text-right tabular-nums">{report.likes}</TableCell>
            <TableCell className="text-right tabular-nums">{report.comments}</TableCell>
            <TableCell className="text-right tabular-nums">{report.shares}</TableCell>
            <TableCell className="text-right tabular-nums">{report.favorites}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatShanghaiDateTime(report.published_at)}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatShanghaiDateTime(report.uploaded_at)}
            </TableCell>
            <TableCell>
              {report.content ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setContentDialog({ title: report.title, content: report.content ?? "" })}
                  className="h-7 text-xs text-blue-500 hover:text-blue-600"
                >
                  查看
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell className="space-x-1 text-right">
              <Button size="sm" variant="ghost" onClick={() => startEdit(report)} className="h-7 text-xs">
                编辑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(report.id, report.submitter)}
                className="h-7 text-xs text-red-500 hover:bg-red-50 hover:text-red-600"
              >
                删除
              </Button>
            </TableCell>
          </>
        )}
      </TableRow>
    );
  }

  function renderMobileReportCard(report: (typeof reportsWithMeta)[number]) {
    return (
      <div key={report.id} className="rounded-lg border bg-background p-4 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium">{viewMode === "account" ? report.accountName : report.profileName}</p>
            <p className="max-w-[220px] truncate text-xs text-muted-foreground">{report.title}</p>
            <p className="text-xs text-muted-foreground">
              {viewMode === "account" ? report.profileName : report.accountName}
            </p>
            {viewMode === "account" ? renderAccountMeta(report) : null}
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => startEdit(report)} className="h-7 text-xs">
              编辑
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleDelete(report.id, report.submitter)}
              className="h-7 text-xs text-red-500"
            >
              删除
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">播放量</p>
            <p className="font-medium tabular-nums">
              {formatPlayCount(report.play_count)}
              {renderAnomaly(report)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">完播率</p>
            <p className="tabular-nums">{report.completion_rate ?? "-"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">涨粉</p>
            <p className="tabular-nums">{report.follower_gain}</p>
          </div>
          <div>
            <p className="text-muted-foreground">导粉</p>
            <p className="tabular-nums">{report.follower_convert ?? "-"}</p>
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
            <p className="text-muted-foreground">发布时间</p>
            <p>{formatShanghaiDateTime(report.published_at)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">上传时间</p>
            <p>{formatShanghaiDateTime(report.uploaded_at)}</p>
          </div>
        </div>
        {report.content ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setContentDialog({ title: report.title, content: report.content ?? "" })}
            className="h-7 w-full justify-start text-xs text-blue-500"
          >
            查看文案
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Input type="date" value={date} onChange={handleDateChange} className="h-9 w-auto" />
          <span className="text-sm text-muted-foreground">{reports.length} 条记录</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={viewMode === "profile" ? "default" : "outline"} onClick={() => setViewMode("profile")}>
            按人查看
          </Button>
          <Button size="sm" variant={viewMode === "account" ? "default" : "outline"} onClick={() => setViewMode("account")}>
            按账号查看
          </Button>
        </div>
      </div>

      {reports.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">该日期暂无提交记录</p>
      ) : viewMode === "profile" ? (
        <div className="space-y-4">
          {profileGroups.map((group) => (
            <div key={group.profileId} className="rounded-xl border bg-muted/20 p-4 space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold">{group.profileName}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {group.accountCount} 个账号
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {group.reportCount} 条提交
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {group.accountNames.map((name) => (
                      <Badge key={name} variant="outline" className="text-[11px]">
                        {name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-muted-foreground">总播放</p>
                    <p className="font-semibold tabular-nums">{formatPlayCount(group.totalPlay)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">总互动</p>
                    <p className="font-semibold tabular-nums">{group.totalEngagement}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">账号数</p>
                    <p className="font-semibold tabular-nums">{group.accountCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">记录数</p>
                    <p className="font-semibold tabular-nums">{group.reportCount}</p>
                  </div>
                </div>
              </div>

              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>账号 / 日期</TableHead>
                      <TableHead>标题</TableHead>
                      <TableHead className="text-right">播放量(万)</TableHead>
                      <TableHead className="text-right">完播率</TableHead>
                      <TableHead className="text-right">涨粉</TableHead>
                      <TableHead className="text-right">导粉</TableHead>
                      <TableHead className="text-right">点赞</TableHead>
                      <TableHead className="text-right">评论</TableHead>
                      <TableHead className="text-right">分享</TableHead>
                      <TableHead className="text-right">收藏</TableHead>
                      <TableHead>发布时间</TableHead>
                      <TableHead>上传时间</TableHead>
                      <TableHead>文案</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>{group.reports.map(renderReportRow)}</TableBody>
                </Table>
              </div>

              <div className="space-y-3 md:hidden">{group.reports.map(renderMobileReportCard)}</div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>账号 / 所属人</TableHead>
                  <TableHead>标题</TableHead>
                  <TableHead className="text-right">播放量(万)</TableHead>
                  <TableHead className="text-right">完播率</TableHead>
                  <TableHead className="text-right">涨粉</TableHead>
                  <TableHead className="text-right">导粉</TableHead>
                  <TableHead className="text-right">点赞</TableHead>
                  <TableHead className="text-right">评论</TableHead>
                  <TableHead className="text-right">分享</TableHead>
                  <TableHead className="text-right">收藏</TableHead>
                  <TableHead>发布时间</TableHead>
                  <TableHead>上传时间</TableHead>
                  <TableHead>文案</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{reportsWithMeta.map(renderReportRow)}</TableBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">{reportsWithMeta.map(renderMobileReportCard)}</div>
        </>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="确认删除数据"
        description={deleteTarget ? `确定删除 ${deleteTarget.submitter} 的这条记录？` : ""}
        confirmText="确认删除"
        cancelText="取消"
        destructive
        loading={isPending}
        onConfirm={handleDeleteConfirm}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      />

      <Dialog open={!!contentDialog} onOpenChange={() => setContentDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">{contentDialog?.title}</DialogTitle>
          </DialogHeader>
          <p className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">
            {contentDialog?.content}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
