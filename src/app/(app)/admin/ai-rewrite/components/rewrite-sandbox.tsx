"use client";

import { useState } from "react";
import { Sparkles, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface RewriteSandboxProps {
  activeConfigName?: string;
  activeConfigType?: string;
}

export function RewriteSandbox({ activeConfigName, activeConfigType = "配置" }: RewriteSandboxProps) {
  const [inputText, setInputText] = useState("");
  const [outputText, setOutputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleTest = () => {
    if (!inputText.trim()) return;
    
    setIsLoading(true);
    setOutputText("");
    
    // Mock processing delay
    setTimeout(() => {
      setOutputText(
        "【重写示例】这是根据您当前的配置参数生成的改写结果。\n\n在真实的业务逻辑接通前，此区域用于预览配置对文案输出的结构和风格影响。\n\n如果您调整了左侧的运行规则、固定套餐或真实路线，测试结果将会相应改变。"
      );
      setIsLoading(false);
    }, 2000);
  };

  return (
    <div className="sticky top-24 flex h-[calc(100vh-8rem)] flex-col rounded-3xl border border-white/60 bg-[linear-gradient(160deg,rgba(255,255,255,0.7)0%,rgba(240,244,250,0.6)100%)] p-6 shadow-[var(--shadow-card)] backdrop-blur-2xl">
      <div className="mb-6 flex items-center justify-between border-b border-border/40 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-primary)_0%,var(--color-primary-light)_100%)] text-white shadow-sm">
            <Sparkles className="size-4" />
          </div>
          <h3 className="text-base font-semibold tracking-tight text-[var(--color-text-primary)]">沙盒测试</h3>
        </div>
        
        {activeConfigName && (
          <div className="flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-medium text-primary shadow-sm">
            <span>当前{activeConfigType}:</span>
            <span className="font-bold">{activeConfigName}</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-hidden">
        <div className="flex flex-1 flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">输入文案</label>
          <Textarea 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="输入需要改写的测试文案..."
            className="flex-1 resize-none rounded-2xl border-border/60 bg-white/60 p-4 text-sm shadow-inner focus-visible:bg-white"
          />
        </div>

        <div className="flex justify-center py-2">
          <Button 
            onClick={handleTest}
            disabled={!inputText.trim() || isLoading}
            className="h-10 w-full rounded-2xl bg-[linear-gradient(135deg,var(--color-primary)_0%,var(--color-primary-light)_100%)] font-semibold shadow-md transition-all hover:opacity-90 disabled:opacity-50 sm:w-auto sm:min-w-[140px]"
          >
            {isLoading ? (
              <Loader2 className="mr-2 size-4 animate-spin text-white" />
            ) : (
              <>
                试跑改写
                <ArrowRight className="ml-2 size-4" />
              </>
            )}
          </Button>
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <label className="text-xs font-bold uppercase tracking-widest text-[var(--color-text-tertiary)]">输出预览</label>
          <div className="flex-1 rounded-2xl border border-border/60 bg-white p-4 text-sm text-[var(--color-text-secondary)] shadow-inner overflow-y-auto">
            {isLoading ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="size-8 animate-spin text-primary/40" />
                <p className="text-xs font-medium uppercase tracking-widest">AI 思考中...</p>
              </div>
            ) : outputText ? (
              <div className="whitespace-pre-wrap leading-relaxed text-[var(--color-text-primary)]">
                {outputText}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground/60">
                点击试跑改写按钮查看结果
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
