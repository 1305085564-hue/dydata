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

export function AdvicePanel({ data }: { data: AdviceSections }) {
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

  return (
    <MotionCard className="border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.02em] text-[var(--color-text-primary)]">诊断 / 参考 / 动作</h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
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
            <div key={section.key} className={`rounded-[12px] border p-4 ${sectionTone[section.key as keyof typeof sectionTone]}`}>
              <div className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]">{section.title}</div>
              <TypeLine text={section.text} />
            </div>
          ))}
        </div>
      </div>
    </MotionCard>
  );
}
