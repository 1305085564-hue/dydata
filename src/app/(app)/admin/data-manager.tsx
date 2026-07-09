"use client";

import { useEffect, useMemo, useState, useTransition, type ChangeEvent } from "react";
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
  onDateChange?: (date: string) => void;
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
  onDateChange,
}: DataManagerProps) {
  const [date, setDate] = useState(defaultDate);
  const [localReports, setLocalReports] = useState(reports);
  const [viewMode, setViewMode] = useState<ViewMode>("profile");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Report>>({});
  const [isPending, startTransition] = useTransition();
  const [contentDialog, setContentDialog] = useState<{ title: string; content: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; submitter: string } | null>(null);
  const router = useRouter();

  useEffect(() => {
    setLocalReports(reports);
  }, [reports]);

  const reportsWithMeta = useMemo(
    () =>
      localReports.map((report) => {
        const account = getAccount(report);
        return {
          ...report,
          account,
          accountName: account?.name ?? "未绑定账号",
          profileId: account?.profile_id ?? report.user_id ?? report.submitter,
          profileName: report.submitter,
        };
      }),
    [localReports]
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
    const nextDate = e.target.value;
    setDate(nextDate);

    if (onDateChange) {
      onDateChange(nextDate);
      return;
    }

    router.push(`/admin?date=${nextDate}`);
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
    const originalReport = localReports.find((report) => report.id === reportId);
    if (!originalReport) return;

    const nextPatch = {
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
    };

    setLocalReports((current) =>
      current.map((report) => (report.id === reportId ? { ...report, ...nextPatch } : report)),
    );
    setEditingId(null);
    setEditData({});
    feedbackToast.success("已更新");

    startTransition(async () => {
      const result = await adminUpdateReport(reportId, nextPatch);
      if (result.error) {
        setLocalReports((current) =>
          current.map((report) => (report.id === reportId ? originalReport : report)),
        );
        setEditingId(reportId);
        setEditData({
          title: originalReport.title,
          play_count: originalReport.play_count,
          completion_rate: originalReport.completion_rate,
          avg_play_duration: originalReport.avg_play_duration,
          bounce_rate_2s: originalReport.bounce_rate_2s,
          completion_rate_5s: originalReport.completion_rate_5s,
          likes: originalReport.likes,
          comments: originalReport.comments,
          shares: originalReport.shares,
          favorites: originalReport.favorites,
          follower_gain: originalReport.follower_gain,
          follower_convert: originalReport.follower_convert,
        });
        feedbackToast.error(result.error);
      }
    });
  }

  function handleDelete(reportId: string, submitter: string) {
    setDeleteTarget({ id: reportId, submitter });
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const removedReport = localReports.find((report) => report.id === deleteTarget.id);
    if (!removedReport) return;

    setLocalReports((current) => current.filter((report) => report.id !== deleteTarget.id));
    setDeleteTarget(null);
    feedbackToast.success("已删除");

    startTransition(async () => {
      const result = await adminDeleteReport(deleteTarget.id);
      if (result.error) {
        setLocalReports((current) => {
          if (current.some((report) => report.id === removedReport.id)) return current;
          return [...current, removedReport].sort((left, right) =>
            left.uploaded_at.localeCompare(right.uploaded_at),
          );
        });
        feedbackToast.error(result.error);
      }
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
        <Badge
          variant="danger"
          className="ml-1 cursor-help px-1 py-0 text-[12px]"
          title={tip}
        >
          暴涨
        </Badge>
      );
    }

    return (
      <Badge
        variant="warning"
        className="ml-1 cursor-help px-1 py-0 text-[12px]"
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
          <Badge variant="outline" className="border-stone-200 text-[12px] text-stone-500">
            {report.account.content_direction}
          </Badge>
        ) : null}
        {report.account?.presentation_format ? (
          <Badge variant="outline" className="border-stone-200 text-[12px] text-stone-500">
            {report.account.presentation_format}
          </Badge>
        ) : null}
      </div>
    );
  }

  function renderEditPanel(report: (typeof reportsWithMeta)[number]) {
    return (
      <TableRow key={`${report.id}-edit`} className="border-0 bg-transparent hover:bg-transparent">
        <TableCell colSpan={14} className="p-0">
          <div className="m-2 rounded-xl border border-stone-200 bg-stone-50 p-4">
            <div className="mb-3 text-sm font-semibold text-stone-800">编辑数据</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
                <label className="text-xs font-medium text-stone-500">标题</label>
                <Input
                  value={editData.title ?? ""}
                  onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                  className="h-8 bg-stone-50 border-transparent text-stone-800 focus:bg-white focus:border-stone-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-500">播放量（万）</label>
                <Input
                  type="number"
                  step="0.01"
                  value={editData.play_count != null ? (editData.play_count / 10000).toFixed(2) : ""}
                  onChange={(e) =>
                    setEditData({ ...editData, play_count: Math.round(Number(e.target.value) * 10000) })
                  }
                  className="h-8 bg-stone-50 border-transparent text-stone-800 focus:bg-white focus:border-stone-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-500">完播率</label>
                <Input
                  value={stripSuffix(editData.completion_rate ?? null, "%")}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      completion_rate: e.target.value ? `${e.target.value}%` : null,
                    })
                  }
                  className="h-8 bg-stone-50 border-transparent text-stone-800 focus:bg-white focus:border-stone-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-500">涨粉</label>
                <Input
                  type="number"
                  value={editData.follower_gain ?? 0}
                  onChange={(e) => setEditData({ ...editData, follower_gain: Number(e.target.value) })}
                  className="h-8 bg-stone-50 border-transparent text-stone-800 focus:bg-white focus:border-stone-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-500">导粉</label>
                <Input
                  type="number"
                  value={editData.follower_convert ?? ""}
                  onChange={(e) =>
                    setEditData({
                      ...editData,
                      follower_convert: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="h-8 bg-stone-50 border-transparent text-stone-800 focus:bg-white focus:border-stone-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-500">点赞</label>
                <Input
                  type="number"
                  value={editData.likes ?? 0}
                  onChange={(e) => setEditData({ ...editData, likes: Number(e.target.value) })}
                  className="h-8 bg-stone-50 border-transparent text-stone-800 focus:bg-white focus:border-stone-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-500">评论</label>
                <Input
                  type="number"
                  value={editData.comments ?? 0}
                  onChange={(e) => setEditData({ ...editData, comments: Number(e.target.value) })}
                  className="h-8 bg-stone-50 border-transparent text-stone-800 focus:bg-white focus:border-stone-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-500">分享</label>
                <Input
                  type="number"
                  value={editData.shares ?? 0}
                  onChange={(e) => setEditData({ ...editData, shares: Number(e.target.value) })}
                  className="h-8 bg-stone-50 border-transparent text-stone-800 focus:bg-white focus:border-stone-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-500">收藏</label>
                <Input
                  type="number"
                  value={editData.favorites ?? 0}
                  onChange={(e) => setEditData({ ...editData, favorites: Number(e.target.value) })}
                  className="h-8 bg-stone-50 border-transparent text-stone-800 focus:bg-white focus:border-stone-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Button
                size="sm"
                disabled={isPending}
                onClick={() => handleSave(report.id)}
                className="h-8 bg-white border border-stone-200 text-xs text-stone-800 hover:bg-stone-50"
              >
                保存
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={cancelEdit}
                className="h-8 text-xs border-stone-200 text-stone-500 hover:text-stone-800"
              >
                取消
              </Button>
            </div>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  function renderReportRow(report: (typeof reportsWithMeta)[number]) {
    const isEditing = editingId === report.id;
    return (
      <TableRow key={report.id} className={`group border-stone-200 ${isEditing ? "bg-stone-50" : "hover:bg-stone-50"}`}>
        <TableCell>
          <div className="space-y-1">
            <p className="text-sm text-stone-800">{viewMode === "account" ? report.accountName : report.profileName}</p>
            <p className="text-xs text-stone-500">
              {viewMode === "account" ? report.profileName : `${report.accountName} · ${report.report_date}`}
            </p>
            {viewMode === "account" ? renderAccountMeta(report) : null}
          </div>
        </TableCell>
        <TableCell className="max-w-[160px] truncate text-sm text-stone-800">{report.title}</TableCell>
        <TableCell className="text-right font-mono tabular-nums text-sm text-stone-800">
          {report.play_count != null ? (report.play_count / 10000).toFixed(2) : "-"}
          {renderAnomaly(report)}
        </TableCell>
        <TableCell className="text-right font-mono tabular-nums text-sm text-stone-800">{report.completion_rate ?? "-"}</TableCell>
        <TableCell className="text-right font-mono tabular-nums text-sm text-stone-800">{report.follower_gain}</TableCell>
        <TableCell className="text-right font-mono tabular-nums text-sm text-stone-800">{report.follower_convert ?? "-"}</TableCell>
        <TableCell className="text-right font-mono tabular-nums text-sm text-stone-800">{report.likes}</TableCell>
        <TableCell className="text-right font-mono tabular-nums text-sm text-stone-800">{report.comments}</TableCell>
        <TableCell className="text-right font-mono tabular-nums text-sm text-stone-800">{report.shares}</TableCell>
        <TableCell className="text-right font-mono tabular-nums text-sm text-stone-800">{report.favorites}</TableCell>
        <TableCell className="text-sm text-stone-500">{formatShanghaiDateTime(report.published_at)}</TableCell>
        <TableCell className="text-sm text-stone-500">{formatShanghaiDateTime(report.uploaded_at)}</TableCell>
        <TableCell>
          {report.content ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setContentDialog({ title: report.title, content: report.content ?? "" })}
              className="h-7 text-xs text-stone-500 hover:text-stone-800 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto focus-within:pointer-events-auto"
            >
              查看
            </Button>
          ) : (
            <span className="text-xs text-stone-500">-</span>
          )}
        </TableCell>
        <TableCell className="text-right">
          {!isEditing ? (
            <div className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150 pointer-events-none group-hover:pointer-events-auto focus-within:pointer-events-auto">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => startEdit(report)}
                className="h-7 text-xs text-stone-500 hover:text-stone-800"
              >
                编辑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(report.id, report.submitter)}
                className="h-7 text-[12px] text-stone-500 hover:text-[#C9604D]"
              >
                删除
              </Button>
            </div>
          ) : null}
        </TableCell>
      </TableRow>
    );
  }

  function renderMobileEditPanel(report: (typeof reportsWithMeta)[number]) {
    return (
      <div className="mt-2 space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-4">
        <div className="text-sm font-semibold text-stone-800">编辑数据</div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-stone-500">标题</label>
          <Input
            value={editData.title ?? ""}
            onChange={(e) => setEditData({ ...editData, title: e.target.value })}
            className="h-8 bg-stone-50 border-transparent text-stone-800 focus:bg-white focus:border-stone-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-500">播放量（万）</label>
            <Input
              type="number"
              step="0.01"
              value={editData.play_count != null ? (editData.play_count / 10000).toFixed(2) : ""}
              onChange={(e) =>
                setEditData({ ...editData, play_count: Math.round(Number(e.target.value) * 10000) })
              }
              className="h-8 bg-stone-50 border-transparent text-stone-800 focus:bg-white focus:border-stone-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-500">完播率</label>
            <Input
              value={stripSuffix(editData.completion_rate ?? null, "%")}
              onChange={(e) =>
                setEditData({
                  ...editData,
                  completion_rate: e.target.value ? `${e.target.value}%` : null,
                })
              }
              className="h-8 bg-stone-50 border-transparent text-stone-800 focus:bg-white focus:border-stone-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-500">涨粉</label>
            <Input
              type="number"
              value={editData.follower_gain ?? 0}
              onChange={(e) => setEditData({ ...editData, follower_gain: Number(e.target.value) })}
              className="h-8 bg-stone-50 border-transparent text-stone-800 focus:bg-white focus:border-stone-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-500">导粉</label>
            <Input
              type="number"
              value={editData.follower_convert ?? ""}
              onChange={(e) =>
                setEditData({
                  ...editData,
                  follower_convert: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="h-8 bg-stone-50 border-transparent text-stone-800 focus:bg-white focus:border-stone-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-500">点赞</label>
            <Input
              type="number"
              value={editData.likes ?? 0}
              onChange={(e) => setEditData({ ...editData, likes: Number(e.target.value) })}
              className="h-8 bg-stone-50 border-transparent text-stone-800 focus:bg-white focus:border-stone-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-500">评论</label>
            <Input
              type="number"
              value={editData.comments ?? 0}
              onChange={(e) => setEditData({ ...editData, comments: Number(e.target.value) })}
              className="h-8 bg-stone-50 border-transparent text-stone-800 focus:bg-white focus:border-stone-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-500">分享</label>
            <Input
              type="number"
              value={editData.shares ?? 0}
              onChange={(e) => setEditData({ ...editData, shares: Number(e.target.value) })}
              className="h-8 bg-stone-50 border-transparent text-stone-800 focus:bg-white focus:border-stone-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-stone-500">收藏</label>
            <Input
              type="number"
              value={editData.favorites ?? 0}
              onChange={(e) => setEditData({ ...editData, favorites: Number(e.target.value) })}
              className="h-8 bg-stone-50 border-transparent text-stone-800 focus:bg-white focus:border-stone-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => handleSave(report.id)}
            className="h-8 bg-white border border-stone-200 text-xs text-stone-800 hover:bg-stone-50"
          >
            保存
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={cancelEdit}
            className="h-8 text-xs border-stone-200 text-stone-500 hover:text-stone-800"
          >
            取消
          </Button>
        </div>
      </div>
    );
  }

  function renderMobileReportCard(report: (typeof reportsWithMeta)[number]) {
    const isEditing = editingId === report.id;
    return (
      <div key={report.id} className={`space-y-2 rounded-xl border border-stone-200 bg-white p-4 ${isEditing ? "ring-1 ring-stone-200" : ""}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-1">
            <p className="text-sm font-medium text-stone-800">{viewMode === "account" ? report.accountName : report.profileName}</p>
            <p className="max-w-[220px] truncate text-xs text-stone-500">{report.title}</p>
            <p className="text-xs text-stone-500">{viewMode === "account" ? report.profileName : report.accountName}</p>
            {viewMode === "account" ? renderAccountMeta(report) : null}
          </div>
          {!isEditing ? (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => startEdit(report)}
                className="h-7 text-xs text-stone-500 hover:text-stone-800"
              >
                编辑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(report.id, report.submitter)}
                className="h-7 text-[12px] text-stone-500 hover:text-[#C9604D]"
              >
                删除
              </Button>
            </div>
          ) : null}
        </div>
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div>
            <p className="text-stone-500">播放量</p>
            <p className="font-medium font-mono tabular-nums text-stone-800">
              {formatPlayCount(report.play_count)}
              {renderAnomaly(report)}
            </p>
          </div>
          <div>
            <p className="text-stone-500">完播率</p>
            <p className="font-mono tabular-nums text-stone-800">{report.completion_rate ?? "-"}</p>
          </div>
          <div>
            <p className="text-stone-500">涨粉</p>
            <p className="font-mono tabular-nums text-stone-800">{report.follower_gain}</p>
          </div>
          <div>
            <p className="text-stone-500">导粉</p>
            <p className="font-mono tabular-nums text-stone-800">{report.follower_convert ?? "-"}</p>
          </div>
          <div>
            <p className="text-stone-500">点赞</p>
            <p className="font-mono tabular-nums text-stone-800">{report.likes}</p>
          </div>
          <div>
            <p className="text-stone-500">评论</p>
            <p className="font-mono tabular-nums text-stone-800">{report.comments}</p>
          </div>
          <div>
            <p className="text-stone-500">发布时间</p>
            <p className="text-stone-800">{formatShanghaiDateTime(report.published_at)}</p>
          </div>
          <div>
            <p className="text-stone-500">上传时间</p>
            <p className="text-stone-800">{formatShanghaiDateTime(report.uploaded_at)}</p>
          </div>
        </div>
        {report.content ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setContentDialog({ title: report.title, content: report.content ?? "" })}
            className="h-7 w-full justify-start text-xs text-stone-500 hover:text-stone-800"
          >
            查看文案
          </Button>
        ) : null}
        {isEditing ? renderMobileEditPanel(report) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={date}
            onChange={handleDateChange}
            className="h-9 w-auto bg-stone-50 border-transparent text-stone-800 focus:bg-white focus:border-stone-200 focus:shadow-sm transition-[background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
          />
          <span className="text-sm text-stone-500">{localReports.length} 条记录</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={viewMode === "profile" ? "default" : "outline"}
            onClick={() => setViewMode("profile")}
            className={viewMode === "profile" ? "bg-white shadow-sm text-stone-800 rounded-lg border-stone-200 hover:bg-white" : "border-stone-200 text-stone-500 hover:text-stone-800"}
          >
            按人查看
          </Button>
          <Button
            size="sm"
            variant={viewMode === "account" ? "default" : "outline"}
            onClick={() => setViewMode("account")}
            className={viewMode === "account" ? "bg-white shadow-sm text-stone-800 rounded-lg border-stone-200 hover:bg-white" : "border-stone-200 text-stone-500 hover:text-stone-800"}
          >
            按账号查看
          </Button>
        </div>
      </div>

      {localReports.length === 0 ? (
        <p className="py-4 text-sm text-stone-500">该日期暂无提交记录</p>
      ) : viewMode === "profile" ? (
        <div className="space-y-6">
          {profileGroups.map((group) => (
            <div key={group.profileId} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[18px] font-medium text-stone-800">{group.profileName}</h3>
                    <Badge variant="outline" className="border-stone-200 bg-stone-100 text-xs text-stone-600">
                      {group.accountCount} 个账号
                    </Badge>
                    <Badge variant="outline" className="border-stone-200 bg-stone-100 text-xs text-stone-600">
                      {group.reportCount} 条提交
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {group.accountNames.map((name) => (
                      <Badge key={name} variant="outline" className="border-stone-200 text-[11px] text-stone-500">
                        {name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
                  <div>
                    <p className="text-stone-500">总播放</p>
                    <p className="font-semibold font-mono tabular-nums text-stone-800">{formatPlayCount(group.totalPlay)}</p>
                  </div>
                  <div>
                    <p className="text-stone-500">总互动</p>
                    <p className="font-semibold font-mono tabular-nums text-stone-800">{group.totalEngagement}</p>
                  </div>
                  <div>
                    <p className="text-stone-500">账号数</p>
                    <p className="font-semibold font-mono tabular-nums text-stone-800">{group.accountCount}</p>
                  </div>
                  <div>
                    <p className="text-stone-500">记录数</p>
                    <p className="font-semibold font-mono tabular-nums text-stone-800">{group.reportCount}</p>
                  </div>
                </div>
              </div>

              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="border-stone-200 hover:bg-transparent">
                      <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium">账号 / 日期</TableHead>
                      <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium">标题</TableHead>
                      <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium text-right">播放量(万)</TableHead>
                      <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium text-right">完播率</TableHead>
                      <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium text-right">涨粉</TableHead>
                      <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium text-right">导粉</TableHead>
                      <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium text-right">点赞</TableHead>
                      <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium text-right">评论</TableHead>
                      <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium text-right">分享</TableHead>
                      <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium text-right">收藏</TableHead>
                      <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium">发布时间</TableHead>
                      <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium">上传时间</TableHead>
                      <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium">文案</TableHead>
                      <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.reports.flatMap((report) => [
                      renderReportRow(report),
                      editingId === report.id ? renderEditPanel(report) : null,
                    ])}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2 md:hidden">{group.reports.map(renderMobileReportCard)}</div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="border-stone-200 hover:bg-transparent">
                  <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium">账号 / 所属人</TableHead>
                  <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium">标题</TableHead>
                  <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium text-right">播放量(万)</TableHead>
                  <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium text-right">完播率</TableHead>
                  <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium text-right">涨粉</TableHead>
                  <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium text-right">导粉</TableHead>
                  <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium text-right">点赞</TableHead>
                  <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium text-right">评论</TableHead>
                  <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium text-right">分享</TableHead>
                  <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium text-right">收藏</TableHead>
                  <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium">发布时间</TableHead>
                  <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium">上传时间</TableHead>
                  <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium">文案</TableHead>
                  <TableHead className="bg-stone-50 text-stone-500 text-[11px] uppercase tracking-wider font-medium text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportsWithMeta.flatMap((report) => [
                  renderReportRow(report),
                  editingId === report.id ? renderEditPanel(report) : null,
                ])}
              </TableBody>
            </Table>
          </div>

          <div className="space-y-2 md:hidden">{reportsWithMeta.map(renderMobileReportCard)}</div>
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
        <DialogContent className="max-w-lg border-stone-200">
          <DialogHeader>
            <DialogTitle className="text-[18px] font-medium text-stone-800">{contentDialog?.title}</DialogTitle>
          </DialogHeader>
          <p className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
            {contentDialog?.content}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
