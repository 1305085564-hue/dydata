"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DiagnosisCard } from "@/components/growth/diagnosis-card";
import { BenchmarkCard } from "@/components/growth/benchmark-card";
import { PKBattle } from "@/components/pk/pk-battle";
import { SampleLibrary } from "@/components/growth/sample-library";
import { AiAdvice } from "@/components/growth/ai-advice";
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
        <Card className="rounded-2xl border border-white/70 bg-white/75 shadow-sm backdrop-blur-xl">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            提交 2 天以上数据后即可查看成长分析
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 状态卡 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {statusCards.map((card) => (
              <Card key={card.label} className="rounded-2xl border border-white/70 bg-white/75 shadow-sm backdrop-blur-xl">
                <CardContent className="px-4 py-4">
                  <p className="text-xs font-light text-muted-foreground">{card.label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{card.value}</p>
                  <DeltaIndicator delta={card.delta} />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* 诊断 + 标杆 */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <DiagnosisCard {...diagnosisProps} />
            </div>
            <div className="space-y-4 lg:col-span-2">
              {benchmarkCards.length > 0 ? (
                benchmarkCards.map((card, i) => (
                  <BenchmarkCard key={i} {...card} />
                ))
              ) : (
                <Card className="rounded-2xl border border-white/70 bg-white/75 shadow-sm backdrop-blur-xl">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    数据积累中，标杆推荐即将解锁
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* PK 对比 */}
          {pkData && (
            <PKBattle
              mode="1v1"
              playerA={pkData.playerA}
              playerB={pkData.playerB}
              dimensions={["likeRate", "commentRate", "shareRate", "saveRate", "followerRate", "completionRate", "completionRate5s"]}
            />
          )}

          {/* 学习样本 */}
          {sampleList.length > 0 && (
            <SampleLibrary 样本数组={sampleList} />
          )}

          {/* AI 建议 */}
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
        </>
      )}
    </div>
  );
}
