"use client";

import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, FileSearch, Lightbulb, Sparkles } from "lucide-react";
import { useState } from "react";


import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { containerVariants, itemVariants } from "@/lib/animations";
import type { ScriptBreakdownData } from "@/lib/growth-page";
import { cn } from "@/lib/utils";

type SegmentTone = "primary" | "warning" | "success" | "danger" | "neutral";

const toneMap = {
  primary: "inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 text-stone-700",
  warning: "inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 text-stone-700",
  success: "inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 text-stone-700",
  danger: "inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 text-stone-700",
  neutral: "border-stone-200 bg-white text-stone-500",
} as const;

const DEMO_SEGMENTS = [
  {
    id: "demo-hook",
    label: "开头钩子",
    tone: "primary" as const,
    content: "示例内容：先抛一句反常识结论，“你以为播放低是选题差，其实是开头3秒没人留下来。”",
  },
  {
    id: "demo-core",
    label: "中段展开",
    tone: "success" as const,
    content: "示例内容：直接给 1 个数据对比 + 1 个做法，不绕背景，避免信息稀释。",
  },
  {
    id: "demo-cta",
    label: "结尾 CTA",
    tone: "danger" as const,
    content: "示例内容：结尾明确一句“主页有完整模板，照着改就行”，把动作说死。",
  },
];

function EmptyReasonBlock({ data }: { data: ScriptBreakdownData }) {
  const reasonText = data.state === "fallback" ? "已拿到原始文案，但还没有结构化拆解结果。" : "当前没有上传文案，暂时无法生成真实拆解。";

  return (
    <div className="rounded-xl border border-dashed border-stone-200 bg-white p-4">
      <div className="flex items-center gap-2 text-[13px] font-medium text-stone-900">
        <FileSearch className="size-4 stroke-[1.5] text-stone-500" />
        为什么这里没有真实内容
      </div>
      <p className="mt-2 text-[13px] leading-[1.7] text-stone-500">{reasonText}</p>
      {data.rawText ? (
        <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
          <div className="mb-1 text-[12px] font-medium uppercase tracking-[0.25em] text-stone-500">当前拿到的原始文案</div>
          <p className="text-[13px] leading-[1.7] text-stone-700">{data.rawText}</p>
        </div>
      ) : null}
    </div>
  );
}

function DemoReferenceBlock() {
  return (
    <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[13px] font-medium text-stone-900">
          <Lightbulb className="size-4 stroke-[1.5] text-stone-900" />
          示例拆解参考
        </div>
        <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[12px] font-medium uppercase tracking-[0.25em] text-stone-500">
          示例内容
        </span>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {DEMO_SEGMENTS.map((segment) => (
          <div key={segment.id} className="rounded-xl border border-stone-200 bg-white p-3">
            <Badge className={cn("rounded-lg border px-2.5 py-1 text-[12px] font-medium", toneMap[segment.tone])} variant="outline">
              {segment.label}
            </Badge>
            <p className="mt-3 text-[13px] leading-[1.7] text-stone-700">{segment.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScriptBreakdown({
  title,
  data,
  onSegmentSelect,
}: {
  title: string;
  data: ScriptBreakdownData;
  onSegmentSelect?: (payload: { startSec?: number | null; endSec?: number | null }) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const maxVisibleSegments = 4;
  const isStructured = data.state === "structured";
  const hasMoreSegments = isStructured && data.segments.length > maxVisibleSegments;
  const visibleSegments =
    isStructured && !expanded ? data.segments.slice(0, maxVisibleSegments) : isStructured ? data.segments : [];

  return (
    <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-stone-200" />
            <span className="text-[12px] font-medium uppercase tracking-[0.25em] text-stone-500">Script Breakdown</span>
            <div className="h-px flex-1 bg-stone-200" />
          </div>
          <h2 className="text-[24px] font-medium tracking-tight text-stone-900">{title}</h2>
          <p className="text-[13px] leading-[1.7] text-stone-500">先看开头、中段、结尾分别出了什么问题，再决定文案怎么改。</p>
        </div>

        {isStructured ? (
          <>
            <motion.div variants={containerVariants} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-40px" }} className="grid gap-3 md:grid-cols-2">
              {visibleSegments.map((segment) => (
                <motion.button
                  key={segment.id}
                  type="button"
                  variants={itemVariants}
                  onClick={() => onSegmentSelect?.({ startSec: segment.startSec, endSec: segment.endSec })}
                  className="rounded-xl border border-stone-200 bg-white p-4 text-left transition-[background-color,color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-[1px] hover:shadow-sm active:translate-y-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Badge className={cn("rounded-full border px-2.5 py-1 text-[12px] font-medium", toneMap[segment.tone as SegmentTone])} variant="outline">
                      {segment.label}
                    </Badge>
                    {segment.startSec !== undefined || segment.endSec !== undefined ? (
                      <span className="text-[12px] tabular-nums text-stone-500">
                        {segment.startSec ?? 0}s - {segment.endSec ?? "--"}s
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-[13px] leading-[1.7] text-stone-700">{segment.content}</p>
                </motion.button>
              ))}
            </motion.div>

            {hasMoreSegments ? (
              <div className="flex justify-center">
                <Button type="button" variant="outline" size="sm" className="h-9 px-4" onClick={() => setExpanded((prev) => !prev)}>
                  {expanded ? (
                    <>
                      <ChevronUp className="size-4 stroke-[1.5]" />
                      收起
                    </>
                  ) : (
                    <>
                      <ChevronDown className="size-4 stroke-[1.5]" />
                      展开剩余 {data.segments.length - maxVisibleSegments} 段
                    </>
                  )}
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <div className="grid gap-3">
            <EmptyReasonBlock data={data} />
            <DemoReferenceBlock />
          </div>
        )}

        {!isStructured ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-stone-200 bg-white px-3 py-2 text-[12px] text-stone-500">
            <Sparkles className="size-3.5 stroke-[1.5]" />
            这里展示的是示例拆解格式，真实上传后会按同样结构输出。
          </div>
        ) : null}
      </div>
  );
}
