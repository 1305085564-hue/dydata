"use client";

import * as React from "react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BREAKOUT_TARGETS,
  BREAKOUT_GRADE_THRESHOLDS,
  KPI_PLAY_FLOOR,
  KPI_PLAY_GOOD,
  KPI_PLAY_EXCELLENT,
  MAX_PULL_GRADES,
  BREAKOUT_GRADE_TEXT_CLASS,
} from "@/lib/breakout-rating";
import { cn } from "@/lib/utils";

function formatPercentRate(rate: number): string {
  const percent = rate * 100;
  return `${Number.isInteger(percent) ? percent : Number(percent.toFixed(2))}%`;
}

function formatPlayWan(count: number): string {
  const wan = count / 10000;
  return `${Number.isInteger(wan) ? wan : Number(wan.toFixed(1))} 万`;
}

export interface RatingRulesContentProps {
  className?: string;
}

export function RatingRulesContent({ className }: RatingRulesContentProps) {
  // 从单一真源动态派生，杜绝硬编码
  const dryTargets = BREAKOUT_TARGETS.dry_goods;
  const interactionTargetStr = formatPercentRate(dryTargets.interaction);
  const fourthTargetStr = formatPercentRate(dryTargets.fourth);
  const followerTargetStr = formatPercentRate(dryTargets.follower);

  const goodTargetFourthStr = formatPercentRate(
    dryTargets.fourth * (BREAKOUT_GRADE_THRESHOLDS.good / 100)
  );

  const pullGradeText = MAX_PULL_GRADES === 1 ? "一档" : `${MAX_PULL_GRADES} 档`;

  // 例子计算：两项取平均
  const example1Avg = (140 + BREAKOUT_GRADE_THRESHOLDS.good) / 2;
  const example2Avg = (140 + (BREAKOUT_GRADE_THRESHOLDS.good - 1)) / 2;
  const example3Avg = (120 + 40) / 2;

  return (
    <div className={cn("flex flex-col min-h-0", className)}>
      <header className="pb-4 shrink-0 border-b border-[#E2E2DF]/60 text-left">
        <h2 className="text-[18px] font-medium text-[#141413] tracking-tight">
          作品评级怎么看
        </h2>
        <p className="text-[13px] text-[#78716C] mt-1.5 font-normal leading-[1.6]">
          每篇作品发布后，系统会自动给一个评级。它只看你三个数据（互动率、点赞率/收藏率、转粉率）和播放量。
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto space-y-6 pt-5 pb-2 text-[13px] leading-[1.6] text-[#1F1E1D] pr-1">
        {/* 一、先认识三把尺子 */}
        <section className="space-y-3">
          <h3 className="text-[14px] font-medium text-[#141413] tracking-tight">
            一、先认识三把尺子
          </h3>
          <div className="overflow-x-auto rounded-lg border border-[#E2E2DF]/80 bg-[#FCFCFB]">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#E2E2DF] bg-[#F7F7F6] text-[#78716C]">
                  <th className="py-2 px-3 font-normal w-[120px]">看什么</th>
                  <th className="py-2 px-3 font-normal">怎么算</th>
                  <th className="py-2 px-3 font-normal text-right w-[80px]">达标线</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E2DF]/60 text-[#1F1E1D]">
                <tr>
                  <td className="py-2.5 px-3 font-normal">互动率</td>
                  <td className="py-2.5 px-3">（点赞+评论+收藏+分享）÷ 播放量</td>
                  <td className="py-2.5 px-3 text-right font-normal tabular-nums">
                    {interactionTargetStr}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-normal">点赞率 / 收藏率</td>
                  <td className="py-2.5 px-3">复盘看点赞率，干货看收藏率，都是 ÷ 播放量</td>
                  <td className="py-2.5 px-3 text-right font-normal tabular-nums">
                    {fourthTargetStr}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-normal">转粉率</td>
                  <td className="py-2.5 px-3">涨粉 ÷ 播放量</td>
                  <td className="py-2.5 px-3 text-right font-normal tabular-nums">
                    {followerTargetStr}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="rounded-md bg-[#F7F7F6] border-l-2 border-[#D97757]/60 px-3 py-2 text-[12px] text-[#78716C]">
            没打标签的内容，按复盘口径看点赞率。
          </div>
        </section>

        {/* 二、单项标签：看你离达标线有多远 */}
        <section className="space-y-3">
          <h3 className="text-[14px] font-medium text-[#141413] tracking-tight">
            二、单项标签：看你离达标线有多远
          </h3>
          <div className="overflow-x-auto rounded-lg border border-[#E2E2DF]/80 bg-[#FCFCFB]">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#E2E2DF] bg-[#F7F7F6] text-[#78716C]">
                  <th className="py-2 px-3 font-normal">距离达标线</th>
                  <th className="py-2 px-3 font-normal text-right w-[60px]">标签</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E2DF]/60 text-[#1F1E1D]">
                <tr>
                  <td className="py-2.5 px-3">达到或超过</td>
                  <td className={cn("py-2.5 px-3 text-right font-normal", BREAKOUT_GRADE_TEXT_CLASS["优"])}>
                    优
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3">达到 {BREAKOUT_GRADE_THRESHOLDS.good}%</td>
                  <td className={cn("py-2.5 px-3 text-right font-normal", BREAKOUT_GRADE_TEXT_CLASS["良"])}>
                    良
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3">达到 {BREAKOUT_GRADE_THRESHOLDS.fair}%</td>
                  <td className={cn("py-2.5 px-3 text-right font-normal", BREAKOUT_GRADE_TEXT_CLASS["普"])}>
                    普
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3">不到 {BREAKOUT_GRADE_THRESHOLDS.fair}%</td>
                  <td className={cn("py-2.5 px-3 text-right font-normal", BREAKOUT_GRADE_TEXT_CLASS["劣"])}>
                    劣
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[13px] text-[#1F1E1D] leading-[1.6]">
            达标线 {fourthTargetStr}，你做到 {fourthTargetStr} 是优；做到 {goodTargetFourthStr}（正好 {BREAKOUT_GRADE_THRESHOLDS.good}%）是良。三个指标各给一个标签，互不影响。
          </p>
          <p className="text-[12px] text-[#78716C]">
            话题还没识别的作品，暂时不出评级。
          </p>
        </section>

        {/* 三、总评：整篇只有一个，只看互动率 + 点赞率/收藏率 */}
        <section className="space-y-3">
          <h3 className="text-[14px] font-medium text-[#141413] tracking-tight">
            三、总评：整篇只有一个，只看互动率 + 点赞率/收藏率
          </h3>
          <ol className="list-decimal list-outside pl-5 space-y-2 text-[13px] text-[#1F1E1D]">
            <li>
              播放量太低，直接判劣 —— 不到 {KPI_PLAY_FLOOR.toLocaleString()}，别的数据再好也是劣。
            </li>
            <li>
              播放量决定最高能到哪 —— {KPI_PLAY_FLOOR.toLocaleString()} ~ {formatPlayWan(KPI_PLAY_GOOD)}最高只能到普；{formatPlayWan(KPI_PLAY_EXCELLENT)}以上不设上限。
            </li>
            <li>
              两项取平均定基础分 —— 平均后的距离按 {BREAKOUT_GRADE_THRESHOLDS.excellent}% / {BREAKOUT_GRADE_THRESHOLDS.good}% / {BREAKOUT_GRADE_THRESHOLDS.fair}% 分档。
            </li>
            <li>
              不认偏科 —— 差的那一项最多被拉高{pullGradeText}：
              <div className="mt-1.5 rounded-md bg-[#F7F7F6] border-l-2 border-[#D97757]/60 px-3 py-2 text-[12px] text-[#1F1E1D] space-y-1">
                <p>想拿优：互动率和点赞率/收藏率都要达到良（{BREAKOUT_GRADE_THRESHOLDS.good}%）以上</p>
                <p>想拿良：两项都要达到普（{BREAKOUT_GRADE_THRESHOLDS.fair}%）以上</p>
              </div>
            </li>
            <li>
              播放天花板和成绩，取更低的那个。
            </li>
          </ol>
        </section>

        {/* 四、看几个例子（播放都在 1.5 万以上） */}
        <section className="space-y-3">
          <h3 className="text-[14px] font-medium text-[#141413] tracking-tight">
            四、看几个例子（播放都在 {formatPlayWan(KPI_PLAY_EXCELLENT)}以上）
          </h3>
          <div className="overflow-x-auto rounded-lg border border-[#E2E2DF]/80 bg-[#FCFCFB]">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#E2E2DF] bg-[#F7F7F6] text-[#78716C]">
                  <th className="py-2 px-3 font-normal">互动率</th>
                  <th className="py-2 px-3 font-normal">点赞/收藏率</th>
                  <th className="py-2 px-3 font-normal">平均</th>
                  <th className="py-2 px-3 font-normal">总评</th>
                  <th className="py-2 px-3 font-normal">为什么</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E2DF]/60 text-[#1F1E1D]">
                <tr>
                  <td className="py-2.5 px-3 tabular-nums">
                    140% <span className={BREAKOUT_GRADE_TEXT_CLASS["优"]}>优</span>
                  </td>
                  <td className="py-2.5 px-3 tabular-nums">
                    {BREAKOUT_GRADE_THRESHOLDS.good}% <span className={BREAKOUT_GRADE_TEXT_CLASS["良"]}>良</span>
                  </td>
                  <td className="py-2.5 px-3 tabular-nums">{example1Avg}%</td>
                  <td className={cn("py-2.5 px-3 font-normal", BREAKOUT_GRADE_TEXT_CLASS["优"])}>
                    优
                  </td>
                  <td className="py-2.5 px-3 text-[#78716C]">差项是良，能被拉一档</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 tabular-nums">
                    140% <span className={BREAKOUT_GRADE_TEXT_CLASS["优"]}>优</span>
                  </td>
                  <td className="py-2.5 px-3 tabular-nums">
                    {BREAKOUT_GRADE_THRESHOLDS.good - 1}% <span className={BREAKOUT_GRADE_TEXT_CLASS["普"]}>普</span>
                  </td>
                  <td className="py-2.5 px-3 tabular-nums">{example2Avg}%</td>
                  <td className={cn("py-2.5 px-3 font-normal", BREAKOUT_GRADE_TEXT_CLASS["良"])}>
                    良
                  </td>
                  <td className="py-2.5 px-3 text-[#78716C]">差项只有普，最多拉到良</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 tabular-nums">
                    120% <span className={BREAKOUT_GRADE_TEXT_CLASS["优"]}>优</span>
                  </td>
                  <td className="py-2.5 px-3 tabular-nums">
                    40% <span className={BREAKOUT_GRADE_TEXT_CLASS["劣"]}>劣</span>
                  </td>
                  <td className="py-2.5 px-3 tabular-nums">{example3Avg}%</td>
                  <td className={cn("py-2.5 px-3 font-normal", BREAKOUT_GRADE_TEXT_CLASS["普"])}>
                    普
                  </td>
                  <td className="py-2.5 px-3 text-[#78716C]">差项是劣，最多拉到普</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* 五、想拿优，记住三条 */}
        <section className="space-y-3 pb-2">
          <h3 className="text-[14px] font-medium text-[#141413] tracking-tight">
            五、想拿优，记住三条
          </h3>
          <ol className="list-decimal list-outside pl-5 space-y-1.5 text-[13px] text-[#1F1E1D]">
            <li>播放量 ≥ {formatPlayWan(KPI_PLAY_EXCELLENT)}</li>
            <li>互动率 ≥ {interactionTargetStr}</li>
            <li>点赞率或收藏率 ≥ {fourthTargetStr}</li>
          </ol>
          <p className="text-[12px] text-[#78716C] pt-1">
            三条全中才是优，任何一条差一点就往下掉一档。
          </p>
        </section>
      </div>
    </div>
  );
}

export interface RatingRulesDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactElement;
}

export function RatingRulesDialog({
  open,
  onOpenChange,
  trigger,
}: RatingRulesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent className="sm:max-w-xl md:max-w-2xl max-h-[88vh] flex flex-col p-5 sm:p-7 gap-0">
        <DialogTitle className="sr-only">作品评级怎么看</DialogTitle>
        <RatingRulesContent />
      </DialogContent>
    </Dialog>
  );
}
