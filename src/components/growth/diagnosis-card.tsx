"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react";

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
  点赞: "在情绪最高点插一句互动提问，逼用户做'同意 / 不同意'的选择。",
  完播率: "砍掉铺垫句，把结论前置到前 10 秒，中段只留一个核心转折。",
  "5s完播率": "开头 3 秒先给冲突或反常识，不要先讲背景。",
  "2s跳出率": "首帧直接上人物动作或结果画面，第一句从结论说起。",
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
      evidence: "5秒完播率 28%，团队均值 41%，前3秒留人偏弱。",
      benchmarkLabel: "该学谁 / 为什么：参考 小林",
      benchmarkReason: "同题材账号首句直接抛冲突，5秒完播率稳定在 46% 左右。",
      action: "先把第一句改成结论前置 + 悬念问句，再连续验证 3 条。",
    },
    {
      key: "demo-growth",
      title: "增长转化偏弱",
      tone: "weak",
      evidence: "单条涨粉 9，团队均值 16，结尾转化动作不够明确。",
      benchmarkLabel: "该学谁 / 为什么：参考 阿周",
      benchmarkReason: "对方结尾会重复一句'主页看完整版'，转粉路径更清楚。",
      action: "把结尾 CTA 固定成 1 句口播 + 1 句字幕，不要临场发挥。",
    },
    {
      key: "demo-like",
      title: "互动吸引暂时领先",
      tone: "strong",
      evidence: "点赞率 8.2%，高于团队均值 6.1%，第二名已追到 7.8%。",
      benchmarkLabel: "该盯谁 / 为什么：盯住 第二名账号",
      benchmarkReason: "对方评论区提问更密，互动链路已经很接近你。",
      action: "保留现有情绪点，在第 15 秒补一个互动提问，继续拉开差距。",
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
          ? `${benchmark.name} 这项做到 ${fmt(item.dim, benchmark.avg)}，更值得直接抄。`
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
    <div className={className}>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid gap-3 lg:grid-cols-2"
      >
        {diagnosisItems.map((item) => {
          const isWeak = item.tone === "weak";
          return (
            <motion.article
              key={item.key}
              variants={itemVariants}
              className="group flex flex-col rounded-2xl border border-zinc-200 bg-white p-4 transition hover:-translate-y-[1px] hover:shadow-md"
            >
              {/* 头部 */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {isWeak ? (
                    <AlertTriangle className="size-4 shrink-0 text-[#EAB308]" />
                  ) : (
                    <ShieldCheck className="size-4 shrink-0 text-[#067647]" />
                  )}
                  <h3 className="text-sm font-bold text-zinc-950">{item.title}</h3>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    isWeak
                      ? "bg-[#FEFCE8] text-[#B45309]"
                      : "bg-[#ECFDF3] text-[#067647]"
                  }`}
                >
                  {isWeak ? "优先处理" : "继续放大"}
                </span>
              </div>

              {/* 数据证据 */}
              <p className="mt-3 text-[13px] leading-relaxed text-zinc-600">
                {item.evidence}
              </p>

              {/* 对标信息 — 压缩为一行小字 */}
              <p className="mt-1 text-[11px] text-zinc-400">
                {item.benchmarkLabel} · {item.benchmarkReason}
              </p>

              {/* 下一步动作 — 底部按钮 */}
              <div className="mt-auto pt-3">
                <div className="flex items-start gap-2 rounded-xl border-l-4 border-l-zinc-950 bg-zinc-50 p-3">
                  <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-zinc-500" />
                  <p className="text-[13px] leading-relaxed text-zinc-800">{item.action}</p>
                </div>
              </div>
            </motion.article>
          );
        })}

        {diagnosisItems.length === 0 ? (
          <div className="col-span-2 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
            团队数据不足，暂时还不能给出有效对标。
          </div>
        ) : null}
      </motion.div>
    </div>
  );
}
