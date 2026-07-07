"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Users,
  AlertCircle,
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

  // Expanded member state for screenshot loading
  const [expandedUser, setExpandedUser] = useState<{ id: string; name: string } | null>(null);
  const [userSubmissions, setUserSubmissions] = useState<any[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

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
  const handleToggleUser = async (user_id: string, user_name: string) => {
    if (expandedUser?.id === user_id) {
      setExpandedUser(null);
      setUserSubmissions([]);
      return;
    }

    setExpandedUser({ id: user_id, name: user_name });
    setLoadingSubmissions(true);
    try {
      const data = await getUserSubmissions(user_id, date);
      setUserSubmissions(data);
    } catch (err: any) {
      toast.error("获取提交记录失败", {
        description: err.message || "未知错误",
      });
      setExpandedUser(null);
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
      <DialogContent className="max-w-6xl w-[95vw] bg-white p-6 rounded-2xl border border-stone-200 overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-bold text-stone-800">
            团队产量对账看板
          </DialogTitle>
        </DialogHeader>

        {/* 顶部三枚通透无框指标块 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="rounded-xl border border-stone-100 bg-stone-50/30 p-4 space-y-1">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
              全队总目标达成度
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[28px] font-bold font-mono tabular-nums text-stone-800">
                {totalSubmitted} / {totalTarget}
              </span>
              <span className="text-[12px] font-semibold text-[#6FAA7D] font-mono tabular-nums">
                ({fulfillmentRate}%)
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-stone-100 bg-stone-50/30 p-4 space-y-1">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
              豁免待审人数
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[28px] font-bold font-mono tabular-nums text-[#8AA8C7]">
                {pendingExemptionsCount}
              </span>
              <span className="text-[11px] text-stone-400">人申请请假</span>
            </div>
          </div>

          <div className="rounded-xl border border-stone-100 bg-stone-50/30 p-4 space-y-1">
            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
              异常红灯人数
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[28px] font-bold font-mono tabular-nums text-[#C9604D]">
                {redAlertCount}
              </span>
              <span className="text-[11px] text-stone-400">人未达标且无豁免</span>
            </div>
          </div>
        </div>

        {/* 筛选过滤条 (L1 卡片上，依靠底色差 white 容器，无粗框) */}
        <div className="flex flex-wrap items-center gap-3 mt-4 rounded-xl border border-stone-100 bg-stone-50/20 p-3.5">
          {/* 日期选择 */}
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-stone-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                handleFilterChange(e.target.value, teamId, groupId);
              }}
              className="h-8 rounded-lg border-0 bg-stone-100 px-3 text-[12px] font-mono font-medium text-stone-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900/5 transition-[background-color,box-shadow]"
            />
          </div>

          {/* 团队筛选 */}
          <div className="flex items-center gap-2">
            <Users className="size-4 text-stone-400" />
            <select
              value={teamId}
              onChange={(e) => {
                setTeamId(e.target.value);
                handleFilterChange(date, e.target.value, groupId);
              }}
              className="h-8 rounded-lg border-0 bg-stone-100 px-3 text-[12px] font-medium text-stone-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900/5 transition-[background-color,box-shadow]"
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
          <div className="flex items-center gap-2">
            <Users className="size-4 text-stone-400" />
            <select
              value={groupId}
              onChange={(e) => {
                setGroupId(e.target.value);
                handleFilterChange(date, teamId, e.target.value);
              }}
              className="h-8 rounded-lg border-0 bg-stone-100 px-3 text-[12px] font-medium text-stone-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-stone-900/5 transition-[background-color,box-shadow]"
            >
              <option value="all">所有小组</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {isPending && (
            <span className="flex items-center text-[11px] text-stone-400">
              <Loader2 className="mr-1 size-3 animate-spin" />
              数据同步中...
            </span>
          )}
        </div>

        {/* 树状折叠成员列表 (24px 留白分割) */}
        <div className="mt-6 space-y-5">
          {Object.keys(groupedData).length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-stone-200 text-[12px] text-stone-400">
              当前筛选条件下无团队成员对账数据
            </div>
          ) : (
            Object.entries(groupedData).map(([groupName, members]) => {
              const isCollapsed = collapsedGroups[groupName];
              
              // 计算小组指标
              const gTarget = members.reduce((s, r) => s + r.daily_target, 0);
              const gSubmitted = members.reduce((s, r) => s + r.submitted_count, 0);
              const gRate = gTarget > 0 ? Math.round((gSubmitted / gTarget) * 100) : 100;

              return (
                <div key={groupName} className="space-y-2">
                  {/* 小组头折叠触发栏 */}
                  <div
                    onClick={() => toggleGroup(groupName)}
                    className="flex items-center justify-between bg-stone-50/50 p-2.5 rounded-xl border border-stone-100 cursor-pointer hover:bg-stone-50"
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? (
                        <ChevronDown className="size-4 text-stone-400" />
                      ) : (
                        <ChevronUp className="size-4 text-stone-400" />
                      )}
                      <span className="text-[13px] font-bold text-stone-800">
                        {groupName}
                      </span>
                      <span className="text-[11px] text-stone-500 font-mono tabular-nums">
                        (达标率 {gSubmitted}/{gTarget} - {gRate}%)
                      </span>
                    </div>
                  </div>

                  {/* 小组组员行列表 */}
                  {!isCollapsed && (
                    <div className="space-y-1.5 pl-2">
                      {members.map((member) => {
                        const isUserExpanded = expandedUser?.id === member.user_id;
                        
                        return (
                          <div
                            key={member.user_id}
                            className="rounded-xl border border-stone-100 bg-white p-3 hover:border-stone-300 transition-colors"
                          >
                            <div
                              onClick={() => handleToggleUser(member.user_id, member.user_name)}
                              className="flex items-center justify-between cursor-pointer"
                            >
                              {/* 组员基本信息 */}
                              <div className="flex items-center gap-3">
                                {/* 头像与状态灯结合 (头像右下角状态灯，静态，尺寸 10px) */}
                                <div className="relative size-8 rounded-full bg-stone-100 flex items-center justify-center text-[12px] font-bold text-stone-600">
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
                                  <span className="text-[13px] font-bold text-stone-800">
                                    {member.user_name}
                                  </span>
                                  {member.exemption_status !== "none" && (
                                    <span className="ml-2 inline-flex items-center rounded-full bg-stone-100 px-1.5 py-0.2 text-[10px] text-stone-500">
                                      请假 ({member.exemption_status === "approved" ? "已准" : "待审"})
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* 产量指标 */}
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <p className="text-[12px] font-bold text-stone-800 font-mono tabular-nums">
                                    {member.submitted_count} / {member.daily_target}
                                  </p>
                                  <p className="text-[10px] text-stone-400">
                                    今日发布
                                  </p>
                                </div>
                                {isUserExpanded ? (
                                  <ChevronUp className="size-4 text-stone-400" />
                                ) : (
                                  <ChevronDown className="size-4 text-stone-400" />
                                )}
                              </div>
                            </div>

                            {/* 折叠区：该成员今日提交的截图列表 (懒加载) */}
                            {isUserExpanded && (
                              <div className="mt-3 border-t border-stone-100 pt-3 space-y-2">
                                {loadingSubmissions ? (
                                  <div className="flex items-center justify-center py-4 text-stone-400 text-[11px]">
                                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                                    正在获取提交明细...
                                  </div>
                                ) : userSubmissions.length === 0 ? (
                                  <p className="text-[11px] text-stone-400 text-center py-2">
                                    今日暂无截图凭证提交
                                  </p>
                                ) : (
                                  <div className="grid grid-cols-4 gap-2">
                                    {userSubmissions.flatMap((sub: any) =>
                                      (sub.screenshot_items ?? []).map((item: any, idx: number) => (
                                        <div
                                          key={item.path}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onOpenLightbox(
                                              sub.screenshot_items.map((i: any) => i.path),
                                              idx
                                            );
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
                                            <div className="flex h-full w-full items-center justify-center text-stone-400">
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
