import { MapPinned } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AiFeatureGroupSection } from "./ai-features-client";

type AIFeaturesNavCardsProps = {
  featureGroups: AiFeatureGroupSection[];
};

export function AIFeaturesNavCards({ featureGroups }: AIFeaturesNavCardsProps) {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="glass-card-static border-white/70 bg-white/78 backdrop-blur-[16px]">
        <CardHeader>
          <CardTitle className="font-semibold tracking-tight">这页现在怎么用</CardTitle>
          <CardDescription className="mt-1">
            先按业务区找功能，再看它服务哪个页面和哪一段输出，最后再改渠道、模型和专属提示词。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-white/70 bg-white/82 p-4">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">1. 先找功能区</p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">成长分析、内容工具、OCR、后台助手分别看，不再混成一列。</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/82 p-4">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">2. 再看前台位置</p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">growth 相关说明已对齐第二批区块名，方便知道它到底在页面哪一段生效。</p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/82 p-4">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">3. 最后改专属提示词</p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">每个功能项都有单独提示词入口，避免一套 prompt 到处复用。</p>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card-static border-white/70 bg-white/78 backdrop-blur-[16px]">
        <CardHeader>
          <CardTitle className="font-semibold tracking-tight">功能区导航</CardTitle>
          <CardDescription className="mt-1">跳到对应业务区，直接改这一组功能。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {featureGroups.map((section) => (
            <a
              key={section.group}
              href={`#group-${section.group}`}
              className="flex items-center justify-between rounded-2xl border border-white/75 bg-white/80 px-3 py-3 text-sm text-[var(--color-text-secondary)] transition hover:-translate-y-px hover:border-primary/20 hover:text-[var(--color-text-primary)]"
            >
              <div>
                <p className="font-medium text-[var(--color-text-primary)]">{section.group}</p>
                <p className="text-xs text-[var(--color-text-secondary)]">{section.features.length} 个功能</p>
              </div>
              <MapPinned className="size-4 text-[var(--color-text-tertiary)]" />
            </a>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
