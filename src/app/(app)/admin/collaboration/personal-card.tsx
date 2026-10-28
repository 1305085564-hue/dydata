"use client";

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Copy, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PersonalCardMetrics } from "./personal-card-metrics";
import { PersonalCardWorks } from "./personal-card-works";
import {
  buildGrowthChartData,
  buildGrowthAverages,
  buildSymbiosisInsight,
  pickHoveredChartWork,
  type ChartWorkPoint,
} from "@/lib/collaboration/domain/person-metrics";
import { type CollaborationRoleTab, type PersonDetailData } from "./types";
import {
  clearPersonDataCache,
  loadPersonData,
  getPersonDataCacheKey,
  readPersonDataCache,
  writePersonDataCache,
} from "./person-data";
import {
  CollaborationDiagnosisContext,
  type CollaborationDiagnosisDetail,
} from "@/components/admin/collaboration-work-review-link";
import { ContentDetailDialog } from "@/app/(app)/admin/content/content-detail-dialog";
import type { EvaluationStandards } from "@/lib/evaluation-standards";

interface PersonalCardProps {
  userId: string | null;
  year: number;
  month: number;
  activeTab?: CollaborationRoleTab;
  onClose: () => void;
  refreshTrigger?: number;
  onPersonNameLoaded?: (name: string) => void;
  diagnosisDetail?: CollaborationDiagnosisDetail | null;
  evaluationStandards: EvaluationStandards;
  onCloseDiagnosis?: () => void;
  canManageVideos?: boolean;
  onLifecycleChanged?: () => void;
}

