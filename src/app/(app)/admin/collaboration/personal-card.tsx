"use client";

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { precheckReturnVideo } from "@/lib/collaboration/video-return";
import { useSearchParams } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PersonalCardGrowth } from "./personal-card-growth";
import { PersonalCardWorks } from "./personal-card-works";
import {
  buildGrowthChartData,
  buildGrowthAverages,
  buildPersonHeadline,
  pickHoveredChartWork,
  type ChartWorkPoint,
} from "@/lib/collaboration/domain/person-metrics";
import { type CollaborationRoleTab, type OperatorAccount, type PersonDetailData } from "./types";
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
  /** 本人名下账号：头部「常配账号」排除自营号，只在给别人干活时出现 */
  ownAccountIds?: string[];
  /** 运营负责的账号明细（主表已有，不另取） */
  operatorAccounts?: OperatorAccount[];
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
  ownAccountIds,
  operatorAccounts,
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

  // B2: 检测从复盘跳来的来源视频并做静默有效性预检
  const searchParams = useSearchParams();
  const fromSource = searchParams.get("from");
  const returnVideoId = searchParams.get("videoId");
  const [returnVideoValid, setReturnVideoValid] = useState(false);

  useEffect(() => precheckReturnVideo(Boolean(userId), fromSource, returnVideoId, setReturnVideoValid),
    [userId, fromSource, returnVideoId]);

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
  const headline = useMemo(
    () => (data ? buildPersonHeadline({ data, role: activeTab, month, ownAccountIds }) : ""),
    [data, activeTab, month, ownAccountIds],
  );

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
          "w-full p-0 flex flex-col bg-white border-l border-[#E2E2DF] shadow-claude-dialog transition-[max-width] duration-240 ease-smooth",
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
          {/* 头部：名字 + 一句话结论；右侧只留「打开主页」与关闭 */}
          <SheetHeader className="flex flex-row items-start justify-between gap-3 shrink-0 px-6 pt-5 pb-3">
            {loading ? (
              <div className="flex flex-col gap-1">
                <Skeleton className="h-[26px] w-28 rounded-md" />
                <Skeleton className="h-[18px] w-72 rounded-md" />
              </div>
            ) : error ? (
              <div className="flex flex-col gap-1">
                <SheetTitle>没能打开档案</SheetTitle>
                <SheetDescription className="text-[12px] text-status-danger-text">{error}</SheetDescription>
              </div>
            ) : data ? (
              <div className="flex min-w-0 flex-col gap-1">
                <SheetTitle>{data.name}</SheetTitle>
                <SheetDescription className="text-[12px] leading-[1.50] text-[#78716C] tabular-nums">
                  {headline}
                </SheetDescription>
              </div>
            ) : (
              <SheetTitle className="sr-only">个人档案</SheetTitle>
            )}

            <div className="flex shrink-0 items-center gap-1">
              {fromSource === "video" && returnVideoId && returnVideoValid && (
                <Link
                  href={`/admin/content?videoId=${encodeURIComponent(returnVideoId)}`}
                  className="inline-flex h-7 items-center rounded-md px-2 text-[12px] text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] transition-colors duration-150"
                >
                  返回数据复盘
                </Link>
              )}
              {data && (
                <Link
                  href={`/people/${data.userId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-[#78716C] hover:bg-[#EBEBE9] hover:text-[#141413] transition-colors duration-150"
                >
                  <ExternalLink className="size-3" aria-hidden />
                  打开主页
                </Link>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭档案"
                className="size-7 rounded-md flex items-center justify-center text-[#78716C] hover:text-[#141413] hover:bg-[#EBEBE9] transition-colors duration-150 cursor-pointer"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </SheetHeader>

        {/* 正文：本月作品 → 近 30 天曲线；骨架与真实结构一致，内容出来时不跳 */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-2 pb-6 space-y-5">
          {loading ? (
            <>
              <div className="space-y-2">
                <Skeleton className="h-5 w-16 rounded-md" />
                <div className="rounded-xl shadow-card-ring overflow-hidden">
                  <div className="h-9 border-b border-[#E2E2DF]/60" />
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="flex items-center gap-3 border-b border-[#E2E2DF]/60 px-3 py-2.5 last:border-b-0">
                      <Skeleton className="h-4 w-10 rounded-md" />
                      <div className="flex flex-1 flex-col gap-1">
                        <Skeleton className="h-[18px] w-3/4 rounded-md" />
                        <Skeleton className="h-[18px] w-1/3 rounded-md" />
                      </div>
                      <Skeleton className="h-4 w-48 rounded-md" />
                    </div>
                  ))}
                </div>
              </div>
              <Skeleton className="h-72 w-full rounded-xl" />
            </>
          ) : data ? (
            <>
              <PersonalCardWorks
                data={data}
                activeTab={activeTab}
                operatorAccounts={operatorAccounts}
                diagnosisContext={diagnosisContext}
              />
              <PersonalCardGrowth
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
              contentQuality={diagnosisDetail.contentQuality ?? null}
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
