"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ItemHeading } from "@/components/ui/item-heading";
import type { CollaborationDiagnosisContextValue } from "@/components/admin/collaboration-work-review-link";
import { CollaborationWorkReviewLink } from "@/components/admin/collaboration-work-review-link";
import type { CollaborationRoleTab, PersonDetailData } from "./types";
import { formatBigNumber } from "./types";
import { formatAnomalyStatusText } from "@/lib/video-anomaly";
import { BREAKOUT_GRADE_TEXT_CLASS } from "@/lib/breakout-rating";
import { getContentQualityStatusText } from "@/lib/collaboration/content-quality-contract";

interface PersonalCardWorksProps {
  data: PersonDetailData;
  activeTab?: CollaborationRoleTab;
  diagnosisContext: CollaborationDiagnosisContextValue | null;
}

export function PersonalCardWorks({ data, activeTab, diagnosisContext }: PersonalCardWorksProps) {
  return (
    <>
              {/* 3. 本月文案作品 / 经手作品明细 */}
              {activeTab === "writers" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <ItemHeading as="h4">
                      本月文案作品
                    </ItemHeading>
                    <span className="text-[12px] text-[#78716C] tabular-nums">
                      共 {data.writerQuality?.monthWorks?.length ?? 0} 篇作品
                    </span>
                  </div>

                  {!data.writerQuality ? (
                    <div className="rounded-xl bg-[#F1F1F0]/40 border border-[#E2E2DF]/60 p-6 text-center text-[12px] text-[#78716C]">
                      质量数据尚未接入
                    </div>
                  ) : data.writerQuality.state === "error" ? (
                    <div className="rounded-xl bg-[#F1F1F0]/40 border border-[#E2E2DF]/60 p-6 text-center text-[12px] text-[#C0685C]">
                      文案作品明细加载异常，请稍后重试
                    </div>
                  ) : data.writerQuality.monthWorks.length === 0 ? (
                    <div className="rounded-xl bg-[#F1F1F0]/40 border border-[#E2E2DF]/60 p-6 text-center text-[12px] text-[#78716C]">
                      本月暂无文案作品记录
                    </div>
                  ) : (
                    <Card className="overflow-x-auto p-0 gap-0">
                      <table className="w-full text-[12px] min-w-[560px] table-fixed">
                        <thead className="bg-transparent border-b border-[#E2E2DF]/60 text-[13px] font-normal text-[#78716C] text-left">
                          <tr>
                            <th className="py-2.5 px-3 w-[84px] shrink-0 font-normal">日期</th>
                            <th className="py-2.5 px-3 w-auto min-w-[160px] font-normal">账号 / 作品标题</th>
                            <th className="py-2.5 px-2.5 text-right w-[72px] shrink-0 font-normal">播放量</th>
                            <th className="py-2.5 px-2.5 text-center w-[110px] shrink-0 font-normal">话题 / 核心指标</th>
                            <th className="py-2.5 px-2.5 text-right w-[140px] shrink-0 font-normal">达成率表现</th>
                            <th className="py-2.5 px-3 text-right w-[80px] shrink-0 font-normal">综合评级</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E2DF]/60">
                          {data.writerQuality.monthWorks.map((work) => {
                            const q = work.contentQuality;
                            const topicText =
                              q?.topicKind === "dry_goods"
                                ? "干货 · 收藏"
                                : q?.topicKind === "review"
                                  ? "复盘 · 点赞"
                                  : q?.topicKind === "other"
                                    ? "其他 · 点赞"
                                    : "未识别话题";

                            return (
                              <tr
                                key={work.reportId}
                                onClick={() => {
                                  if (work.reportId && diagnosisContext) {
                                    void diagnosisContext.openDiagnosisByReportId(work.reportId);
                                  }
                                }}
                                className="hover:bg-[#EBEBE9]/80 transition-colors cursor-pointer group"
                              >
                                <td className="py-2 px-3 text-[#78716C] tabular-nums whitespace-nowrap">
                                  {work.reportDate}
                                </td>
                                <td className="py-2 px-3 min-w-0">
                                  <div className="font-normal text-[#1F1E1D] truncate" title={work.accountName}>
                                    {work.accountName}
                                  </div>
                                  <div className="flex min-w-0 items-center gap-1">
                                    <CollaborationWorkReviewLink
                                      reportId={work.reportId}
                                      preview={{
                                        title: work.title,
                                        accountName: work.accountName,
                                        playCount: work.playCount,
                                        reportDate: work.reportDate,
                                        dataSource: work.dataSource,
                                      }}
                                      className="min-w-0 truncate text-left text-[12px] text-[#78716C] group-hover:text-[#141413] group-hover:underline disabled:cursor-wait disabled:opacity-60 block"
                                    >
                                      {work.title || "未命名作品"}
                                    </CollaborationWorkReviewLink>
                                    {work.dataSource === "manual" ? (
                                      <Badge title="该数据由人工填写或修改">手工</Badge>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="py-2 px-2.5 text-right tabular-nums text-[#1F1E1D] font-normal whitespace-nowrap">
                                  {formatBigNumber(work.playCount)}
                                </td>
                                <td className="py-2 px-2.5 text-center whitespace-nowrap">
                                  <span className="inline-block rounded-md bg-[#F1F1F0] px-1.5 py-0.5 text-[12px] font-normal text-[#1F1E1D]">
                                    {topicText}
                                  </span>
                                </td>
                                <td className="py-2 px-2.5 text-right whitespace-nowrap tabular-nums">
                                  {q?.status === "rated" && q.contentAchievement != null ? (
                                    <div>
                                      <span className="font-normal text-[#141413]">
                                        {Math.round(q.contentAchievement)}%
                                      </span>
                                      {q.contentGrade && (
                                        <span className={`ml-1 font-normal ${BREAKOUT_GRADE_TEXT_CLASS[q.contentGrade]}`}>
                                          ({q.contentGrade})
                                        </span>
                                      )}
                                      <div className="text-[12px] text-[#78716C]">
                                        互动 {q.interactionAchievement != null ? `${Math.round(q.interactionAchievement)}%` : "—"} · 核心 {q.coreAchievement != null ? `${Math.round(q.coreAchievement)}%` : "—"}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="rounded bg-[#F1F1F0] px-1.5 py-0.5 text-[12px] text-[#A8A29E] border border-[#E2E2DF]">
                                      {getContentQualityStatusText(q?.status ?? "pending_snapshot")}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right whitespace-nowrap">
                                  {q?.overallGrade ? (
                                    <span className={`font-normal ${BREAKOUT_GRADE_TEXT_CLASS[q.overallGrade]}`}>
                                      综合{q.overallGrade}
                                    </span>
                                  ) : (
                                    <span className="text-[#A8A29E]">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </Card>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <ItemHeading as="h4">
                      本月经手作品明细
                    </ItemHeading>
                    <span className="text-[12px] text-[#78716C] tabular-nums">
                      共 {data.records.length} 条作品
                    </span>
                  </div>

                  {data.records.length === 0 ? (
                    <div className="rounded-xl bg-[#F1F1F0]/40 border border-[#E2E2DF]/60 p-6 text-center text-[12px] text-[#78716C]">
                      本月暂无协同作品记录
                    </div>
                  ) : (
                    <Card className="overflow-x-auto p-0 gap-0">
                      <table className="w-full text-[12px] min-w-[520px] table-fixed">
                        <thead className="bg-transparent border-b border-[#E2E2DF]/60 text-[13px] font-normal text-[#78716C] text-left">
                          <tr>
                            <th className="py-2.5 px-3 w-[84px] shrink-0 font-normal">日期</th>
                            <th className="py-2.5 px-3 w-auto min-w-[160px] font-normal">账号 / 作品标题</th>
                            <th className="py-2.5 px-2.5 text-right w-[72px] shrink-0 font-normal">播放量</th>
                            <th className="py-2.5 px-2.5 text-center w-[100px] shrink-0 font-normal">担任岗位</th>
                            <th className="py-2.5 px-3 text-right w-[64px] shrink-0 font-normal">状态</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E2E2DF]/60">
                          {data.records.map((rec) => (
                            <tr
                              key={rec.reportId}
                              onClick={() => {
                                if (rec.reportId && diagnosisContext) {
                                  void diagnosisContext.openDiagnosisByReportId(rec.reportId);
                                }
                              }}
                              className="hover:bg-[#EBEBE9]/80 transition-colors cursor-pointer group"
                            >
                              <td className="py-2 px-3 text-[#78716C] tabular-nums whitespace-nowrap">
                                {rec.reportDate}
                              </td>
                              <td className="py-2 px-3 min-w-0">
                                <div className="font-normal text-[#1F1E1D] truncate" title={rec.accountName}>
                                  {rec.accountName}
                                </div>
                                <div className="flex min-w-0 items-center gap-1">
                                  <CollaborationWorkReviewLink
                                    reportId={rec.reportId}
                                    preview={{
                                      title: rec.title,
                                      accountName: rec.accountName,
                                      playCount: rec.playCount,
                                      reportDate: rec.reportDate,
                                      dataSource: rec.dataSource,
                                    }}
                                    className="min-w-0 truncate text-left text-[12px] text-[#78716C] group-hover:text-[#141413] group-hover:underline disabled:cursor-wait disabled:opacity-60 block"
                                  >
                                    {rec.title || "未命名作品"}
                                  </CollaborationWorkReviewLink>
                                  {rec.dataSource === "manual" ? (
                                    <Badge title="该数据由人工填写或修改">手工</Badge>
                                  ) : null}
                                </div>
                              </td>
                              <td className="py-2 px-2.5 text-right tabular-nums text-[#1F1E1D] font-normal whitespace-nowrap">
                                {formatBigNumber(rec.playCount)}
                              </td>
                              <td className="py-2 px-2.5 text-center whitespace-nowrap">
                                <span className="inline-block rounded-md bg-[#F1F1F0] px-1.5 text-[12px] font-normal text-[#1F1E1D]">
                                  {rec.roles.map((r) => (r === "writer" ? "文案" : r === "editor" ? "剪辑" : "运营")).join(" · ")}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right whitespace-nowrap">
                                {rec.anomaly == null ||
                                rec.anomaly === "正常" ||
                                rec.anomaly === "normal" ? (
                                  <span className="text-[#A8A29E]">—</span>
                                ) : (
                                  <Badge
                                    variant="secondary"
                                    className="text-[12px] bg-[#F1F1F0] text-[#1F1E1D] px-1.5 py-0"
                                  >
                                    {formatAnomalyStatusText(rec.anomaly)}
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Card>
                  )}
                </div>
              )}


    </>
  );
}
