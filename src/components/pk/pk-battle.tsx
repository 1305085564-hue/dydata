"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MotionCard } from "@/components/ui/motion-card";
import { containerVariants, itemVariants } from "@/lib/animations";
import { calcRates, parsePercentText, type CalculatedRates } from "@/lib/metrics";

export type PKBattleDimensionKey =
  | "likeRate"
  | "commentRate"
  | "shareRate"
  | "saveRate"
  | "followerRate"
  | "completionRate"
  | "completionRate5s"
  | "bounceRate2s";

export type PKBattleCompetitor = {
  id: string;
  name: string;
  label?: string;
  play_count?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  favorites?: number | null;
  follower_gain?: number | null;
  completion_rate?: string | number | null;
  completion_rate_5s?: string | number | null;
  bounce_rate_2s?: string | number | null;
  rates?: Partial<CalculatedRates>;
  likeRate?: number | null;
  commentRate?: number | null;
  shareRate?: number | null;
  saveRate?: number | null;
  followerRate?: number | null;
  completionRate?: number | null;
  completionRate5s?: number | null;
  bounceRate2s?: number | null;
};

function safeValue(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function resolveMetric(player: PKBattleCompetitor, key: PKBattleDimensionKey) {
  const rates = calcRates(player);
  switch (key) {
    case "likeRate":
      return safeValue(player.likeRate ?? rates.likeRate);
    case "commentRate":
      return safeValue(player.commentRate ?? rates.commentRate);
    case "shareRate":
      return safeValue(player.shareRate ?? rates.shareRate);
    case "saveRate":
      return safeValue(player.saveRate ?? rates.saveRate);
    case "followerRate":
      return safeValue(player.followerRate ?? rates.followerRate);
    case "completionRate":
      return safeValue(player.completionRate ?? parsePercentText(player.completion_rate));
    case "completionRate5s":
      return safeValue(player.completionRate5s ?? parsePercentText(player.completion_rate_5s));
    case "bounceRate2s":
      return safeValue(player.bounceRate2s ?? parsePercentText(player.bounce_rate_2s));
  }
}

const labels: Record<PKBattleDimensionKey, string> = {
  likeRate: "点赞率",
  commentRate: "评论率",
  shareRate: "分享率",
  saveRate: "收藏率",
  followerRate: "涨粉率",
  completionRate: "完播率",
  completionRate5s: "5秒完播率",
  bounceRate2s: "2秒跳出率",
};

function formatMetric(value: number) {
  return `${value.toFixed(1)}%`;
}

function GapBar({ leftRatio, rightRatio, leftLeads }: { leftRatio: number; rightRatio: number; leftLeads: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });

  return (
    <div ref={ref} className="flex h-3 w-full overflow-hidden rounded-full bg-[rgba(0,0,0,0.07)]">
      <motion.div
        className="h-full rounded-l-full"
        style={{ backgroundColor: leftLeads ? "#8AA8C7" : "#d1d5db" }}
        initial={{ width: 0 }}
        animate={inView ? { width: `${leftRatio * 100}%` } : { width: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      />
      <div className="flex flex-1 justify-end">
        <motion.div
          className="h-full rounded-r-full"
          style={{ backgroundColor: leftLeads ? "#d1d5db" : "#8AA8C7" }}
          initial={{ width: 0 }}
          animate={inView ? { width: `${rightRatio * 100}%` } : { width: 0 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
        />
      </div>
    </div>
  );
}

function WinBadge({ leftLeads, tied }: { leftLeads: boolean; tied: boolean }) {
  if (tied) return <span className="text-xs text-stone-500">持平</span>;
  return leftLeads ? (
    <span className="rounded-full bg-[#8AA8C7]/10 px-2 py-0.5 text-xs font-medium text-[#8AA8C7]">领先</span>
  ) : (
    <span className="rounded-full bg-[rgba(0,0,0,0.06)] px-2 py-0.5 text-xs font-medium text-stone-500">落后</span>
  );
}

export function PKBattle({
  playerA,
  playerB,
  dimensions,
  className,
}: {
  playerA: PKBattleCompetitor;
  playerB?: PKBattleCompetitor;
  dimensions: PKBattleDimensionKey[];
  className?: string;
  mode?: string;
  teamAvg?: PKBattleCompetitor;
}) {
  if (!playerB) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>PK 对比</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">当前缺少对手数据。</CardContent>
      </Card>
    );
  }

  const rows = dimensions.map((key) => {
    const left = resolveMetric(playerA, key);
    const right = resolveMetric(playerB, key);
    const max = Math.max(left, right, 1);
    return {
      key,
      label: labels[key],
      left,
      right,
      leftText: formatMetric(left),
      rightText: formatMetric(right),
      leftRatio: left / max,
      rightRatio: right / max,
      leftLeads: left >= right,
      tied: left === right,
    };
  });

  const winCount = rows.filter((row) => row.left > row.right).length;
  const total = rows.length;

  return (
    <MotionCard className={className}>
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.02em] text-stone-800">PK 对比</h2>
            <p className="mt-1 text-sm text-stone-500">
              {playerA.name} vs {playerB.name}
            </p>
          </div>
          {total > 0 && (
            <div className="shrink-0 rounded-full bg-[#8AA8C7]/10 px-3 py-1.5 text-center">
              <div className="text-base font-semibold font-mono tabular-nums text-[#8AA8C7]">{winCount}/{total}</div>
              <div className="text-[12px] text-[#8AA8C7]/70">项领先</div>
            </div>
          )}
        </div>
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px" }}
          className="space-y-3"
        >
          {rows.map((row) => (
            <motion.div
              key={row.key}
              variants={itemVariants}
              className="rounded-xl border border-stone-200 bg-[rgba(255,255,255,0.76)] p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-stone-800">{row.label}</span>
                <WinBadge leftLeads={row.leftLeads} tied={row.tied} />
              </div>
              <GapBar leftRatio={row.leftRatio} rightRatio={row.rightRatio} leftLeads={row.leftLeads} />
              <div className="mt-2 flex justify-between gap-2 text-xs text-stone-500">
                <span className="min-w-0 truncate">
                  <span className="font-medium text-stone-800">{playerA.name}</span>{" "}
                  <span className="font-mono tabular-nums">{row.leftText}</span>
                </span>
                <span className="min-w-0 shrink-0 text-right">
                  <span className="font-mono tabular-nums">{row.rightText}</span>{" "}
                  <span className="font-medium text-stone-800">{playerB.name}</span>
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </MotionCard>
  );
}
