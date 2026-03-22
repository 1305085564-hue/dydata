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

// ── 建议模板 ────────────────────────────────────────────────
const ADVICE_TEMPLATES: Record<DimKey, string[]> = {
  播放量: [
    "发布时间选在 18:00–21:00 黄金时段 → 预计提升自然曝光 15%+",
    "标题前 5 字加强关键词密度，契合平台算法推荐逻辑 → 扩大初始推流池",
    "与同类高播放账号互评互关，借助关联流量破圈",
  ],
  涨粉: [
    "结尾明确引导关注（口播+字幕双重提示）→ 预计提升关注转化率 10%+",
    "发布系列内容并在简介中标明「第X集」，增强用户追更动力",
    "主页头图+简介突出账号定位，让新访客在 3 秒内看懂你能提供什么",
  ],
  点赞: [
    "在内容高潮处停顿 0.5 秒后加引导弹幕/字幕「双击支持一下」→ 提升互动密度",
    "内容结尾设置争议性话题引发评论，间接带动点赞",
    "选择正向情绪共鸣型内容方向，共鸣感强的内容点赞转化更高",
  ],
  完播率: [
    "精简视频时长至核心信息，删除铺垫冗余部分 → 预计提升完播率 8%+",
    "中段加入反转/悬念/干货列表，维持观看动力至结尾",
    "前 10 秒节奏加快，用快切+字幕降低中段跳出率",
  ],
  "5s完播率": [
    "开头前 3 秒加强悬念钩子（提问/反常识/冲突画面）→ 预计提升 2s 完播率 10%+",
    "首帧画面避免黑屏/logo，直接呈现视觉冲击点",
    "前 5 秒字幕放大核心利益点，让用户快速判断值不值得看完",
  ],
  "2s跳出率": [
    "首帧换成高对比度、有人脸/动作的画面，降低第一眼跳出率",
    "封面文字放大至 80%+ 屏幕宽度，清晰传达内容价值",
    "开头台词从核心结论开始说，避免自我介绍或过场铺垫",
  ],
};

// ── 主组件 ────────────────────────────────────────────────
export type DiagnosisCardProps = {
  myReports: MetricsReport[];
  teamReports: MetricsReport[];
  className?: string;
};

type WeakItem = {
  dim: DimKey;
  selfAvg: number;
  teamAvg: number;
  gapPct: number;
  label: string;
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

export function DiagnosisCard({ myReports, teamReports, className }: DiagnosisCardProps) {
  const week = myReports.slice(-7);
  const teamWeek = teamReports;

  const weakItems: WeakItem[] = DIMS.map((dim) => {
    const self = avgDim(week, dim);
    const team = avgDim(teamWeek, dim);
    const gap = team > 0 ? (team - self) / team : 0;
    return { dim, selfAvg: self, teamAvg: team, gapPct: gap, label: DIM_LABELS[dim] };
  }).filter((item) => item.teamAvg > 0 && item.gapPct > WEAK_THRESHOLD);

  const adviceItems = weakItems
    .slice(0, 3)
    .flatMap((item) => {
      const tips = ADVICE_TEMPLATES[item.dim];
      return tips.slice(0, 1).map((tip) => ({ dim: item.dim, label: item.label, tip }));
    })
    .slice(0, 3);

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
          {weakItems.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="rounded-[12px] border border-emerald-200/60 bg-emerald-50/60 p-4 text-sm text-emerald-700"
            >
              本周各项指标均达团队均值，继续保持 🎯
            </motion.div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-2"
            >
              {weakItems.map((item) => (
                <motion.div
                  key={item.dim}
                  variants={itemVariants}
                  className="rounded-[12px] border border-orange-200/60 bg-orange-50/60 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-orange-800">{item.label}</span>
                    <span className="shrink-0 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                      低 {(item.gapPct * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-orange-700/80">
                    你的{item.label}（{fmt(item.dim, item.selfAvg)}）比团队均值（{fmt(item.dim, item.teamAvg)}）低 {(item.gapPct * 100).toFixed(0)}%
                  </p>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        {/* 动作建议区 */}
        {adviceItems.length > 0 && (
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
                  <div className="mb-1 text-xs font-medium text-[#007AFF]/70">{item.label}</div>
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
