"use client";

import { MotionCard } from "@/components/ui/motion-card";
import { useTypewriter } from "@/lib/animations";
import type { AdviceSections } from "@/lib/growth-page";

function TypeLine({ text }: { text: string }) {
  const { displayText, cursorClassName } = useTypewriter(text, 24);
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-text-primary)]">
      {displayText}
      <span className={cursorClassName} aria-hidden="true" />
    </p>
  );
}

const sectionTone = {
  diagnosis: "border-[color:var(--color-warning)]/20 bg-[color:var(--color-warning)]/10",
  reference: "border-[color:var(--color-primary)]/20 bg-[color:var(--color-primary)]/10",
  action: "border-[color:var(--color-success)]/20 bg-[color:var(--color-success)]/10",
} as const;

const DEMO_SECTIONS = [
  {
    key: "diagnosis",
    title: "诊断",
    text: "2秒跳出率偏高（38%），开头钩子吸引力不足，用户在前2秒未被留住。",
  },
  {
    key: "reference",
    title: "参考",
    text: "同题材高播放账号普遍在前3秒使用悬念问句或冲突画面，完播率比均值高20%+。",
  },
  {
    key: "action",
    title: "动作",
    text: "1. 开头留人：前3秒加入悬念问句，降低跳出率\n2. 互动引导：在第15秒插入互动提问，提升评论率\n3. 转化优化：结尾用「点击主页看更多」替代通用CTA",
  },
];

export function AdvicePanel({ data, noData = false }: { data: AdviceSections; noData?: boolean }) {
  if (data.source === "error") {
    return (
      <MotionCard className="border-[var(--color-danger)]/20 bg-[color:rgba(255,59,48,0.06)]">
        <div className="space-y-2 p-5">
          <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">诊断 / 参考 / 动作</h2>
          <p className="text-sm text-[var(--color-danger)]">AI 分析暂时不可用</p>
        </div>
      </MotionCard>
    );
  }

  if (noData) {
    return (
      <MotionCard className="border-white/70 glass-panel backdrop-blur-[16px]">
        <div className="space-y-4 p-5 sm:p-6">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Advice Flow</p>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">诊断 / 参考 / 动作</h2>
            <p className="text-sm leading-6 text-[var(--color-text-secondary)]">暂无数据，以下为示范参考</p>
          </div>
          <div className="grid gap-3">
            {DEMO_SECTIONS.map((section) => (
              <div key={section.key} className={`rounded-[12px] border border-dashed p-4 ${sectionTone[section.key as keyof typeof sectionTone]}`}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">{section.title}</span>
                  <span className="rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">示范数据</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-text-primary)]">{section.text}</p>
              </div>
            ))}
          </div>
        </div>
      </MotionCard>
    );
  }

  return (
    <MotionCard className="border-white/70 glass-panel backdrop-blur-[16px]">
      <div className="space-y-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-tertiary)]">Advice Flow</p>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">诊断 / 参考 / 动作</h2>
            <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
              {data.source === "ai" ? "已优先展示 AI 洞察结果。" : "当前无 AI 结果，已切换规则诊断。"}
            </p>
          </div>
        </div>

        <div className="grid gap-3">
          {[
            { key: "diagnosis", title: "诊断", text: data.diagnosis },
            { key: "reference", title: "参考", text: data.reference },
            { key: "action", title: "动作", text: data.action },
          ].map((section) => (
            <div key={section.key} className={`rounded-[16px] border p-4 ${sectionTone[section.key as keyof typeof sectionTone]}`}>
              <div className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]">{section.title}</div>
              <TypeLine text={section.text} />
            </div>
          ))}
        </div>
      </div>
    </MotionCard>
  );
}
