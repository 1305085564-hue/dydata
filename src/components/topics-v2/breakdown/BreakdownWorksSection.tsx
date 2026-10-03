import Link from "next/link";
import { FileText, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { BREAKOUT_GRADE_TEXT_CLASS } from "@/lib/breakout-rating";
import { getContentQualityStatusText } from "@/lib/collaboration/content-quality-contract";
import type { TopicWorkItem, TopicWorksResponse } from "../types";
import { type WorksSort } from "@/lib/topics/domain/work-breakdown";

export function BreakdownWorksSection({
  worksQuery,
  loadWorksPage,
  worksError,
  worksLoading,
  activeWorks,
  worksTotalItems,
  canReviewContent,
}: {
  worksQuery: { page: number; sort: WorksSort };
  loadWorksPage: (page: number, sort: WorksSort) => Promise<void>;
  worksError: string | null;
  worksLoading: boolean;
  activeWorks: TopicWorksResponse | null;
  worksTotalItems: number;
  canReviewContent: boolean;
}) {
  return (
    <>
              {/* 4. 历史关联作品记录 (纯数据展示，不展示原视频封面或播放器) */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <SectionHeading as="h4" className="flex items-center gap-2">
                    <FileText className="size-3.5 text-[#78716C]" />
                    <span>历史关联作品</span>
                  </SectionHeading>
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded-md bg-[#F1F1F0] p-0.5 text-[12px]">
                      {(["best", "recent"] as WorksSort[]).map((sort) => (
                        <button
                          key={sort}
                          type="button"
                          onClick={() => void loadWorksPage(1, sort)}
                          className={`px-2 py-0.5 rounded-md transition-all cursor-pointer min-h-[44px] sm:min-h-0 flex items-center ${
                            worksQuery.sort === sort
                              ? "bg-white text-[#141413] font-normal shadow-input"
                              : "text-[#78716C] hover:text-[#141413]"
                          }`}
                        >
                          {sort === "best" ? "最高播放" : "最新发布"}
                        </button>
                      ))}
                    </div>
                    <span className="text-[12px] text-[#78716C] tabular-nums">
                      共 {worksTotalItems} 条作品
                    </span>
                  </div>
                </div>

                {worksError && (
                  <div className="text-[12px] text-status-danger bg-status-danger/[0.08] rounded-md p-2.5">
                    作品加载失败：{worksError}
                  </div>
                )}

                {worksLoading ? (
                  <div className="py-8 text-center text-[12px] text-[#78716C]">
                    <Loader2 className="size-4 animate-spin mx-auto mb-2" />
                    <span>作品加载中...</span>
                  </div>
                ) : activeWorks?.items && activeWorks.items.length > 0 ? (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {activeWorks.items.map((work: TopicWorkItem) => {
                      const q = work.contentQuality;
                      return (
                        <Card
                          key={work.id}
                          className="p-3 gap-2 hover:shadow-claude-float transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              {canReviewContent ? (
                                <Link
                                  href={`/admin/content?videoId=${work.id}`}
                                  className="text-[13px] font-normal text-[#1F1E1D] hover:text-[#141413] hover:underline line-clamp-1 transition-colors"
                                  title="进入视频复盘"
                                >
                                  {work.videoTitle || work.content || "未命名作品"}
                                </Link>
                              ) : (
                                <div className="text-[13px] font-normal text-[#1F1E1D] line-clamp-1">
                                  {work.videoTitle || work.content || "未命名作品"}
                                </div>
                              )}
                            </div>
                            <span className="text-[12px] font-normal text-[#D97757] tabular-nums shrink-0">
                              {work.playCount !== null
                                ? work.playCount >= 10000
                                  ? `${(work.playCount / 10000).toFixed(1)}万 播放`
                                  : `${work.playCount.toLocaleString()} 播放`
                                : "—"}
                            </span>
                          </div>

                          {q && (
                            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 py-1 px-2 rounded bg-[#F1F1F0]/60 text-[12px]">
                              <div className="flex flex-wrap items-center gap-2 min-w-0">
                                {q.overallGrade ? (
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span
                                      className={`font-normal ${BREAKOUT_GRADE_TEXT_CLASS[q.overallGrade]}`}
                                      title={
                                        q.contentAchievement !== null
                                          ? `内容达成率 ${Math.round(q.contentAchievement)}%`
                                          : getContentQualityStatusText(q.status)
                                      }
                                    >
                                      综合{q.overallGrade}
                                    </span>
                                    {q.status !== "rated" && (
                                      <span className="text-[12px] text-[#A8A29E]">
                                        ({getContentQualityStatusText(q.status)})
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[#A8A29E] shrink-0">
                                    {getContentQualityStatusText(q.status)}
                                  </span>
                                )}

                                {q.contentAchievement !== null && (
                                  <span className="text-[#1F1E1D] font-normal tabular-nums shrink-0">
                                    内容达成 {Math.round(q.contentAchievement)}%
                                  </span>
                                )}

                                {q.interactionAchievement !== null && (
                                  <span className="text-[#78716C] font-normal tabular-nums shrink-0">
                                    互动 {Math.round(q.interactionAchievement)}%
                                  </span>
                                )}

                                {q.coreAchievement !== null && (
                                  <span className="text-[#78716C] font-normal tabular-nums shrink-0">
                                    {q.coreMetric === "favoriteRate" ? "收藏" : "点赞"}{" "}
                                    {Math.round(q.coreAchievement)}%
                                  </span>
                                )}
                              </div>

                              {canReviewContent && (
                                <Link
                                  href={`/admin/content?videoId=${work.id}`}
                                  className="text-[#78716C] hover:text-[#141413] transition-colors shrink-0 inline-flex items-center gap-0.5 ml-auto text-[12px] cursor-pointer"
                                  title="进入视频复盘"
                                >
                                  复盘 →
                                </Link>
                              )}
                            </div>
                          )}

                          <div className="flex items-center justify-between text-[12px] text-[#78716C]">
                            <span>{work.displayName || "未知作者"}</span>
                            <span>{work.uploadedAt?.slice(0, 10) || "—"}</span>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    variant="compact"
                    title="暂无关联作品"
                    description="暂无团队成员关联此选题发布视频"
                  />
                )}
              </section>
    </>
  );
}
