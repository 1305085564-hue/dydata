"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Users,
  AlertCircle,
  AlertTriangle,
  Eye,
  ImageIcon,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getUserSubmissions } from "../actions";

interface DashboardRecord {
  user_id: string;
  user_name: string;
  team_id: string;
  team_name: string;
  group_id: string;
  group_name: string;
  daily_target: number;
  submitted_count: number;
  gap: number;
  exemption_status: "none" | "pending" | "approved" | "rejected";
  alert_level: "green" | "yellow" | "red";
}

interface TeamOrGroup {
  id: string;
  name: string;
}

interface DashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData: DashboardRecord[];
  teams: TeamOrGroup[];
  groups: TeamOrGroup[];
  selectedDate: string;
  selectedTeamId: string;
  selectedGroupId: string;
  onOpenLightbox: (paths: string[], index: number) => void;
}

type UserSubmissions = Awaited<ReturnType<typeof getUserSubmissions>>;

export function DashboardDialog({
  open,
  onOpenChange,
  initialData,
  teams,
  groups,
  selectedDate,
  selectedTeamId,
  selectedGroupId,
  onOpenLightbox,
}: DashboardDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Filters state
  const [date, setDate] = useState(selectedDate);
  const [teamId, setTeamId] = useState(selectedTeamId);
  const [groupId, setGroupId] = useState(selectedGroupId);
  const [onlyRedAlert, setOnlyRedAlert] = useState(false);

  // Expanded member state for screenshot loading
  const [expandedUser, setExpandedUser] = useState<{ id: string; name: string } | null>(null);
  const [userSubmissions, setUserSubmissions] = useState<UserSubmissions>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [userSubmissionsError, setUserSubmissionsError] = useState<string | null>(null);

  // Group accordion state
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Trigger search params change
  const handleFilterChange = (newDate: string, newTeamId: string, newGroupId: string) => {
    startTransition(() => {
      const params = new URLSearchParams();
      if (newDate) params.set("date", newDate);
      if (newTeamId && newTeamId !== "all") params.set("team_id", newTeamId);
      if (newGroupId && newGroupId !== "all") params.set("group_id", newGroupId);
      router.push(`/video-review?${params.toString()}`);
    });
  };

  // Group data by Group
  const groupedData = initialData.reduce((acc, row) => {
    if (onlyRedAlert && row.alert_level !== "red") {
      return acc;
    }
    const key = row.group_name || "未分类小组";
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {} as Record<string, DashboardRecord[]>);

  // Overall Statistics
  const totalTarget = initialData.reduce((sum, r) => sum + r.daily_target, 0);
  const totalSubmitted = initialData.reduce((sum, r) => sum + r.submitted_count, 0);
  const redAlertCount = initialData.filter((r) => r.alert_level === "red").length;
  const pendingExemptionsCount = initialData.filter((r) => r.exemption_status === "pending").length;
  const fulfillmentRate = totalTarget > 0 ? Math.round((totalSubmitted / totalTarget) * 100) : 100;

  // View member submissions
  const handleToggleUser = async (user_id: string, user_name: string, isRetry = false) => {
    if (expandedUser?.id === user_id && !isRetry) {
      setExpandedUser(null);
      setUserSubmissions([]);
      setUserSubmissionsError(null);
      return;
    }

    setExpandedUser({ id: user_id, name: user_name });
    setLoadingSubmissions(true);
    setUserSubmissionsError(null);
    try {
      const data = await getUserSubmissions(user_id, date);
      setUserSubmissions(data);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "";
      if (errMsg.includes("无权") || errMsg.includes("权限")) {
        toast.error("权限不足", { description: "您没有权限执行此操作" });
        setUserSubmissionsError("权限不足，无法查看");
      } else {
        toast.error("获取提交记录失败", {
          description: errMsg || "未知错误",
        });
        setUserSubmissionsError("获取今日凭证失败");
      }
    } finally {
      setLoadingSubmissions(false);
    }
  };

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: "min(1100px, calc(100vw - 32px))" }} className="w-[95vw] bg-white p-4 sm:p-6 rounded-2xl border border-stone-200 overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-medium text-stone-900">
            团队产量对账看板
          </DialogTitle>
        </DialogHeader>

        {/* 顶部三枚通透无框指标块 (去掉 border 和 bg, 直接三列布局) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="p-4 space-y-1">
            <span className="text-[12px] font-medium text-stone-500">
              全队已交 / 目标
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[18px] font-medium tabular-nums text-stone-900">
                {totalSubmitted} / {totalTarget}
              </span>
              <span className="text-[12px] font-medium text-[#6FAA7D] tabular-nums">
                ({fulfillmentRate}%)
              </span>
            </div>
          </div>

          <div className="p-4 space-y-1">
            <span className="text-[12px] font-medium text-stone-500">
              待审请假
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[18px] font-medium tabular-nums text-[#5F82A8]">
                {pendingExemptionsCount}
              </span>
              <span className="text-[12px] text-stone-500">人申请请假</span>
            </div>
          </div>

          <div className="p-4 space-y-1">
            <span className="text-[12px] font-medium text-stone-500">
              红灯未达标
            </span>
            <div className="flex items-baseline gap-2">
              <span className={cn(
                "text-[24px] font-medium tabular-nums",
                redAlertCount > 0 ? "text-[#C9604D]" : "text-stone-900"
              )}>
                {redAlertCount}
              </span>
              <span className="text-[12px] text-stone-500">人未达标且无豁免</span>
            </div>
          </div>
        </div>
        {/* 筛选过滤条 (靠 24px 留白与上下分隔，内部输入框用 bg-stone-50) */}
        <div className="flex flex-col sm:flex-row flex-wrap sm:items-center gap-4 py-2 mt-6 mb-6">
          {/* 日期选择 */}
          <div className="flex w-full sm:w-auto items-center gap-2">
            <Calendar className="size-4 text-stone-500 shrink-0" />
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                handleFilterChange(e.target.value, teamId, groupId);
              }}
              className="h-8 w-full min-w-[8rem] sm:w-32 rounded-lg bg-stone-50 border border-stone-200 px-3 text-[12px] font-medium text-stone-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D97757]/20 focus:border-[#D97757]/40 transition-[background-color,box-shadow]"
            />
          </div>

          {/* 团队筛选 */}
          <div className="flex w-full sm:w-auto items-center gap-2">
            <Users className="size-4 text-stone-500 shrink-0" />
            <select
              value={teamId}
              onChange={(e) => {
                setTeamId(e.target.value);
                handleFilterChange(date, e.target.value, groupId);
              }}
              className="h-8 w-full min-w-[8rem] sm:w-36 rounded-lg bg-stone-50 border border-stone-200 px-3 text-[12px] font-medium text-stone-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D97757]/20 focus:border-[#D97757]/40 transition-[background-color,box-shadow]"
            >
              <option value="all">所有团队</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* 小组筛选 */}
          <div className="flex w-full sm:w-auto items-center gap-2">
            <Users className="size-4 text-stone-500 shrink-0" />
            <select
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
                handleFilterChange(date, teamId, e.target.value);
              }}
              className="h-8 w-full min-w-[8rem] sm:w-36 rounded-lg bg-stone-50 border border-stone-200 px-3 text-[12px] font-medium text-stone-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D97757]/20 focus:border-[#D97757]/40 transition-[background-color,box-shadow]"
            >
              <option value="all">所有小组</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* 只看红灯 */}
          <button
            type="button"
            onClick={() => setOnlyRedAlert(!onlyRedAlert)}
            className={cn(
              "h-8 w-full sm:w-auto rounded-lg border px-3 text-[12px] font-medium transition-colors active:scale-95",
              onlyRedAlert
                ? "border-[#C9604D] text-[#C9604D] bg-[#C9604D]/5"
                : "border-stone-200 text-stone-500 bg-white hover:border-stone-300 hover:bg-stone-50"
            )}
          >
            只看红灯
          </button>

          {isPending && (
            <span className="flex items-center text-[12px] text-stone-500 w-full sm:w-auto justify-center sm:justify-start">
              <Loader2 className="mr-1 size-3 animate-spin" />
              数据同步中...
            </span>
          )}
        </div>

        {/* 树状折叠成员列表 (24px 留白分割) */}
        <div className="mt-6 space-y-5">
          {Object.keys(groupedData).length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-stone-200 text-[12px] text-stone-500">
              {onlyRedAlert ? "当前没有红灯未达标成员" : "当前筛选条件下无团队成员对账数据"}
            </div>
          ) : (
            Object.entries(groupedData).map(([groupName, members]) => {
              const isCollapsed = collapsedGroups[groupName];
              
              // 计算小组指标
              const gTarget = members.reduce((s, r) => s + r.daily_target, 0);
              const gSubmitted = members.reduce((s, r) => s + r.submitted_count, 0);
              const gRate = gTarget > 0 ? Math.round((gSubmitted / gTarget) * 100) : 100;

              return (
                <div key={groupName} className="space-y-2 mt-6">
                  {/* 小组头折叠触发栏 */}
                  <div
                    onClick={() => toggleGroup(groupName)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleGroup(groupName);
                      }
                    }}
                    className="flex items-center justify-between cursor-pointer py-1.5"
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? (
                        <ChevronDown className="size-4 text-stone-500" />
                      ) : (
                        <ChevronUp className="size-4 text-stone-500" />
                      )}
                      <span className="text-[13px] font-medium text-stone-700">
                        {groupName}
                      </span>
                      <span className="text-[12px] text-stone-500">
                        (达标率 <span className="tabular-nums">{gSubmitted}/{gTarget}</span> - <span className="tabular-nums">{gRate}%</span>)
                      </span>
                    </div>
                  </div>

                  {/* 小组组员行列表 */}
                  {!isCollapsed && (
                    <div className="overflow-hidden rounded-xl border border-stone-100 bg-white">
                      {members.map((member) => {
                        const isUserExpanded = expandedUser?.id === member.user_id;
                        
                        return (
                          <div
                            key={member.user_id}
                            className={cn(
                              "bg-white p-3 hover:bg-stone-50 transition-colors border-b border-stone-100 last:border-0",
                              member.alert_level === "red" && "border-l-2 border-l-[#C9604D] pl-3"
                            )}
                          >
                            <div
                              onClick={() => handleToggleUser(member.user_id, member.user_name)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handleToggleUser(member.user_id, member.user_name);
                                }
                              }}
                              className="flex items-center justify-between cursor-pointer"
                            >
                              {/* 组员基本信息 */}
                              <div className="flex items-center gap-3">
                                {/* 头像与状态灯结合 (头像右下角状态灯，静态，尺寸 10px) */}
                                <div className="relative size-8 rounded-full bg-stone-100 flex items-center justify-center text-[12px] font-medium text-stone-500">
                                  {member.user_name.slice(0, 2)}
                                  
                                  {/* 状态灯映射 */}
                                  <span
                                    className={cn(
                                      "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-white",
                                      member.alert_level === "red" && "bg-[#C9604D]",
                                      member.alert_level === "yellow" && "bg-[#D99E55]",
                                      member.alert_level === "green" && "bg-[#6FAA7D]"
                                    )}
                                  />
                                </div>

                                <div>
                                  <span className="text-[13px] font-medium text-stone-700">
                                    {member.user_name}
                                  </span>
                                  {member.exemption_status !== "none" && (
                                    <span className="ml-2 inline-flex items-center rounded-full bg-stone-100 px-1.5 py-0.5 text-[12px] text-stone-500">
                                      请假 ({member.exemption_status === "approved" ? "已准" : "待审"})
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* 产量指标 */}
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <p className="text-[12px] font-medium text-stone-700 tabular-nums">
                                    {member.submitted_count} / {member.daily_target}
                                  </p>
                                  <p className="text-[12px] text-stone-500">
                                    今日发布
                                  </p>
                                </div>
                                {isUserExpanded ? (
                                  <ChevronUp className="size-4 text-stone-500" />
                                ) : (
                                  <ChevronDown className="size-4 text-stone-500" />
                                )}
                              </div>
                            </div>

                            {/* 折叠区：该成员今日提交的截图列表 (懒加载) */}
                            {isUserExpanded && (
                              <div className="mt-2 pt-1 space-y-2">
                                {loadingSubmissions ? (
                                  <div className="flex items-center justify-center py-4 text-stone-500 text-[12px]">
                                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                                    正在获取提交明细...
                                  </div>
                                ) : userSubmissionsError ? (
                                  <div className="flex flex-col items-center justify-center py-3 text-stone-500 text-[12px] gap-2">
                                    <span className="flex items-center gap-1 text-[#D97757]">
                                      <AlertTriangle className="size-3.5" />
                                      {userSubmissionsError}
                                    </span>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleUser(member.user_id, member.user_name, true);
                                      }}
                                      className="h-7 rounded-lg border-[#D97757] text-[#D97757] hover:bg-[#D97757]/5 text-[12px] font-medium"
                                    >
                                      重新加载
                                    </Button>
                                  </div>
                                ) : userSubmissions.length === 0 ? (
                                  <p className="text-[12px] text-stone-500 text-center py-2">
                                    今日暂无截图凭证提交
                                  </p>
                                ) : (
                                  <div className="grid grid-cols-4 gap-2">
                                    {userSubmissions.flatMap((sub) =>
                                      (sub.screenshot_items ?? []).map((item, idx) => (
                                        <div
                                          key={item.path}
                                          role="button"
                                          tabIndex={0}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onOpenLightbox(
                                              sub.screenshot_items.map((i) => i.path),
                                              idx
                                            );
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                              e.preventDefault();
                                              e.stopPropagation();
                                              onOpenLightbox(
                                                sub.screenshot_items.map((i) => i.path),
                                                idx
                                              );
                                            }
                                          }}
                                          className="group relative aspect-[16/10] overflow-hidden rounded-lg border border-stone-200 bg-stone-50 cursor-pointer"
                                        >
                                          {item.signed_url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                              src={item.signed_url}
                                              alt="凭证"
                                              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                                            />
                                          ) : (
                                            <div className="flex h-full w-full items-center justify-center text-stone-500">
                                              <ImageIcon className="size-4" />
                                            </div>
                                          )}
                                          <div className="absolute inset-0 flex items-center justify-center bg-stone-900/30 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                            <Eye className="size-4 text-white" />
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
