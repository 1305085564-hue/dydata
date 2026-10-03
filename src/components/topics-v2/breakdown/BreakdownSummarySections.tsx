import type {
  TopicClaimsDetailResponse,
  SubTopicItem,
} from "../types";
import {
  Flame,
  FileText,
  Globe2,
  Building2,
  Trophy,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ListRow } from "@/components/ui/list-row";
import { Metric } from "@/components/ui/metric";
import { SectionHeading } from "@/components/ui/section-heading";

export function BreakdownSummarySections({
  subTopicInfo,
  bestPlay,
  avgPlay,
  qualifiedCount,
  worksTotalItems,
  total7dParticipants,
  completed7dCount,
  inProgress7dCount,
  claimsError,
  claimsData,
}: {
  subTopicInfo: SubTopicItem | null;
  bestPlay: number | null;
  avgPlay: number | null;
  qualifiedCount: number | null;
  worksTotalItems: number;
  total7dParticipants: number | null;
  completed7dCount: number | null;
  inProgress7dCount: number | null;
  claimsError: string | null;
  claimsData: TopicClaimsDetailResponse | null;
}) {
  return (
    <>
              {/* 1. 一句话 Hook & 内容提纲 */}
              {(subTopicInfo?.hook || subTopicInfo?.outline) && (
                <section className="space-y-3">
                  {subTopicInfo?.hook && (
                    <div className="border-l-2 border-[#D97757]/60 pl-3.5 py-1 bg-gradient-to-r from-[#F1F1F0]/70 to-transparent rounded-r-xl space-y-1">
                      <div className="text-[12px] font-normal text-[#78716C] flex items-center gap-1">
                        <Sparkles className="size-3 text-[#D97757]" />
                        <span>一句话立意 Hook</span>
                      </div>
                      <p className="text-[13px] not-italic text-[#1F1E1D] leading-relaxed">
                        “{subTopicInfo.hook}”
                      </p>
                    </div>
                  )}

                  {subTopicInfo?.outline && (
                    <Card className="p-3.5 space-y-1 gap-0">
                      <div className="text-[12px] font-normal text-[#78716C] flex items-center gap-1">
                        <FileText className="size-3.5 text-[#78716C]" />
                        <span>内容提纲</span>
                      </div>
                      <p className="text-[13px] text-[#1F1E1D] leading-relaxed whitespace-pre-line font-normal">
                        {subTopicInfo.outline}
                      </p>
                    </Card>
                  )}
                </section>
              )}

              {/* 2. 历史数据双轨证明 */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <SectionHeading as="h4" className="flex items-center gap-2">
                    <Trophy className="size-3.5 text-[#D97757]" />
                    <span>历史数据证明</span>
                  </SectionHeading>
                  <span className="text-[12px] text-[#78716C]">
                    真实数据证明 · 严禁主观推测
                  </span>
                </div>

                {/* 团队内部验证表现 */}
                <Card className="p-4 gap-3">
                  <div className="flex items-center justify-between text-[12px] border-b border-[#E2E2DF]/60 pb-2">
                    <span className="font-normal text-[#1F1E1D] flex items-center gap-1">
                      <Building2 className="size-3.5 text-status-info" />
                      <span>团队内部实测成绩</span>
                    </span>
                    <span className="text-status-success font-normal">
                      达标优质作品{" "}
                      {qualifiedCount !== null
                        ? qualifiedCount > 0
                          ? `${qualifiedCount} 条`
                          : worksTotalItems === 0
                            ? "尚无作品"
                            : "暂未达标"
                        : "—"}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <Metric
                      label="最高播放"
                      value={
                        bestPlay !== null
                          ? bestPlay >= 10000
                            ? `${(bestPlay / 10000).toFixed(1)}万`
                            : bestPlay.toLocaleString()
                          : "—"
                      }
                    />
                    <Metric
                      label="平均播放"
                      value={
                        avgPlay !== null
                          ? avgPlay >= 10000
                            ? `${(avgPlay / 10000).toFixed(1)}万`
                            : avgPlay.toLocaleString()
                          : "—"
                      }
                    />
                    <Metric
                      label="优质作品数"
                      value={qualifiedCount !== null ? `${qualifiedCount} 条` : "—"}
                    />
                  </div>
                </Card>

                {/* 外部干货收集基准 (若有外部数据独立展示，绝不混合伪装) */}
                {subTopicInfo?.source_type === "external" && (
                  <div className="rounded-xl border border-status-info/20 bg-status-info/[0.08] p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-[12px] font-normal text-status-info">
                      <span className="flex items-center gap-1">
                        <Globe2 className="size-3.5" />
                        <span>外部干货收集基准</span>
                      </span>
                      <span>已验证爆款</span>
                    </div>
                    <p className="text-[13px] text-[#1F1E1D] font-normal leading-relaxed">
                      该题来源于外部优质干货样本，外部实测播放已达标。团队内完成首条创作后将自动沉淀内部专属数据。
                    </p>
                  </div>
                )}
              </section>

              {/* 3. 近 7 天参与热度 (支持多人同时写，展示进展拆解) */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <SectionHeading as="h4" className="flex items-center gap-2">
                    <Flame className="size-3.5 text-[#D97757]" />
                    <span>近 7 天参与热度</span>
                  </SectionHeading>
                  <span className="text-[12px] text-[#D97757] font-normal tabular-nums">
                    近 7 天 {total7dParticipants !== null ? `${total7dParticipants} 人参与` : "—"}
                  </span>
                </div>

                <Card className="grid grid-cols-2 gap-3 p-3.5 gap-y-0">
                  <div className="border-r border-[#E2E2DF]/60 pr-3">
                    <Metric
                      label="近 7 天已写完"
                      value={
                        completed7dCount !== null ? (
                          <span className="text-status-success">{completed7dCount} 人</span>
                        ) : (
                          "—"
                        )
                      }
                    />
                  </div>
                  <div className="pl-3">
                    <Metric
                      label="近 7 天仍在写"
                      value={
                        inProgress7dCount !== null ? (
                          <span className="text-status-info">{inProgress7dCount} 人</span>
                        ) : (
                          "—"
                        )
                      }
                    />
                  </div>
                </Card>

                {claimsError && (
                  <div className="text-[12px] text-status-danger bg-status-danger/[0.08] rounded-md p-2.5">
                    参与动态加载失败：{claimsError}
                  </div>
                )}

                {claimsData?.claims && claimsData.claims.length > 0 && (
                  <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                    {claimsData.claims.map((claim) => (
                      <ListRow
                        key={claim.id}
                        className="py-1.5 px-3 bg-[#F1F1F0]/50 rounded-md border-b-0"
                      >
                        <span className="font-normal text-[#1F1E1D] text-[12px]">
                          {claim.displayName}
                        </span>
                        <Badge variant="accent">正在写</Badge>
                      </ListRow>
                    ))}
                  </div>
                )}
              </section>
    </>
  );
}
