"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, LineChart, ShieldCheck, Users } from "lucide-react";

import { MotionCard } from "@/components/ui/motion-card";
import { containerVariants, itemVariants } from "@/lib/animations";
import { calcRates, parsePercentText, type MetricsReport } from "@/lib/metrics";

type DimKey = "播放量" | "涨粉" | "点赞" | "完播率" | "5s完播率" | "2s跳出率";

type DiagnosisItem = {
  key: string;
  title: string;
  tone: "weak" | "strong";
  evidence: string;
  benchmarkLabel: string;
  benchmarkReason: string;
  action: string;
};

type DimItem = {
  dim: DimKey;
  selfAvg: number;
  teamAvg: number;
  gapPct: number;
  label: string;
  isWeak: boolean;
};

const DIM_LABELS: Record<DimKey, string> = {
  播放量: "播放量",
  涨粉: "涨粉数",
  点赞: "点赞率",
  完播率: "完播率",
  "5s完播率": "5秒完播率",
  "2s跳出率": "2秒跳出率",
};

const WEAK_ADVICE: Record<DimKey, string> = {
  播放量: "发布时间优先压到 18:00-21:00，再把标题前 5 个字改成更直给的关键词。",
  涨粉: "结尾固定一条关注理由，口播和字幕同步出现，不要只留空泛 CTA。",
  点赞: "在情绪最高点插一句互动提问，逼用户做“同意 / 不同意”的选择。",
  完播率: "砍掉铺垫句，把结论前置到前 10 秒，中段只留一个核心转折。",
  "5s完播率": "开头 3 秒先给冲突或反常识，不要先讲背景。",
  "2s跳出率": "首帧直接上人物动作或结果画面，第一句从结论说起。",
};

const WEAK_FOCUS: Record<DimKey, string> = {
  播放量: "选题抓法和发布时间",
  涨粉: "结尾 CTA 和主页承接",
  点赞: "互动提问和情绪点",
  完播率: "结构节奏和信息密度",
  "5s完播率": "开头钩子设计",
  "2s跳出率": "首帧和第一句吸引力",
};

const STRONG_ADVICE: Record<DimKey, string> = {
  播放量: "沿着现有高播放题材继续做 2 个变体，确认是不是稳定选题。",
  涨粉: "复用当前 CTA 框架，再测试一句更明确的主页引导。",
  点赞: "保留现有情绪点，在中段多补一个互动问题，继续拉开差距。",
  完播率: "在当前节奏不变的前提下，试一次更短版本，确认极限完播能不能更高。",
  "5s完播率": "把高留存开头沉淀成固定模板，下轮继续复用。",
  "2s跳出率": "保持现在的首帧打法，再试一版更短标题做 A/B 对比。",
};

const DIMS: DimKey[] = ["播放量", "涨粉", "点赞", "完播率", "5s完播率", "2s跳出率"];
const WEAK_THRESHOLD = 0.2;

function avgDim(reports: MetricsReport[], dim: DimKey): number {
  if (!reports.length) return 0;
  const vals = reports.map((r) => {
    switch (dim) {
      case "播放量":
        return r.play_count ?? 0;
      case "涨粉":
        return r.follower_gain ?? 0;
      case "点赞":
        return calcRates(r).likeRate;
      case "完播率":
        return parsePercentText(r.completion_rate);
      case "5s完播率":
        return parsePercentText(r.completion_rate_5s);
      case "2s跳出率":
        return parsePercentText((r as MetricsReport & { bounce_rate_2s?: string | null }).bounce_rate_2s);
    }
  });
  return vals.reduce((sum, value) => sum + value, 0) / vals.length;
}

function buildPersonAvgMap(dim: DimKey, teamReports: MetricsReport[], myName: string | undefined): Map<string, number> {
  const byPerson = new Map<string, MetricsReport[]>();
  for (const report of teamReports) {
    const name = (report as MetricsReport & { submitter?: string }).submitter;
    if (!name || name === myName) continue;
    const reports = byPerson.get(name) ?? [];
    reports.push(report);
    byPerson.set(name, reports);
  }

  const result = new Map<string, number>();
  for (const [name, reports] of byPerson) {
    if (reports.length < 5) continue;
    result.set(name, avgDim(reports, dim));
  }
  return result;
}

