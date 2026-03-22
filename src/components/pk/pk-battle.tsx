"use client";

import { motion } from "framer-motion";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MotionCard } from "@/components/ui/motion-card";
import { barVariants, containerVariants, itemVariants } from "@/lib/animations";
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

export function PKBattle({ playerA, playerB, dimensions, className }: { playerA: PKBattleCompetitor; playerB?: PKBattleCompetitor; dimensions: PKBattleDimensionKey[]; className?: string; mode?: string; teamAvg?: PKBattleCompetitor; }) {
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
    const gap = (Math.abs(left - right) / max) * 100;
    return {
      key,
      label: labels[key],
      left,
      right,
      leftText: formatMetric(left),
      rightText: formatMetric(right),
      leftWidth: `${(left / max) * 100}%`,
      rightWidth: `${(right / max) * 100}%`,
      isDanger: gap > 30,
      insight: left >= right ? `${playerA.name} 在${labels[key]}上领先 ${gap.toFixed(1)}%。` : `${playerA.name} 在${labels[key]}上落后 ${gap.toFixed(1)}%。`,
    };
  });

  return (
    <MotionCard className={className}>
      <div className="space-y-4 p-5">
        <div>
          <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">PK 对比</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">左右对比关键维度，中间差距条从 0 动画到实际值。</p>
        </div>
        <motion.div variants={containerVariants} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-40px" }} className="space-y-3">
          {rows.map((row) => (
            <motion.div key={row.key} variants={itemVariants} className="rounded-[12px] border border-[var(--color-border)] bg-[rgba(255,255,255,0.76)] p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_minmax(0,1fr)] md:items-center">
                <div className="rounded-xl bg-[rgba(255,255,255,0.75)] px-3 py-2 text-center md:bg-transparent md:px-0 md:py-0 md:text-right">
                  <div className="text-xs text-[var(--color-text-secondary)]">{playerA.name}</div>
                  <div className="mt-1 text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">{row.leftText}</div>
                </div>
                <div className="space-y-2">
                  <div className="text-center text-sm font-semibold text-[var(--color-text-primary)]">{row.label} · VS</div>
                  <div className="relative h-3 overflow-hidden rounded-full bg-[rgba(0,0,0,0.08)]">
                    <motion.div variants={barVariants} initial="hidden" animate="visible" className={`absolute left-0 top-0 h-full rounded-full ${row.isDanger ? "bg-[var(--color-danger)]" : "bg-[var(--color-primary)]"}`} style={{ width: row.leftWidth }} />
                    <motion.div variants={barVariants} initial="hidden" animate="visible" className="absolute right-0 top-0 h-full rounded-full bg-[var(--color-text-secondary)]/45" style={{ width: row.rightWidth }} />
                  </div>
                </div>
                <div className="rounded-xl bg-[rgba(255,255,255,0.75)] px-3 py-2 text-center md:bg-transparent md:px-0 md:py-0 md:text-left">
                  <div className="text-xs text-[var(--color-text-secondary)]">{playerB.name}</div>
                  <div className="mt-1 text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">{row.rightText}</div>
                </div>
              </div>
              <p className={`mt-3 text-sm leading-6 ${row.isDanger ? "text-[var(--color-danger)]" : "text-[var(--color-text-secondary)]"}`}>{row.insight}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </MotionCard>
  );
}

