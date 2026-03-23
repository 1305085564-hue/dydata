"use client";

import { motion } from "framer-motion";

import { MotionCard } from "@/components/ui/motion-card";
import { containerVariants, itemVariants } from "@/lib/animations";
import { calcRates, parsePercentText, type MetricsReport } from "@/lib/metrics";

// ── 维度计算 ────────────────────────────────────────────────
type DimKey = "播放量" | "涨粉" | "点赞" | "完播率" | "5s完播率" | "2s跳出率";

const DIM_LABELS: Record<DimKey, string> = {
  播放量: "播放量",
  涨粉: "涨粉数",
  点赞: "点赞率",
  完播率: "完播率",
  "5s完播率": "5秒完播率",
  "2s跳出率": "2秒跳出率",
};

function avgDim(reports: MetricsReport[], dim: DimKey): number {
  if (!reports.length) return 0;
  const vals = reports.map((r) => {
    switch (dim) {
      case "播放量": return r.play_count ?? 0;
      case "涨粉": return r.follower_gain ?? 0;
      case "点赞": {
        const rates = calcRates(r);
        return rates.likeRate;
      }
      case "完播率": return parsePercentText(r.completion_rate);
      case "5s完播率": return parsePercentText(r.completion_rate_5s);
      case "2s跳出率": return parsePercentText((r as MetricsReport & { bounce_rate_2s?: string | null }).bounce_rate_2s);
    }
  });
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

// 按 submitter 分组，返回 Map<name, avg>（至少5篇）
function buildPersonAvgMap(
  dim: DimKey,
  teamReports: MetricsReport[],
  myName: string | undefined,
): Map<string, number> {
  const byPerson = new Map<string, MetricsReport[]>();
  for (const r of teamReports) {
    const name = (r as MetricsReport & { submitter?: string }).submitter;
    if (!name || name === myName) continue;
    const arr = byPerson.get(name) ?? [];
    arr.push(r);
    byPerson.set(name, arr);
  }
  const result = new Map<string, number>();
  for (const [name, reps] of byPerson) {
    if (reps.length < 5) continue;
    result.set(name, avgDim(reps, dim));
  }
  return result;
}

// 找该维度比 selfAvg 更好的人，返回最好的那个
function findBenchmark(
  dim: DimKey,
  selfAvg: number,
  teamReports: MetricsReport[],
  myName: string | undefined,
): { name: string; avg: number } | null {
  const personMap = buildPersonAvgMap(dim, teamReports, myName);
  let best: { name: string; avg: number } | null = null;
  for (const [name, avg] of personMap) {
    const isBetter = dim === "2s跳出率" ? avg < selfAvg : avg > selfAvg;
    if (isBetter && (!best || (dim === "2s跳出率" ? avg < best.avg : avg > best.avg))) {
      best = { name, avg };
    }
  }
  return best;
}

// 找该维度第二名（比自己差一点的最强者，用于领先时展示差距）
function findSecondPlace(
  dim: DimKey,
  selfAvg: number,
  teamReports: MetricsReport[],
  myName: string | undefined,
): { name: string; avg: number } | null {
  const personMap = buildPersonAvgMap(dim, teamReports, myName);
  // 找所有比自己弱的人中最强的那个（即第二名）
  let second: { name: string; avg: number } | null = null;
  for (const [name, avg] of personMap) {
    const isWeaker = dim === "2s跳出率" ? avg >= selfAvg : avg <= selfAvg;
    if (isWeaker) {
      if (!second || (dim === "2s跳出率" ? avg < second.avg : avg > second.avg)) {
        second = { name, avg };
      }
    }
  }
  return second;
}

// ── 建议模板 ────────────────────────────────────────────────
// 未达标时的学习建议
const WEAK_ADVICE: Record<DimKey, string> = {
  播放量: "发布时间选在 18:00–21:00 黄金时段，标题前 5 字加强关键词密度，扩大初始推流池",
  涨粉: "结尾明确引导关注（口播+字幕双重提示），主页简介突出账号定位，让新访客 3 秒内看懂价值",
  点赞: "内容高潮处加引导字幕「双击支持一下」，结尾设置争议性话题引发评论，间接带动点赞",
  完播率: "精简视频时长至核心信息，中段加入反转/悬念维持观看动力，前 10 秒节奏加快",
  "5s完播率": "开头前 3 秒加强悬念钩子（提问/反常识/冲突画面），首帧直接呈现视觉冲击点",
  "2s跳出率": "首帧换成高对比度有人脸/动作的画面，封面文字放大至 80%+ 屏幕宽度，开头从核心结论开始说",
};

// 未达标时学习对标人的重点方向
const WEAK_FOCUS: Record<DimKey, string> = {
  播放量: "选题策略和发布时间",
  涨粉: "结尾CTA引导话术",
  点赞: "情绪共鸣和互动引导",
  完播率: "内容节奏和时长控制",
  "5s完播率": "开头钩子设计",
  "2s跳出率": "封面和首帧吸引力",
};

// 已达标时的进阶建议
const STRONG_ADVICE: Record<DimKey, string> = {
  播放量: "尝试更多垂类话题测试，找到下一个爆款选题方向，进一步扩大播放天花板",
  涨粉: "优化主页内容矩阵，提升老粉复访率，同时测试不同 CTA 话术提升转化",
  点赞: "分析高点赞内容的共同特征，复制情绪共鸣点，持续强化内容风格",
  完播率: "在完播率高的内容基础上加长时长测试，探索更深度内容的可能性",
  "5s完播率": "测试不同开头钩子类型（悬念/干货/反转），找到最适合你账号的开头公式",
  "2s跳出率": "在低跳出率封面基础上 A/B 测试文案，进一步提升点击转化率",
};

// ── 主组件 ────────────────────────────────────────────────
export type DiagnosisCardProps = {
  myReports: MetricsReport[];
  teamReports: MetricsReport[];
  className?: string;
};

type DimItem = {
  dim: DimKey;
  selfAvg: number;
  teamAvg: number;
  gapPct: number;
  label: string;
  isWeak: boolean;
};

const DIMS: DimKey[] = ["播放量", "涨粉", "点赞", "完播率", "5s完播率", "2s跳出率"];
const WEAK_THRESHOLD = 0.2; // 低于团队均值 20% 算弱项

function fmt(dim: DimKey, value: number): string {
  if (dim === "播放量" || dim === "涨粉") {
    if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
    return Math.round(value).toLocaleString("zh-CN");
  }
  return `${value.toFixed(1)}%`;
}

// 从 teamReports 推断当前用户名（myReports 中的 submitter）
function getMyName(myReports: MetricsReport[]): string | undefined {
  return (myReports[0] as MetricsReport & { submitter?: string })?.submitter;
}

export function DiagnosisCard({ myReports, teamReports, className }: DiagnosisCardProps) {
  const week = myReports.slice(-7);
  const myName = getMyName(myReports);

  const dimItems: DimItem[] = DIMS.map((dim) => {
    const self = avgDim(week, dim);
    const team = avgDim(teamReports, dim);
    const gap = team > 0 ? (team - self) / team : 0;
    return { dim, selfAvg: self, teamAvg: team, gapPct: gap, label: DIM_LABELS[dim], isWeak: team > 0 && gap > WEAK_THRESHOLD };
  }).filter((item) => item.teamAvg > 0);

  const weakItems = dimItems.filter((i) => i.isWeak);
  const strongItems = dimItems.filter((i) => !i.isWeak);

  // 动作建议：弱项找对标人学习，强项展示第二名差距
  const adviceItems: { dim: DimKey; label: string; tip: string; isWeak: boolean; benchmark?: { name: string; avg: number }; second?: { name: string; avg: number } }[] = [
    ...weakItems.slice(0, 3).map((item) => {
      const benchmark = findBenchmark(item.dim, item.selfAvg, teamReports, myName);
      return { dim: item.dim, label: item.label, tip: WEAK_ADVICE[item.dim], isWeak: true, benchmark: benchmark ?? undefined };
    }),
    ...strongItems.slice(0, 2).map((item) => {
      const second = findSecondPlace(item.dim, item.selfAvg, teamReports, myName);
      return { dim: item.dim, label: item.label, tip: STRONG_ADVICE[item.dim], isWeak: false, second: second ?? undefined };
    }),
  ].slice(0, 4);

  return (
    <MotionCard className={`border-[var(--color-border)] bg-[var(--color-surface)] ${className ?? ""}`}>
      <div className="space-y-4 p-5">
        {/* 标题 */}
        <div>
          <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">诊断建议</h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            近7天数据 · 与团队均值对比
          </p>
        </div>

        {/* 诊断区 */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">诊断</div>
          {myReports.length === 0 ? (
            <div className="space-y-2">
              <div className="rounded-[12px] border border-dashed border-[var(--color-border)] bg-[var(--color-border)]/10 p-3">
                <span className="text-xs text-[var(--color-text-secondary)]">暂无数据，以下为示范参考</span>
              </div>
              <div className="rounded-[12px] border border-dashed border-orange-200/60 bg-orange-50/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-orange-800">2秒跳出率</span>
                  <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">低 35% <span className="font-normal text-orange-500">示范数据</span></span>
                </div>
                <p className="mt-1 text-xs text-orange-700/80">你的2秒跳出率（38%）比团队均值（25%）高 35%，开头钩子需要优化</p>
              </div>
              <div className="rounded-[12px] border border-dashed border-orange-200/60 bg-orange-50/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-orange-800">涨粉数</span>
                  <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">低 40% <span className="font-normal text-orange-500">示范数据</span></span>
                </div>
                <p className="mt-1 text-xs text-orange-700/80">你的涨粉数（12）比团队均值（20）低 40%，结尾CTA引导需加强</p>
              </div>
            </div>
          ) : (
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-2">
              {/* 未达标维度：向团队中谁学习 */}
              {weakItems.map((item) => {
                const benchmark = findBenchmark(item.dim, item.selfAvg, teamReports, myName);
                return (
                  <motion.div key={`weak-${item.dim}`} variants={itemVariants} className="rounded-[12px] border border-orange-200/60 bg-orange-50/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-orange-800">{item.label}</span>
                      <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                        团队中游 · {fmt(item.dim, item.selfAvg)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-orange-700/80">
                      {benchmark
                        ? `${item.label}处于团队中游（得分 ${fmt(item.dim, item.selfAvg)}），建议参考 ${benchmark.name} 的做法（得分 ${fmt(item.dim, benchmark.avg)}），重点学习其${WEAK_FOCUS[item.dim]}`
                        : `${item.label}（${fmt(item.dim, item.selfAvg)}）比团队均值（${fmt(item.dim, item.teamAvg)}）低 ${(item.gapPct * 100).toFixed(0)}%，${WEAK_ADVICE[item.dim]}`}
                    </p>
                  </motion.div>
                );
              })}
              {/* 已达标维度：第二名距离你有多近 */}
              {strongItems.map((item) => {
                const second = findSecondPlace(item.dim, item.selfAvg, teamReports, myName);
                const gap = second
                  ? Math.abs(item.selfAvg - second.avg)
                  : null;
                return (
                  <motion.div key={`strong-${item.dim}`} variants={itemVariants} className="rounded-[12px] border border-emerald-200/60 bg-emerald-50/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-emerald-800">{item.label}</span>
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">团队领先</span>
                    </div>
                    <p className="mt-1 text-xs text-emerald-700/80">
                      {second && gap !== null
                        ? `${item.label}你是团队领先（得分 ${fmt(item.dim, item.selfAvg)}），第二名 ${second.name}（得分 ${fmt(item.dim, second.avg)}）距你仅差 ${fmt(item.dim, gap)}，保持优势`
                        : `${item.label}你是团队最强（得分 ${fmt(item.dim, item.selfAvg)}），继续保持领先优势`}
                    </p>
                  </motion.div>
                );
              })}
              {dimItems.length === 0 && (
                <div className="rounded-[12px] border border-dashed border-[var(--color-border)] bg-[var(--color-border)]/10 p-3">
                  <span className="text-xs text-[var(--color-text-secondary)]">团队数据不足，暂无对比</span>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* 动作建议区 */}
        {myReports.length === 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">动作建议 <span className="ml-1 normal-case text-[var(--color-text-secondary)]/60">示范数据</span></div>
            <div className="space-y-2">
              {[
                { label: "2秒跳出率", tip: "开头留人：前3秒加入悬念问句，降低跳出率" },
                { label: "互动引导", tip: "在第15秒插入互动提问，提升评论率" },
                { label: "转化优化", tip: "结尾用「点击主页看更多」替代通用CTA" },
              ].map((item, i) => (
                <div key={i} className="rounded-[12px] border border-dashed border-[#007AFF]/20 bg-[#007AFF]/5 p-3">
                  <div className="mb-1 text-xs font-medium text-[#007AFF]/70">{item.label}</div>
                  <p className="text-sm leading-5 text-[var(--color-text-primary)]">{item.tip}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {myReports.length > 0 && adviceItems.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">动作建议</div>
            <motion.div
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              className="space-y-2"
            >
              {adviceItems.map((item, i) => (
                <motion.div
                  key={`${item.dim}-${i}`}
                  variants={itemVariants}
                  className="rounded-[12px] border border-[#007AFF]/20 bg-[#007AFF]/5 p-3"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-medium text-[#007AFF]/70">{item.label}</span>
                    {item.isWeak && item.benchmark && (
                      <span className="rounded-full bg-[#007AFF]/10 px-1.5 py-0.5 text-[10px] text-[#007AFF]/60">参考 {item.benchmark.name}</span>
                    )}
                    {!item.isWeak && item.second && (
                      <span className="rounded-full bg-[#007AFF]/10 px-1.5 py-0.5 text-[10px] text-[#007AFF]/60">第二名 {item.second.name}</span>
                    )}
                  </div>
                  <p className="text-sm leading-5 text-[var(--color-text-primary)]">{item.tip}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        )}
      </div>
    </MotionCard>
  );
}
