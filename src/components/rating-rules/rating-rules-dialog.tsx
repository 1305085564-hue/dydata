"use client";

import * as React from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BREAKOUT_GRADE_THRESHOLDS,
  BREAKOUT_GRADE_TEXT_CLASS,
  KPI_PLAY_FLOOR,
  KPI_PLAY_GOOD,
  KPI_PLAY_EXCELLENT,
  breakoutTargetsFor,
} from "@/lib/breakout-rating";
import {
  DEFAULT_EVALUATION_STANDARDS,
  type EvaluationMetric,
  type EvaluationStandards,
} from "@/lib/evaluation-standards";
import { cn } from "@/lib/utils";

function formatPercentRate(rate: number): string {
  const percent = rate * 100;
  return (Number.isInteger(percent) ? String(percent) : String(Number(percent.toFixed(2)))) + "%";
}

function formatPlayWan(count: number): string {
  const wan = count / 10000;
  return (Number.isInteger(wan) ? String(wan) : String(Number(wan.toFixed(1)))) + " 万";
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

export interface RatingRulesContentProps {
  className?: string;
  evaluationStandards?: EvaluationStandards;
}

export function RatingRulesContent({ className, evaluationStandards }: RatingRulesContentProps) {
  const standards = evaluationStandards ?? DEFAULT_EVALUATION_STANDARDS;
  const dryTargets = breakoutTargetsFor("dry_goods", standards);
  const reviewTargets = breakoutTargetsFor("review", standards);
  const retentionWeight = (key: keyof EvaluationStandards["retentionWeights"]) =>
    formatNumber(standards.retentionWeights[key]) + "%";
  const retentionBand = (key: EvaluationMetric, unit: string) => {
    const band = standards[key];
    return "好 " + formatNumber(band.good) + unit + "，差 " + formatNumber(band.poor) + unit;
  };

  return (
    <div className={cn("flex flex-col min-h-0", className)}>
      <header className="pb-4 shrink-0 border-b border-[#E2E2DF]/60 text-left">
        <h2 className="font-normal text-[20px] text-[#141413] tracking-tight">作品评级怎么看</h2>
        <p className="text-[13px] text-[#78716C] mt-1.5 font-normal leading-[1.6]">
          每篇作品发布后，系统会自动评级。页面分开看互动数据、主要指标和留存数据；转粉率继续作为业绩参考，不参与作品评级。
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto space-y-6 pt-5 pb-2 text-[13px] leading-[1.6] text-[#1F1E1D] pr-1">
        <section className="space-y-3">
          <h3 className="font-normal text-[14px] text-[#141413] tracking-tight">一、三类数据分别看什么</h3>
          <div className="overflow-x-auto rounded-lg border border-[#E2E2DF]/80 bg-[#FCFCFB]">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#E2E2DF] bg-[#F7F7F6] text-[#78716C]">
                  <th className="py-2 px-3 font-medium w-[120px]">数据</th>
                  <th className="py-2 px-3 font-medium">计算方式</th>
                  <th className="py-2 px-3 font-medium text-right">作品评级中的作用</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E2DF]/60 text-[#1F1E1D]">
                <tr>
                  <td className="py-2.5 px-3 font-normal">互动数据</td>
                  <td className="py-2.5 px-3">（点赞 + 评论 + 收藏 + 分享）÷ 播放量</td>
                  <td className="py-2.5 px-3 text-right">单独展示</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-normal">主要指标</td>
                  <td className="py-2.5 px-3">干货看收藏率；复盘及其他看点赞率</td>
                  <td className="py-2.5 px-3 text-right">单独展示</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-normal">留存数据</td>
                  <td className="py-2.5 px-3">2 秒跳出、5 秒完播、均播时长、平均播放占比、整体完播</td>
                  <td className="py-2.5 px-3 text-right">用于作品评级</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-[#78716C]">
            主要指标按话题选择：干货是收藏率，复盘及其他是点赞率。没有话题分类时，主要指标暂不评级；留存数据仍按实际快照计算。
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="font-normal text-[14px] text-[#141413] tracking-tight">二、留存数据如何合成</h3>
          <div className="overflow-x-auto rounded-lg border border-[#E2E2DF]/80 bg-[#FCFCFB]">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#E2E2DF] bg-[#F7F7F6] text-[#78716C]">
                  <th className="py-2 px-3 font-medium">留存指标</th>
                  <th className="py-2 px-3 font-medium">当前标准</th>
                  <th className="py-2 px-3 font-medium text-right">权重</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E2DF]/60 text-[#1F1E1D]">
                <tr>
                  <td className="py-2.5 px-3">2 秒跳出率</td>
                  <td className="py-2.5 px-3">{retentionBand("bounceRate2s", "%")}（越低越好）</td>
                  <td className="py-2.5 px-3 text-right">{retentionWeight("bounceRate2s")}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3">5 秒完播率</td>
                  <td className="py-2.5 px-3">{retentionBand("completionRate5s", "%")}</td>
                  <td className="py-2.5 px-3 text-right">{retentionWeight("completionRate5s")}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3">均播时长 + 平均播放占比</td>
                  <td className="py-2.5 px-3">
                    均播时长{retentionBand("avgPlayDuration", " 秒")}；平均播放占比{retentionBand("avgPlayRatio", "%")}，两项各占组合项一半
                  </td>
                  <td className="py-2.5 px-3 text-right">{retentionWeight("avgPlayBundle")}</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3">整体完播率</td>
                  <td className="py-2.5 px-3">{retentionBand("completionRate", "%")}</td>
                  <td className="py-2.5 px-3 text-right">{retentionWeight("completionRate")}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-[#78716C]">
            每项好线对应 100 分、差线对应 0 分，中间按表现线性换算，超出区间按 0 或 100 分计，再按右侧权重合成留存数据分。五项留存值缺一项时，不生成留存分和作品评级。权重可在“数据口径 → 评价标准”中由负责人调整，合计必须为 100%。
          </p>
        </section>

        <section className="space-y-3">
          <h3 className="font-normal text-[14px] text-[#141413] tracking-tight">三、作品等级如何确定</h3>
          <ol className="list-decimal list-outside pl-5 space-y-2 text-[13px] text-[#1F1E1D]">
            <li>播放量低于 {KPI_PLAY_FLOOR.toLocaleString()}，直接记为劣。</li>
            <li>{KPI_PLAY_FLOOR.toLocaleString()} 至不足 {formatPlayWan(KPI_PLAY_GOOD)}，最高记为普；达到 {formatPlayWan(KPI_PLAY_EXCELLENT)} 以上不再受播放量上限影响。</li>
            <li>留存数据分按 {BREAKOUT_GRADE_THRESHOLDS.excellent}、{BREAKOUT_GRADE_THRESHOLDS.good}、{BREAKOUT_GRADE_THRESHOLDS.fair} 分为优、良、普、劣。</li>
            <li>没有完整快照数据时，页面显示待处理状态，不用其他数据代替。</li>
          </ol>
        </section>

        <section className="space-y-3 pb-2">
          <h3 className="font-normal text-[14px] text-[#141413] tracking-tight">四、主要指标标准</h3>
          <p className="text-[13px] text-[#1F1E1D]">
            复盘主要指标线 {formatPercentRate(reviewTargets.fourth)}，干货主要指标线 {formatPercentRate(dryTargets.fourth)}；互动数据线 {formatPercentRate(reviewTargets.interaction)}。这些数据用于解释作品表现，转粉率不进入作品评级。
          </p>
          <div className="flex flex-wrap gap-3 text-[12px]">
            {(Object.keys(BREAKOUT_GRADE_TEXT_CLASS) as Array<keyof typeof BREAKOUT_GRADE_TEXT_CLASS>).map((grade) => (
              <span key={grade} className={cn("font-normal", BREAKOUT_GRADE_TEXT_CLASS[grade])}>{grade}</span>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export interface RatingRulesDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactElement;
  evaluationStandards?: EvaluationStandards;
}

export function RatingRulesDialog({ open, onOpenChange, trigger, evaluationStandards }: RatingRulesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent className="sm:max-w-2xl md:max-w-3xl max-h-[88vh] flex flex-col p-5 sm:p-7 gap-0">
        <DialogTitle className="sr-only">作品评级怎么看</DialogTitle>
        <RatingRulesContent evaluationStandards={evaluationStandards} />
      </DialogContent>
    </Dialog>
  );
}
