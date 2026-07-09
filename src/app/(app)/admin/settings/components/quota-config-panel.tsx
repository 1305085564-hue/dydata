"use client";

import { useState } from "react";
import { 
  Settings, 
  Calendar, 
  Sparkles, 
  Plus, 
  Loader2, 
  AlertCircle,
  FileText
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface QuotaRule {
  id: string;
  effective_date: string;
  daily_target: number;
  created_by: string;
  note: string | null;
  created_at: string;
  profiles?: { name: string | null } | null;
}

interface QuotaConfigPanelProps {
  initialRules: QuotaRule[];
  currentDailyTarget: number;
  isOwner: boolean;
  todayDate: string;
}

export function QuotaConfigPanel({
  initialRules,
  currentDailyTarget,
  isOwner,
  todayDate,
}: QuotaConfigPanelProps) {
  const [rules, setRules] = useState<QuotaRule[]>(initialRules);
  const [currentTarget, setCurrentTarget] = useState(currentDailyTarget);

  // Form State (Only accessible if isOwner is true)
  const [effectiveDate, setEffectiveDate] = useState(todayDate);
  const [dailyTarget, setDailyTarget] = useState("4");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refreshRules = async () => {
    try {
      const res = await fetch("/api/daily-quota-config");
      const result = await res.json();
      if (result.data) {
        setRules(result.data.rules);
        setCurrentTarget(result.data.current_daily_target);
      }
    } catch (err) {
      console.error("Failed to refresh quota config:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isOwner) return;

    const targetNum = parseInt(dailyTarget, 10);
    if (isNaN(targetNum) || targetNum < 1 || targetNum > 50) {
      toast.error("无法提交", {
        description: "每日产量目标必须在 1 到 50 之间",
      });
      return;
    }

    if (!effectiveDate) {
      toast.error("无法提交", {
        description: "请选择规则生效日期",
      });
      return;
    }

    setSubmitting(true);

    const payload = {
      effective_date: effectiveDate,
      daily_target: targetNum,
      note: note.trim() || null,
    };

    try {
      const res = await fetch("/api/daily-quota-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (res.ok) {
        toast.success("配置添加成功", {
          description: `自 ${effectiveDate} 起，每日发片指标调整为 ${targetNum} 条`,
        });
        setNote("");
        await refreshRules();
      } else {
        toast.error("配置添加失败", {
          description: result.error || "服务接口出错",
        });
      }
    } catch (err) {
      toast.error("配置添加失败", {
        description: "网络连接失败，请重试",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-t border-stone-200 pt-8 space-y-6">
      <div>
        <h2 className="text-[18px] font-bold tracking-[-0.02em] text-stone-800 flex items-center gap-2">
          <Settings className="size-5 text-[#D97757]" />
          产量目标管理
        </h2>
        <p className="text-sm leading-6 text-stone-500 mt-1">
          设置团队每日视频发布产量额度目标。新规则到达生效日期后将自动覆盖旧规则。
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* 左侧：当前目标与添加表单 */}
        <div className="md:col-span-1 space-y-5">
          {/* 当前生效指标卡 (A.3/C.3) */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 flex flex-col justify-between h-[105px]">
            <span className="text-[13px] text-stone-500 font-medium">今日生效发片指标</span>
            <div className="flex items-baseline gap-1">
              <span className="text-[32px] font-bold font-mono tabular-nums text-[#D97757]">
                {currentTarget}
              </span>
              <span className="text-[12px] text-stone-400 ml-1">条 / 天</span>
            </div>
          </div>

          {/* 新增目标规则表单 (U1) */}
          {isOwner ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-4">
              <h3 className="text-[14px] font-bold text-stone-800">
                配置新发片目标
              </h3>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* 生效日期 */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-stone-500">
                    生效日期
                  </label>
                  <input
                    type="date"
                    value={effectiveDate}
                    onChange={(e) => setEffectiveDate(e.target.value)}
                    className="w-full h-10 rounded-xl border-0 bg-stone-100/70 px-4 text-[13px] font-mono text-stone-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-950/5 transition-[background-color,box-shadow]"
                  />
                </div>

                {/* 目标数 */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-stone-500">
                    每日产量目标 (条/天)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={dailyTarget}
                    onChange={(e) => setDailyTarget(e.target.value)}
                    className="w-full h-10 rounded-xl border-0 bg-stone-100/70 px-4 text-[13px] font-mono text-stone-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-950/5 transition-[background-color,box-shadow]"
                  />
                </div>

                {/* 备注 */}
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-stone-500">
                    调整说明 / 备注
                  </label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="如：夏季发片量调整..."
                    className="w-full h-10 rounded-xl border-0 bg-stone-100/70 px-4 text-[13px] text-stone-800 placeholder:text-stone-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-950/5 transition-[background-color,box-shadow]"
                  />
                </div>

                {/* 提交按钮 */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-10 flex items-center justify-center gap-1.5 rounded-xl bg-[#D97757] text-white text-[13px] font-semibold shadow-sm transition hover:bg-[#C96442] active:translate-y-0 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      添加规则中...
                    </>
                  ) : (
                    <>
                      <Plus className="size-4" />
                      添加规则
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50 p-4 text-[12px] text-stone-400 leading-[1.6]">
              <AlertCircle className="size-4 text-[#D99E55] mb-1.5" />
              只有系统 Owner 拥有添加及编辑每日发片指标规则的写入权限。Admin 角色仅供查阅规则历史。
            </div>
          )}
        </div>

        {/* 右侧：规则变更历史 (U2) */}
        <div className="md:col-span-2 space-y-3">
          <div className="flex items-baseline justify-between px-1">
            <h3 className="text-[14px] font-bold text-stone-800">
              指标规则调整历史
            </h3>
            <span className="font-mono text-[12px] tabular-nums text-stone-400">
              共 {rules.length} 条历史规则
            </span>
          </div>

          {rules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-200 bg-white py-12 text-center text-stone-400 text-[13px]">
              暂无历史指标配置记录
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
              {rules.map((rule, idx) => {
                const isLast = idx === rules.length - 1;
                const isEffectiveToday = rule.effective_date <= todayDate && (idx === 0 || rules[idx - 1].effective_date > todayDate);

                return (
                  <div
                    key={rule.id}
                    className={cn(
                      "flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-stone-50/50",
                      !isLast && "border-b border-stone-100",
                      isEffectiveToday && "bg-[#D97757]/[0.015]"
                    )}
                  >
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[13px] font-bold text-stone-800">
                          自 {rule.effective_date} 生效
                        </span>
                        {isEffectiveToday && (
                          <span className="inline-flex items-center rounded-full bg-[#D97757]/10 px-2 py-0.5 text-[10px] font-semibold text-[#D97757]">
                            当前生效
                          </span>
                        )}
                      </div>
                      
                      {rule.note && (
                        <p className="text-[12px] text-stone-500 truncate flex items-center gap-1">
                          <FileText className="size-3 text-stone-400" />
                          <span>说明: {rule.note}</span>
                        </p>
                      )}

                      <div className="text-[10px] text-stone-400 font-mono">
                        发布人: {rule.profiles?.name || "系统"} • 创建于: {new Date(rule.created_at).toLocaleDateString()}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-baseline gap-0.5 ml-4">
                      <span className="text-[20px] font-bold font-mono tabular-nums text-stone-800">
                        {rule.daily_target}
                      </span>
                      <span className="text-[11px] text-stone-400">条/天</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
