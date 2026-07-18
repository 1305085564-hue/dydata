"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { 
  Calendar, 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  ArrowRight, 
  FileText,
  UserCheck
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImageLightbox } from "@/components/image-lightbox";
import { toast } from "sonner";
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

interface ProductionDashboardProps {
  initialData: DashboardRecord[];
  teams: TeamOrGroup[];
  groups: TeamOrGroup[];
  selectedDate: string;
  selectedTeamId: string;
  selectedGroupId: string;
}

export function ProductionDashboard({
  initialData,
  teams,
  groups,
  selectedDate,
  selectedTeamId,
  selectedGroupId,
}: ProductionDashboardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Filters state
  const [date, setDate] = useState(selectedDate);
  const [teamId, setTeamId] = useState(selectedTeamId);
  const [groupId, setGroupId] = useState(selectedGroupId);

  // Dialog / Modal state
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string } | null>(null);
  const [userSubmissions, setUserSubmissions] = useState<any[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [lightbox, setLightbox] = useState<{ paths: string[]; index: number } | null>(null);

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
  const fulfillmentRate = totalTarget > 0 ? Math.round((totalSubmitted / totalTarget) * 100) : 100;

  // View member details
  const handleViewUser = async (user_id: string, user_name: string) => {
    setSelectedUser({ id: user_id, name: user_name });
    setLoadingSubmissions(true);
    try {
      const data = await getUserSubmissions(user_id, date);
      setUserSubmissions(data);
    } catch (err: any) {
      toast.error("获取提交记录失败", {
        description: err.message || "未知错误",
      });
      setSelectedUser(null);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 筛选过滤条 */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4">
        {/* 日期选择 */}
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-stone-500" />
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              handleFilterChange(e.target.value, teamId, groupId);
            }}
            className="h-9 rounded-lg bg-stone-50 border border-stone-200 px-3 text-[13px] font-medium text-stone-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D97757]/20 focus:border-[#D97757]/40 transition-[background-color,box-shadow]"
          />
        </div>

        {/* 团队筛选 */}
        <div className="flex items-center gap-2">
          <Users className="size-4 text-stone-500" />
          <select
            value={teamId}
            onChange={(e) => {
              setTeamId(e.target.value);
              handleFilterChange(date, e.target.value, groupId);
            }}
            className="h-9 rounded-lg bg-stone-50 border border-stone-200 px-3 text-[13px] font-medium text-stone-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D97757]/20 focus:border-[#D97757]/40 transition-[background-color,box-shadow]"
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
          <Users className="size-4 text-stone-500" />
          <select
            value={groupId}
            onChange={(e) => {
              setGroupId(e.target.value);
              handleFilterChange(date, teamId, e.target.value);
            }}
            className="h-9 rounded-lg bg-stone-50 border border-stone-200 px-3 text-[13px] font-medium text-stone-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D97757]/20 focus:border-[#D97757]/40 transition-[background-color,box-shadow]"
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
          <span className="text-[12px] text-stone-500 opacity-60 ml-auto">
            数据加载中...
          </span>
        )}
      </div>

      {/* 概览大数指标条 */}
      <div className="rounded-2xl border border-stone-200 bg-white px-6 py-5 flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-stone-100 gap-4 sm:gap-0">
        {/* 指标 1 */}
        <div className="flex-1 pb-4 sm:pb-0 sm:pr-4 space-y-1">
          <span className="text-[13px] text-stone-500">今日全队目标</span>
          <div className="flex items-baseline gap-1">
            <span className="text-[18px] font-medium tabular-nums text-stone-900">
              {totalTarget}
            </span>
            <span className="text-[12px] text-stone-500 ml-1">条</span>
          </div>
        </div>

        {/* 指标 2 */}
        <div className="flex-1 py-4 sm:py-0 sm:px-4 space-y-1">
          <span className="text-[13px] text-stone-500">已提交作品</span>
          <div className="flex items-baseline gap-1">
            <span className="text-[18px] font-medium tabular-nums text-stone-900">
              {totalSubmitted}
            </span>
            <span className="text-[12px] text-stone-500 ml-1">条</span>
          </div>
        </div>

        {/* 指标 3 */}
        <div className="flex-1 py-4 sm:py-0 sm:px-4 space-y-1">
          <span className="text-[13px] text-stone-500">完成率</span>
          <div className="flex items-baseline gap-1">
            <span className="text-[18px] font-medium tabular-nums text-stone-900">
              {fulfillmentRate}
            </span>
            <span className="text-[12px] text-stone-500 ml-1">%</span>
          </div>
        </div>

        {/* 指标 4 */}
        <div className="flex-1 pt-4 sm:pt-0 sm:pl-4 space-y-1">
          <span className="text-[13px] text-stone-500">未达标人数 (红灯)</span>
          <div className="flex items-baseline gap-1">
            <span className={cn(
              "text-[24px] font-medium tabular-nums",
              redAlertCount > 0 ? "text-[#B24E3E]" : "text-stone-900"
            )}>
              {redAlertCount}
            </span>
            <span className="text-[12px] text-stone-500 ml-1">人</span>
          </div>
        </div>
      </div>

      {/* 数据列表 */}
      <div className="space-y-6">
        {Object.keys(groupedData).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-200 bg-white py-12 flex flex-col items-center justify-center text-center">
            <Users className="size-10 text-stone-500 mb-3" />
            <p className="text-[13px] text-stone-500 mb-4">暂无相关成员数据</p>
            <button
              type="button"
              onClick={() => {
                setDate(selectedDate);
                setTeamId("all");
                setGroupId("all");
                handleFilterChange(selectedDate, "all", "all");
              }}
              className="h-9 px-4 rounded-lg bg-[#B4532F] text-[13px] font-medium text-white hover:bg-[#A84D2B] active:scale-95 transition-all"
            >
              重置筛选条件
            </button>
          </div>
        ) : (
          Object.entries(groupedData).map(([groupName, members]) => {
            const groupTarget = members.reduce((sum, m) => sum + m.daily_target, 0);
            const groupSubmitted = members.reduce((sum, m) => sum + m.submitted_count, 0);
            const groupRate = groupTarget > 0 ? Math.round((groupSubmitted / groupTarget) * 100) : 100;

            return (
              <div key={groupName} className="space-y-3">
                {/* 组头 */}
                <div className="flex items-baseline justify-between px-1">
                  <h3 className="text-[13px] font-medium text-stone-900">
                    {groupName}
                  </h3>
                  <span className="text-[12px] text-stone-500 font-medium">
                    已交 <span className="tabular-nums">{groupSubmitted}</span> / 目标 <span className="tabular-nums">{groupTarget}</span> (<span className="tabular-nums">{groupRate}%</span>)
                  </span>
                </div>

                {/* 组成员列表 */}
                <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                  {members.map((member, idx) => {
                    const isLast = idx === members.length - 1;
                    return (
                      <div
                        key={member.user_id}
                        className={cn(
                          "group flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-stone-50/50",
                          !isLast && "border-b border-stone-100",
                          member.alert_level === "red" && "border-l-[3px] border-l-[#C9604D]",
                          member.alert_level === "yellow" && "border-l-[3px] border-l-[#D99E55]",
                          member.alert_level === "green" && "border-l-[3px] border-l-[#6FAA7D]/60"
                        )}
                      >
                        {/* 左侧个人基本信息 */}
                        <div className="flex items-center gap-3">
                          <span
                            className="size-2 shrink-0 rounded-full ring-1 ring-white"
                            style={{
                              backgroundColor:
                                member.alert_level === "red"
                                  ? "#C9604D"
                                  : member.alert_level === "yellow"
                                  ? "#D99E55"
                                  : "#6FAA7D",
                            }}
                            aria-hidden
                          />
                          <div>
                            <span className="text-[13px] font-medium text-stone-700">
                              {member.user_name}
                            </span>
                            <span className="text-[12px] text-stone-500 ml-2">
                              目标: <span className="tabular-nums">{member.daily_target}</span> / 已交: <span className="tabular-nums">{member.submitted_count}</span>
                            </span>
                          </div>
                        </div>

                        {/* 右侧状态与操作区 */}
                        <div className="flex items-center gap-4">
                          {/* 豁免状态说明 */}
                          {member.exemption_status === "approved" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#6FAA7D]/10 px-2 py-0.5 text-[12px] font-medium text-[#3F7A4E]">
                              <UserCheck className="size-3" />
                              已豁免
                            </span>
                          )}
                          {member.exemption_status === "pending" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#D99E55]/10 px-2 py-0.5 text-[12px] font-medium text-[#8F641B]">
                              豁免待审
                            </span>
                          )}

                          {/* 缺额警报 */}
                          {member.alert_level === "red" && member.gap > 0 && (
                            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[#B24E3E]">
                              <AlertCircle className="size-3.5" />
                              缺 <span className="tabular-nums">{member.gap}</span> 条
                            </span>
                          )}

                          {/* 查看作品按钮 */}
                          <button
                            type="button"
                            onClick={() => handleViewUser(member.user_id, member.user_name)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 text-[12px] font-medium text-stone-500 transition-colors hover:border-[#D97757]/40 hover:text-[#B4532F] active:translate-y-0"
                          >
                            作品记录
                            <ArrowRight className="size-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 作品查看 Dialog */}
      <Dialog open={selectedUser !== null} onOpenChange={(open) => { if (!open) setSelectedUser(null); }}>
        <DialogContent className="bg-white p-8 rounded-2xl max-h-[85vh] overflow-y-auto" style={{ maxWidth: '720px' }}>
          <DialogHeader className="flex flex-row items-center justify-between border-b border-stone-100 pb-3">
            <DialogTitle className="text-[18px] font-medium text-stone-900">
              {selectedUser?.name} · 作品提交详情
            </DialogTitle>
          </DialogHeader>

          {loadingSubmissions ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-2">
              <div className="size-6 rounded-full border-2 border-stone-200 border-t-[#D97757] animate-spin" />
              <span className="text-[13px] text-stone-500">正在获取并加载截图...</span>
            </div>
          ) : userSubmissions.length === 0 ? (
            <div className="py-12 text-center text-stone-500 text-[13px]">
              该成员在当天未提交任何作品截图。
            </div>
          ) : (
            <div className="space-y-6 mt-4">
              {userSubmissions.map((sub, idx) => (
                <div 
                  key={sub.id} 
                  className={cn(
                    "space-y-3 pb-6",
                    idx !== userSubmissions.length - 1 && "border-b border-stone-100"
                  )}
                >
                  {/* 文案展示 */}
                  {sub.content_text && (
                    <div className="rounded-xl bg-stone-100/50 p-4 border border-stone-200/50">
                      <p className="text-[13px] text-stone-700 whitespace-pre-wrap leading-relaxed">
                        {sub.content_text}
                      </p>
                    </div>
                  )}

                  {/* 截图展示 */}
                  {sub.screenshot_items && sub.screenshot_items.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {sub.screenshot_items.map((item: any, sIdx: number) => (
                        <div 
                          key={sIdx}
                          role="button"
                          tabIndex={0}
                          onClick={() => setLightbox({ paths: [item.signed_url], index: 0 })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setLightbox({ paths: [item.signed_url], index: 0 });
                            }
                          }}
                          className="aspect-square relative rounded-lg border border-stone-200 bg-stone-50 overflow-hidden cursor-zoom-in group/img"
                        >
                          {item.signed_url ? (
                            <img 
                              src={item.signed_url} 
                              alt="提交截图" 
                              className="size-full object-cover transition duration-200 group-hover/img:scale-105"
                            />
                          ) : (
                            <div className="size-full flex items-center justify-center text-[12px] text-stone-500">
                              加载失败
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 备注 */}
                  {sub.note && (
                    <div className="flex items-start gap-1.5 text-[12px] text-stone-500">
                      <FileText className="size-3.5 text-stone-500 mt-0.5" />
                      <span>备注: {sub.note}</span>
                    </div>
                  )}

                  <div className="text-[12px] text-stone-500 ">
                    提交于: {new Date(sub.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 放大预览 Lightbox */}
      {lightbox && (
        <ImageLightbox
          paths={lightbox.paths}
          currentIndex={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={(idx) => setLightbox((prev) => (prev ? { ...prev, index: idx } : prev))}
        />
      )}
    </div>
  );
}
