"use client";


import { useTypewriter } from "@/lib/animations";
import type { AdviceSections } from "@/lib/growth-page";
import { ErrorState } from "@/components/ui/error-state";

function TypeLine({ text }: { text: string }) {
  const { displayText, cursorClassName } = useTypewriter(text, 24);
  return (
    <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.7] text-stone-800">
      {displayText}
      <span className={cursorClassName} aria-hidden="true" />
    </p>
  );
}

const sectionTone = {
  diagnosis: "border-stone-200 border-l-[1.5px] border-l-[#D99E55]",
  reference: "border-stone-200",
  action: "border-stone-200 border-l-[1.5px] border-l-[#6FAA7D]",
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
      <ErrorState title="AI 分析暂时不可用" description="稍后重试或切换规则诊断。" />
    );
  }

  if (noData) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-[12px] font-medium uppercase tracking-[0.25em] text-stone-400">Advice Flow</p>
            <h2 className="text-[24px] font-semibold tracking-tight text-stone-800">诊断 / 参考 / 动作</h2>
            <p className="text-[13px] leading-[1.7] text-stone-500">暂无数据，以下为示范参考</p>
          </div>
          <div className="grid gap-3">
            {DEMO_SECTIONS.map((section) => (
              <div key={section.key} className={`rounded-xl border border-dashed p-4 ${sectionTone[section.key as keyof typeof sectionTone]}`}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-stone-800">{section.title}</span>
                  <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[12px] uppercase tracking-[0.25em] text-stone-400">示范数据</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.7] text-stone-800">{section.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-[12px] font-medium uppercase tracking-[0.25em] text-stone-400">Advice Flow</p>
            <h2 className="text-[24px] font-semibold tracking-tight text-stone-800">诊断 / 参考 / 动作</h2>
            <p className="text-[13px] leading-[1.7] text-stone-500">
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
            <div key={section.key} className={`rounded-xl border p-4 ${sectionTone[section.key as keyof typeof sectionTone]}`}>
              <div className="mb-2 text-[13px] font-semibold text-stone-800">{section.title}</div>
              <TypeLine text={section.text} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