export function PersonalCard({
  userId,
  year,
  month,
  activeTab,
  onClose,
  refreshTrigger = 0,
  onPersonNameLoaded,
  diagnosisDetail = null,
  evaluationStandards,
  onCloseDiagnosis,
  canManageVideos = false,
  onLifecycleChanged,
}: PersonalCardProps) {
  const diagnosisContext = useContext(CollaborationDiagnosisContext);
  const evaluationStandardsKey = JSON.stringify(evaluationStandards);
  const cacheKey = userId
    ? getPersonDataCacheKey(userId, year, month, activeTab, undefined, evaluationStandardsKey)
    : "";
  const cachedData = userId ? readPersonDataCache(cacheKey) : null;

  const [data, setData] = useState<PersonDetailData | null>(cachedData);
  const [loading, setLoading] = useState(Boolean(userId && !cachedData));
  const [error, setError] = useState<string | null>(null);
  const [hoveredWork, setHoveredWork] = useState<ChartWorkPoint | null>(null);

  const [visibleMetrics, setVisibleMetrics] = useState({
    interaction: true,
    like: true,
    favorite: true,
  });
  const [copied, setCopied] = useState(false);

  const handleCopyLink = useCallback(async () => {
    if (!userId) return;
    const url = `${window.location.origin}/people/${userId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("已复制成员主页链接");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败，请手动打开页面复制");
    }
  }, [userId]);

  const toggleMetric = (key: "interaction" | "like" | "favorite") => {
    setVisibleMetrics((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const roleLabel =
    activeTab === "writers"
      ? "文案"
      : activeTab === "editors"
        ? "剪辑"
        : activeTab === "operators"
          ? "运营"
          : activeTab === "talents"
            ? "达人"
            : "经手";

  // Render-time state derivation & sync when userId/year/month changes
  const [prevKey, setPrevKey] = useState(cacheKey);
  if (cacheKey !== prevKey) {
    setPrevKey(cacheKey);
    setData(cachedData);
    setLoading(Boolean(userId && !cachedData));
    setError(null);
    setHoveredWork(null);
  }

  useEffect(() => {
    if (!userId) return;

    const key = getPersonDataCacheKey(userId, year, month, activeTab, undefined, evaluationStandardsKey);
    const hit = readPersonDataCache(key);
    if (hit) {
      return;
    }

    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 切换人员且无缓存时，发起异步请求前重置加载态与错误
    setLoading(true);
    setError(null);

    loadPersonData(userId, year, month, activeTab, evaluationStandardsKey)
      .then((resData) => {
        if (isMounted) {
          writePersonDataCache(key, resData);
          setData(resData);
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [userId, year, month, activeTab, evaluationStandardsKey]);

  // 向外部总控报告当前人员姓名（用于诊断抽屉返回面包屑），避免子组件错传账号名
  useEffect(() => {
    if (data?.name && onPersonNameLoaded) {
      onPersonNameLoaded(data.name);
    }
  }, [data?.name, onPersonNameLoaded]);

  // 诊断抽屉内发生生命周期变动（删稿/恢复）时触发刷新，防脏数据
  useEffect(() => {
    if (!userId || !refreshTrigger) return;
    const key = getPersonDataCacheKey(userId, year, month, activeTab, undefined, evaluationStandardsKey);
    clearPersonDataCache(userId);
    let isMounted = true;
    loadPersonData(userId, year, month, activeTab, evaluationStandardsKey)
      .then((resData) => {
        if (isMounted) {
          writePersonDataCache(key, resData);
          setData(resData);
        }
      })
      .catch((err: Error) => {
        if (isMounted) {
          setError(err.message);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [refreshTrigger, userId, year, month, activeTab, evaluationStandardsKey]);

  const isOpen = Boolean(userId);

  // 派生数据每次渲染都会重建对象数组；固定引用后，下游 recharts 的 tooltip 桥接上报的作品对象才稳定，
  // 不会每次渲染都写入新对象，避免 setState → 重渲染 → 再上报的更新风暴（Maximum update depth exceeded）
  const growthChartData = useMemo(() => buildGrowthChartData(data?.growthWorks), [data]);
  const growthAverages = useMemo(() => buildGrowthAverages(data?.growthSummary), [data]);
  const symbiosisInsight = useMemo(() => buildSymbiosisInsight(data), [data]);

  // 同一作品（reportId 相同）保持原状态引用，不因对象身份变化而重复触发重渲染
  const handleHoverWork = useCallback((point: ChartWorkPoint) => {
    setHoveredWork((prev) => pickHoveredChartWork(prev, point));
  }, []);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          // 如果当前处于作品诊断状态，点遮罩优先退回档案卡，避免误关整个抽屉
          if (diagnosisDetail) {
            onCloseDiagnosis?.();
            return;
          }
          onClose();
        }
      }}
    >
      <SheetContent
        showCloseButton={false}
        className={cn(
          "w-full p-0 flex flex-col bg-white border-l border-[#E2E2DF] shadow-claude-dialog transition-[max-width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          diagnosisDetail ? "max-w-4xl sm:max-w-4xl" : "max-w-3xl sm:max-w-3xl",
        )}
      >
        {/* 视口叠层：档案卡与作品诊断共用同一网格单元。诊断打开时卡片仅视觉隐藏而非 display:none，
            否则 recharts 在 display:none 子树里被量成 0 尺寸，控制台会刷 width(0)/height(0) 告警 */}
        <div className="grid flex-1 min-h-0 grid-rows-[minmax(0,1fr)]">
        {/* 档案卡主视图：在作品诊断打开时仅视觉隐藏（保住内部滚动条位置与图表状态），绝不卸载 DOM。
            min-w-0：本单元是自动列宽的网格项，默认 min-width:auto 会取内容 min-content，被悬停行情带里的
            长标题/宽指标顶到 849px，ResponsiveContainer 随父容器变宽导致折线图横向重排（"各种跳"）。 */}
        <div className={cn("flex flex-col min-h-0 min-w-0 [grid-area:1/1]", diagnosisDetail && "invisible pointer-events-none")}>
          {/* Header */}
          <SheetHeader className="flex flex-row items-center justify-between shrink-0 py-3.5">
          {loading ? (
            <div className="space-y-1">
              <Skeleton className="h-6 w-32 rounded-md" />
              <Skeleton className="h-4 w-48 rounded-md" />
            </div>
          ) : error ? (
            <div>
              <SheetTitle className="text-status-danger">
                加载失败
              </SheetTitle>
              <SheetDescription className="text-[12px] text-status-danger">{error}</SheetDescription>
            </div>
          ) : data ? (
            <div className="flex items-center justify-between w-full pr-4">
              <div>
                <div className="flex items-center gap-2">
                  <SheetTitle>
                    {data.name}
                  </SheetTitle>
                  <span className="rounded-md bg-[#F1F1F0] px-2 py-0.5 text-[12px] font-normal text-[#78716C]">
                    个人岗位档案
                  </span>
                  <div className="flex items-center gap-1.5 ml-1">
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      title="复制成员主页链接"
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-normal text-[#78716C] transition-colors hover:bg-[#F1F1F0] hover:text-[#141413] cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="size-3 text-[#D97757]" />
                          <span className="text-[#D97757]">已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-3" />
                          <span>复制主页</span>
                        </>
                      )}
                    </button>
                    <Link
                      href={`/people/${data.userId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="新窗口打开完整主页"
                      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-normal text-[#78716C] transition-colors hover:bg-[#F1F1F0] hover:text-[#141413]"
                    >
                      <ExternalLink className="size-3" />
                      <span>新窗口打开</span>
                    </Link>
                  </div>
                </div>
                {/* 头部单行内联信息流 */}
                <div className="mt-1 text-[12px] text-[#78716C] tabular-nums">
                  <span>{year} 年 {month} 月 · 文案 {data.currentMonth.writerCount} · 剪辑 {data.currentMonth.editorCount} · 运营 {data.currentMonth.operatorCount}</span>
                </div>
                {symbiosisInsight && symbiosisInsight.topAccounts.length > 0 && (
                  <div className="mt-1 text-[12px] text-[#78716C] flex items-center gap-1">
                    <span>
                      协同常配账号：
                      {symbiosisInsight.topAccounts.map(([accName, count]: [string, number], idx: number) => (
                        <span key={accName} className="text-[#1F1E1D] font-normal">
                          {idx > 0 ? "、" : ""}
                          {accName} ({count}篇)
                        </span>
                      ))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            className="size-7 rounded-md flex items-center justify-center text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] transition-colors shrink-0 cursor-pointer"
          >
            <X className="size-4" />
          </button>
        </SheetHeader>

        {/* Content Body：单层自然阅读延伸 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-3 pb-6 space-y-4">
          {loading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
              </div>
              <Skeleton className="h-44 w-full rounded-xl" />
              <Skeleton className="h-60 w-full rounded-xl" />
            </div>
          ) : data ? (
            <>
              <PersonalCardMetrics
                data={data}
                activeTab={activeTab}
                roleLabel={roleLabel}
                growthChartData={growthChartData}
                growthAverages={growthAverages}
                hoveredWork={hoveredWork}
                visibleMetrics={visibleMetrics}
                toggleMetric={toggleMetric}
                onHoverWork={handleHoverWork}
                diagnosisContext={diagnosisContext}
                onClearHover={() => setHoveredWork(null)}
              />

              <PersonalCardWorks
                data={data}
                activeTab={activeTab}
                diagnosisContext={diagnosisContext}
              />

              {/* 完卷微符 */}
              <div className="flex items-center justify-center gap-3 py-4 text-[#E2E2DF]">
                <span className="h-[1px] w-8 bg-[#E2E2DF]" />
                <span className="text-[12px] text-[#A8A29E]">✦ 档案完卷</span>
                <span className="h-[1px] w-8 bg-[#E2E2DF]" />
              </div>
            </>
          ) : null}
        </div>
      </div>

        {/* 内嵌作品诊断子视图：外壳不重飞，宽度平滑延展至 896px，带 [← 返回档案] 面包屑 */}
        {diagnosisDetail && (
          <div className="flex flex-col min-h-0 min-w-0 [grid-area:1/1]">
            <ContentDetailDialog
              open={true}
              onOpenChange={(open) => {
                if (!open) onCloseDiagnosis?.();
              }}
              renderMode="inline"
              video={diagnosisDetail.video}
              snapshot={diagnosisDetail.snapshot}
              topicKind={diagnosisDetail.topicKind ?? null}
              evaluationStandards={evaluationStandards}
              canOperateLifecycle={canManageVideos}
              canPurge={false}
              titlePrefix="个人档案"
              onBack={onCloseDiagnosis}
              backLabel={data?.name ? `${data.name} 的档案` : "个人档案"}
              onCloseEntirely={onClose}
              onLifecycleChanged={() => {
                onLifecycleChanged?.();
              }}
            />
          </div>
        )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
