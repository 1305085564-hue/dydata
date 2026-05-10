"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface OwnerReportListProps {
  today: string;
}

type ReportRecord = {
  topic_feedback: string | null;
  opening_feedback: string | null;
  script_feedback: string | null;
  video_feedback: string | null;
  submitted_at: string | null;
};

type GroupRecord = {
  groupId: string;
  groupName: string;
  leaderName: string | null;
  status: string;
  report: ReportRecord | null;
};

/**
 * 组长日报一览（owner 视角）
 * 法典 V1：彩色文字 + 状态点替代彩色背景；无 font-black
 */
export function OwnerReportList({ today }: OwnerReportListProps) {
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/leader-report?statusDate=${today}`);
        if (!res.ok) return;
        const data = await res.json();
        if (active && data.ok) setGroups(data.reports ?? []);
      } catch {}
      finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [today]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (loading || groups.length === 0) return null;

  const statusLabel = (status: string) =>
    status === "SUBMITTED" ? "已提交" : status === "DRAFT" ? "草稿" : "未提交";
  const statusColor = (status: string) =>
    status === "SUBMITTED"
      ? "text-[#6FAA7D]"
      : status === "DRAFT"
        ? "text-[#D99E55]"
        : "text-[#C9604D]";
  const statusDot = (status: string) =>
    status === "SUBMITTED"
      ? "bg-[#6FAA7D]"
      : status === "DRAFT"
        ? "bg-[#D99E55]"
        : "bg-[#C9604D]";

  return (
    <div className="space-y-4">
      <h3 className="text-[16px] font-semibold tracking-tight text-zinc-900">
        组长日报一览
      </h3>
      {groups.map((g) => (
        <div
          key={g.groupId}
          className="rounded-2xl border border-zinc-200 bg-white shadow-sm"
        >
          <button
            onClick={() => toggle(g.groupId)}
            className="flex w-full items-center justify-between p-5 text-left transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-50/50 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
          >
            <div>
              <span className="text-[13px] font-semibold text-zinc-900">
                {g.groupName}
              </span>
              {g.leaderName && (
                <span className="ml-2 text-[12px] text-zinc-400">· {g.leaderName}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50/50 px-2 py-0.5 text-[10px] font-medium",
                  statusColor(g.status),
                )}
              >
                <span
                  className={cn("h-1.5 w-1.5 rounded-full", statusDot(g.status))}
                />
                {statusLabel(g.status)}
              </span>
              {expanded.has(g.groupId) ? (
                <ChevronDown size={14} className="stroke-[1.5] text-zinc-400" />
              ) : (
                <ChevronRight size={14} className="stroke-[1.5] text-zinc-400" />
              )}
            </div>
          </button>
          {expanded.has(g.groupId) && g.report && (
            <div className="space-y-4 border-t border-zinc-100 px-5 pb-5 pt-4">
              {[
                { label: "选题", text: g.report.topic_feedback },
                { label: "开头", text: g.report.opening_feedback },
                { label: "脚本文案", text: g.report.script_feedback },
                { label: "视频", text: g.report.video_feedback },
              ].map((item) => (
                <div key={item.label}>
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
                    {item.label}
                  </div>
                  <p className="whitespace-pre-wrap text-[13px] font-medium leading-[1.7] text-zinc-700">
                    {item.text || "未填写"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
