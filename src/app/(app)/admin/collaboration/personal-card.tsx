"use client";

import { useContext, useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PersonalCardMetrics } from "./personal-card-metrics";
import { PersonalCardWorks } from "./personal-card-works";
import {
  buildGrowthChartData,
  buildGrowthAverages,
  buildSymbiosisInsight,
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

interface PersonalCardProps {
  userId: string | null;
  year: number;
  month: number;
  activeTab?: CollaborationRoleTab;
  onClose: () => void;
  refreshTrigger?: number;
  onPersonNameLoaded?: (name: string) => void;
  diagnosisDetail?: CollaborationDiagnosisDetail | null;
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
  onCloseDiagnosis,
  canManageVideos = false,
  onLifecycleChanged,
}: PersonalCardProps) {
  const diagnosisContext = useContext(CollaborationDiagnosisContext);
  const cacheKey = userId ? getPersonDataCacheKey(userId, year, month, activeTab) : "";
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

    const key = `${userId}-${year}-${month}-${activeTab ?? "legacy"}`;
    const hit = readPersonDataCache(key);
    if (hit) {
      return;
    }

    let isMounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 切换人员且无缓存时，发起异步请求前重置加载态与错误
    setLoading(true);
    setError(null);

    loadPersonData(userId, year, month, activeTab)
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
  }, [userId, year, month, activeTab]);

  // 向外部总控报告当前人员姓名（用于诊断抽屉返回面包屑），避免子组件错传账号名
  useEffect(() => {
    if (data?.name && onPersonNameLoaded) {
      onPersonNameLoaded(data.name);
    }
  }, [data?.name, onPersonNameLoaded]);

  // 诊断抽屉内发生生命周期变动（删稿/恢复）时触发刷新，防脏数据
  useEffect(() => {
    if (!userId || !refreshTrigger) return;
    const key = `${userId}-${year}-${month}-${activeTab ?? "legacy"}`;
    clearPersonDataCache(userId);
    let isMounted = true;
    loadPersonData(userId, year, month, activeTab)
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
  }, [refreshTrigger, userId, year, month, activeTab]);

  const isOpen = Boolean(userId);

  const growthChartData = buildGrowthChartData(data?.growthWorks);
  const growthAverages = buildGrowthAverages(data?.growthSummary);
  const symbiosisInsight = buildSymbiosisInsight(data);

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
          "w-full p-0 flex flex-col bg-white border-l border-[#E2E2DF] shadow-claude-dialog transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          diagnosisDetail ? "max-w-4xl sm:max-w-4xl" : "max-w-2xl sm:max-w-2xl",
        )}
      >
        {/* 视口叠层：档案卡与作品诊断共用同一网格单元。诊断打开时卡片仅视觉隐藏而非 display:none，
            否则 recharts 在 display:none 子树里被量成 0 尺寸，控制台会刷 width(0)/height(0) 告警 */}
        <div className="grid flex-1 min-h-0 grid-rows-[minmax(0,1fr)]">
        {/* 档案卡主视图：在作品诊断打开时仅视觉隐藏（保住内部滚动条位置与图表状态），绝不卸载 DOM */}
        <div className={cn("flex flex-col min-h-0 [grid-area:1/1]", diagnosisDetail && "invisible pointer-events-none")}>
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
                onHoverWork={setHoveredWork}
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
          <div className="flex flex-col min-h-0 [grid-area:1/1]">
            <ContentDetailDialog
              open={true}
              onOpenChange={(open) => {
                if (!open) onCloseDiagnosis?.();
              }}
              renderMode="inline"
              video={diagnosisDetail.video}
              snapshot={diagnosisDetail.snapshot}
              topicKind={diagnosisDetail.topicKind ?? null}
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
