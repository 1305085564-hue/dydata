"use client";

import { motion, type Variants } from "framer-motion";
import { ArrowDown, ArrowUp } from "lucide-react";
import { DiagnosisCard } from "@/components/growth/diagnosis-card";
import { BenchmarkCard } from "@/components/growth/benchmark-card";
import { AiAdvice } from "@/components/growth/ai-advice";
import { SampleLibrary } from "@/components/growth/sample-library";
import { PKBattle } from "@/components/pk/pk-battle";
import { AnimatedNumber } from "@/components/animated-number";
import { Card, CardContent } from "@/components/ui/card";
import type { 标杆画像卡Props } from "@/components/growth/benchmark-card";
import type { 个人诊断卡Props } from "@/components/growth/diagnosis-card";
import type { 学习样本项 } from "@/components/growth/sample-library";
import type { PKBattleCompetitor } from "@/components/pk/pk-battle";

interface StatusCard {
  label: string;
  value: string;
  delta?: number;
  prev?: number;
}

interface GrowthClientShellProps {
  profileName: string;
  accountCount: number;
  reportCount: number;
  statusCards: StatusCard[];
  diagnosisProps: Omit<个人诊断卡Props, "className">;
  benchmarkCards: Array<Omit<标杆画像卡Props, "className">>;
  pkData: { playerA: PKBattleCompetitor; playerB: PKBattleCompetitor } | null;
  sampleList: 学习样本项[];
  userId: string;
  accountId: string;
}

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
  },
};

function parseAnimatedValue(value: string) {
  const trimmed = value.trim();
  if (/^-?\d+(?:\.\d+)?%$/.test(trimmed)) {
    const numeric = Number.parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(numeric)
      ? { value: numeric, format: (n: number) => `${n}%` }
      : null;
  }

  if (/^-?\d+(?:,\d{3})*(?:\.\d+)?$/.test(trimmed)) {
    const numeric = Number.parseFloat(trimmed.replace(/,/g, ""));
    return Number.isFinite(numeric) ? { value: numeric, format: (n: number) => n.toLocaleString("zh-CN") } : null;
  }

  return null;
}

function StatusCardValue({ value }: { value: string }) {
  const animated = parseAnimatedValue(value);

  if (!animated) {
    return <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{value}</p>;
  }

  return (
    <AnimatedNumber
      value={animated.value}
      duration={0.7}
      format={animated.format}
      className="mt-1 text-xl font-semibold tracking-tight"
    />
  );
}

function DeltaIndicator({ delta }: { delta?: number }) {
  if (delta === undefined || !Number.isFinite(delta) || Math.abs(delta) < 0.01) return null;
  const isUp = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isUp ? "text-emerald-600" : "text-orange-500"}`}>
      {isUp ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

export function GrowthClientShell({
  profileName,
  accountCount,
  reportCount,
  statusCards,
  diagnosisProps,
  benchmarkCards,
  pkData,
  sampleList,
  userId,
  accountId,
}: GrowthClientShellProps) {
  const hasData = reportCount > 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      {/* 标题 */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">成长分析</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {profileName} · {accountCount} 个账号 · 近30天 {reportCount} 条数据
        </p>
      </div>

      {!hasData ? (
        <Card className="glass-card-static">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            提交 2 天以上数据后即可查看成长分析
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 状态卡 */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          >
            {statusCards.map((card) => (
              <motion.div key={card.label} variants={itemVariants}>
                <Card className="glass-card">
                  <CardContent className="px-4 py-4">
                    <p className="text-xs font-light text-muted-foreground">{card.label}</p>
                    <StatusCardValue value={card.value} />
                    <DeltaIndicator delta={card.delta} />
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          {/* 诊断 + 标杆 */}
          <motion.div
            className="grid gap-4 lg:grid-cols-3"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={itemVariants}
          >
            <div className="lg:col-span-1">
              <DiagnosisCard {...diagnosisProps} />
            </div>
            <div className="space-y-4 lg:col-span-2">
              {benchmarkCards.length > 0 ? (
                benchmarkCards.map((card, i) => (
                  <BenchmarkCard key={i} {...card} />
                ))
              ) : (
                <Card className="glass-card-static">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    数据积累中，标杆推荐即将解锁
                  </CardContent>
                </Card>
              )}
            </div>
          </motion.div>

          {/* PK 对比 */}
          {pkData && (
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={itemVariants}
            >
              <PKBattle
                mode="1v1"
                playerA={pkData.playerA}
                playerB={pkData.playerB}
                dimensions={["likeRate", "commentRate", "shareRate", "saveRate", "followerRate", "completionRate", "completionRate5s"]}
              />
            </motion.div>
          )}

          {/* 学习样本 */}
          {sampleList.length > 0 && (
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-50px" }}
              variants={itemVariants}
            >
              <SampleLibrary 样本数组={sampleList} />
            </motion.div>
          )}

          {/* AI 建议 */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={itemVariants}
          >
            <AiAdvice
              userId={userId}
              accountId={accountId}
              payload={{
                summary7d: statusCards,
                diagnostics: diagnosisProps,
                weakestDimensions: diagnosisProps.弱项,
                benchmark: benchmarkCards[0] ?? null,
                benchmarkSamples: sampleList.slice(0, 3),
              }}
            />
          </motion.div>
        </>
      )}
    </div>
  );
}
