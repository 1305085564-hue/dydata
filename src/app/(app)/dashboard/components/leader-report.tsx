"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { OwnerReportList } from "./owner-report-list";

interface LeaderReportProps {
  today: string;
  userRole: "admin" | "owner";
}

/**
 * 组长日报录入
 */
export function LeaderReport({ today, userRole }: LeaderReportProps) {
  const [fields, setFields] = useState({ topic: "", opening: "", script: "", video: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<"draft" | "submitted" | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/leader-report?statusDate=${today}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!active || !data.ok) return;
        const myReport = data.reports?.[0]?.report ?? data.reports?.[0] ?? null;
        if (myReport) {
          setFields({
            topic: myReport.topic_feedback ?? "",
            opening: myReport.opening_feedback ?? "",
            script: myReport.script_feedback ?? "",
            video: myReport.video_feedback ?? "",
          });
        }
      } catch {}
      finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [today]);

  const save = async (isDraft: boolean) => {
    const previousSaved = saved;
    const nextSaved = isDraft ? "draft" : "submitted";

    setSaving(true);
    setSaved(nextSaved);
    toast.success(isDraft ? "草稿已保存" : "日报已提交");

    try {
      const res = await fetch("/api/leader-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statusDate: today,
          topicFeedback: fields.topic,
          openingFeedback: fields.opening,
          scriptFeedback: fields.script,
          videoFeedback: fields.video,
          isDraft,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setSaved(previousSaved);
        toast.error(data.error ?? "保存失败");
        return;
      }
    } catch {
      setSaved(previousSaved);
      toast.error("网络错误");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const feedbackFields = [
    { key: "topic" as const, label: "选题反馈", desc: "今日组内选题方向亮点/问题" },
    { key: "opening" as const, label: "开头反馈", desc: "哪条开头写得好/有问题" },
    { key: "script" as const, label: "脚本文案反馈", desc: "组内整体写作水平观察" },
    { key: "video" as const, label: "视频反馈", desc: "成片质量观察、案例" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[18px] font-medium tracking-tight text-zinc-800">
          今日日报
        </h3>
        {saved && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[12px] font-medium",
              saved === "submitted" ? "text-[#6FAA7D]" : "text-[#D99E55]",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full ring-1 ring-white",
                saved === "submitted" ? "bg-[#6FAA7D]" : "bg-[#D99E55]",
              )}
            />
            {saved === "submitted" ? "已提交" : "草稿已保存"}
          </span>
        )}
      </div>

      <div className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        {feedbackFields.map((f) => (
          <div key={f.key}>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.25em] text-zinc-400">
              {f.label}
            </label>
            <p className="mb-2 text-[12px] leading-[1.7] text-zinc-400">{f.desc}</p>
            <textarea
              value={fields[f.key]}
              onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="h-24 w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-[13px] font-medium leading-[1.7] text-zinc-800 transition-[border-color,background-color,box-shadow] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] placeholder:text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-950/5 focus:bg-white"
              placeholder={`填写${f.label}...`}
            />
          </div>
        ))}

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => save(true)}
            disabled={saving}
 className="rounded-[10px] border border-zinc-200 bg-white px-6 py-2.5 text-[11px] font-medium text-zinc-500 transition-[background-color, color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-zinc-50 hover:text-zinc-800 active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
          >
            保存草稿
          </button>
          <button
            onClick={() => save(false)}
            disabled={saving}
            className="rounded-lg bg-[#D97757] px-8 py-2.5 text-[11px] font-medium text-white transition-[background-color] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-[#C96442] active:translate-y-0 disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-1 focus-visible:ring-zinc-950/5"
          >
            正式提交
          </button>
        </div>
      </div>

      {userRole === "owner" && <OwnerReportList today={today} />}
    </div>
  );
}