function findBenchmark(dim: DimKey, selfAvg: number, teamReports: MetricsReport[], myName: string | undefined) {
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

function findSecondPlace(dim: DimKey, selfAvg: number, teamReports: MetricsReport[], myName: string | undefined) {
  const personMap = buildPersonAvgMap(dim, teamReports, myName);
  let second: { name: string; avg: number } | null = null;
  for (const [name, avg] of personMap) {
    const isWeaker = dim === "2s跳出率" ? avg >= selfAvg : avg <= selfAvg;
    if (isWeaker && (!second || (dim === "2s跳出率" ? avg < second.avg : avg > second.avg))) {
      second = { name, avg };
    }
  }
  return second;
}

function fmt(dim: DimKey, value: number): string {
  if (dim === "播放量" || dim === "涨粉") {
    if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
    return Math.round(value).toLocaleString("zh-CN");
  }
  return `${value.toFixed(1)}%`;
}

function getMyName(myReports: MetricsReport[]): string | undefined {
  return (myReports[0] as MetricsReport & { submitter?: string })?.submitter;
}

function buildExampleItems(): DiagnosisItem[] {
  return [
    {
      key: "demo-hook",
      title: "开头留人偏弱",
      tone: "weak",
      evidence: "示范数据：5秒完播率 28%，团队均值 41%，前3秒留人偏弱。",
      benchmarkLabel: "该学谁 / 为什么：参考 小林",
      benchmarkReason: "示例内容：同题材账号首句直接抛冲突，5秒完播率稳定在 46% 左右。",
      action: "下一步动作：先把第一句改成结论前置 + 悬念问句，再连续验证 3 条。",
    },
    {
      key: "demo-growth",
      title: "增长转化偏弱",
      tone: "weak",
      evidence: "示范数据：单条涨粉 9，团队均值 16，结尾转化动作不够明确。",
      benchmarkLabel: "该学谁 / 为什么：参考 阿周",
      benchmarkReason: "示例内容：对方结尾会重复一句“主页看完整版”，转粉路径更清楚。",
      action: "下一步动作：把结尾 CTA 固定成 1 句口播 + 1 句字幕，不要临场发挥。",
    },
    {
      key: "demo-like",
      title: "互动吸引暂时领先",
      tone: "strong",
      evidence: "示范数据：点赞率 8.2%，高于团队均值 6.1%，第二名已追到 7.8%。",
      benchmarkLabel: "该盯谁 / 为什么：盯住 第二名账号",
      benchmarkReason: "示例内容：对方评论区提问更密，互动链路已经很接近你。",
      action: "下一步动作：保留现有情绪点，在第 15 秒补一个互动提问，继续拉开差距。",
    },
  ];
}

function buildDiagnosisItems(myReports: MetricsReport[], teamReports: MetricsReport[]): DiagnosisItem[] {
  if (myReports.length === 0) return buildExampleItems();

  const week = myReports.slice(-7);
  const myName = getMyName(myReports);
  const dimItems: DimItem[] = DIMS.map((dim) => {
    const selfAvg = avgDim(week, dim);
    const teamAvg = avgDim(teamReports, dim);
    const gapPct = teamAvg > 0 ? (teamAvg - selfAvg) / teamAvg : 0;
    return {
      dim,
      selfAvg,
      teamAvg,
      gapPct,
      label: DIM_LABELS[dim],
      isWeak: teamAvg > 0 && gapPct > WEAK_THRESHOLD,
    };
  }).filter((item) => item.teamAvg > 0);

  const weakItems = dimItems.filter((item) => item.isWeak);
  const strongItems = dimItems.filter((item) => !item.isWeak);

  return [
    ...weakItems.slice(0, 4).map((item) => {
      const benchmark = findBenchmark(item.dim, item.selfAvg, teamReports, myName);
      return {
        key: `weak-${item.dim}`,
        title: `${item.label}偏弱`,
        tone: "weak" as const,
        evidence: `你的 ${item.label} ${fmt(item.dim, item.selfAvg)}，团队均值 ${fmt(item.dim, item.teamAvg)}，差距 ${(item.gapPct * 100).toFixed(0)}%。`,
        benchmarkLabel: benchmark ? `该学谁 / 为什么：参考 ${benchmark.name}` : "该学谁 / 为什么：先看团队均值以上样本",
        benchmarkReason: benchmark
          ? `${benchmark.name} 这项做到 ${fmt(item.dim, benchmark.avg)}，更值得直接抄他的${WEAK_FOCUS[item.dim]}。`
          : `当前没找到足够稳定的对标人，先复盘团队里 ${item.label} 高于均值的作品。`,
        action: WEAK_ADVICE[item.dim],
      };
    }),
    ...strongItems.slice(0, Math.max(0, 4 - weakItems.length)).map((item) => {
      const second = findSecondPlace(item.dim, item.selfAvg, teamReports, myName);
      const gap = second ? Math.abs(item.selfAvg - second.avg) : null;
      return {
        key: `strong-${item.dim}`,
        title: `${item.label}暂时领先`,
        tone: "strong" as const,
        evidence: second && gap !== null
          ? `你当前 ${fmt(item.dim, item.selfAvg)}，${second.name} 是 ${fmt(item.dim, second.avg)}，领先 ${fmt(item.dim, gap)}。`
          : `你当前 ${fmt(item.dim, item.selfAvg)}，高于团队均值 ${fmt(item.dim, item.teamAvg)}。`,
        benchmarkLabel: second ? `该盯谁 / 为什么：盯住 ${second.name}` : "该盯谁 / 为什么：继续对照团队均值",
        benchmarkReason: second
          ? `${second.name} 已经很接近你，这项一松就会被追平。`
          : "当前没有明显追赶者，先把稳定表现继续守住。",
        action: STRONG_ADVICE[item.dim],
      };
    }),
  ].slice(0, 4);
}

export type DiagnosisCardProps = {
  myReports: MetricsReport[];
  teamReports: MetricsReport[];
  className?: string;
};

export function DiagnosisCard({ myReports, teamReports, className }: DiagnosisCardProps) {
  const diagnosisItems = buildDiagnosisItems(myReports, teamReports);

  return (
    <MotionCard className={`border-white/70 glass-panel backdrop-blur-[16px] ${className ?? ""}`}>
      <div className="space-y-4 p-5 sm:p-6">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Diagnosis Brief</p>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">诊断建议</h2>
          <p className="text-sm leading-6 text-[var(--color-text-secondary)]">先看问题，再找对标，再决定下一步先改哪一个动作。</p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">重点项</div>
          <div className="text-xs text-[var(--color-text-secondary)]">
            {myReports.length === 0 ? "示例内容 / 示范数据" : `最多展示 ${diagnosisItems.length} 项`}
          </div>
        </div>

        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid gap-3 lg:grid-cols-2">
          {diagnosisItems.map((item) => {
            const toneClass = item.tone === "weak" ? "border-orange-200/70 bg-orange-50/70" : "border-emerald-200/70 bg-emerald-50/70";
            const badgeClass = item.tone === "weak" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400" : "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400";

            return (
              <motion.article key={item.key} variants={itemVariants} className={`rounded-[18px] border p-4 ${toneClass}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                      {item.tone === "weak" ? <AlertTriangle className="size-4 text-orange-600" /> : <ShieldCheck className="size-4 text-emerald-600" />}
                      <span>问题名：{item.title}</span>
                    </div>
                    {myReports.length === 0 ? (
                      <div className="text-[11px] font-medium text-[var(--color-text-secondary)]">示例内容</div>
                    ) : null}
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${badgeClass}`}>
                    {item.tone === "weak" ? "优先处理" : "继续放大"}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-[var(--color-text-primary)]">
                  <div className="rounded-[14px] border border-white/60 glass-panel p-3">
                    <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                      <LineChart className="size-3.5" />
                      数据证据
                    </div>
                    <p className="leading-6">{item.evidence}</p>
                  </div>

                  <div className="rounded-[14px] border border-white/60 glass-panel p-3">
                    <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                      <Users className="size-3.5" />
                      {item.benchmarkLabel}
                    </div>
                    <p className="leading-6">{item.benchmarkReason}</p>
                  </div>

                  <div className="rounded-r-[14px] border-l-4 border-blue-500 bg-blue-50/50 p-3 dark:border-blue-400 dark:bg-blue-500/10">
                    <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                      <ArrowRight className="size-3.5" />
                      下一步动作
                    </div>
                    <p className="leading-6">{item.action}</p>
                  </div>
                </div>
              </motion.article>
            );
          })}

          {diagnosisItems.length === 0 ? (
            <div className="rounded-[16px] border border-dashed border-[var(--color-border)] bg-[var(--color-border)]/10 p-4 text-sm text-[var(--color-text-secondary)]">
              团队数据不足，暂时还不能给出有效对标。
            </div>
          ) : null}
        </motion.div>
      </div>
    </MotionCard>
  );
}
