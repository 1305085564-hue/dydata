"use client";

import { useEffect, useState, useMemo } from "react";
import { useAiConfig } from "../hooks/use-ai-config";
import { useAvailabilityReport } from "../hooks/use-availability";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { Loader2, ArrowLeft, Sparkles, Search } from "lucide-react";

interface AddKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (keyId: string) => void;
}

export function AddKeyDialog({
  open,
  onOpenChange,
  onSuccess,
}: AddKeyDialogProps) {
  const { bundle, runCommand } = useAiConfig();
  const report = useAvailabilityReport(bundle);

  const [step, setStep] = useState<"input" | "explore">("input");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");

  const [probing, setProbing] = useState(false);
  const [saving, setSaving] = useState(false);

  // 探测到的模型列表
  const [discoveredModelIds, setDiscoveredModelIds] = useState<string[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [modelSearch, setModelSearch] = useState("");

  // 业务正在用的模型集合（用于自动勾选）
  const inUseModelIds = useMemo(() => {
    const set = new Set<string>();
    if (report?.businessAssurances) {
      for (const b of report.businessAssurances) {
        if (b.selectedModelId) set.add(b.selectedModelId);
      }
    }
    if (report?.globalDefaultModelId) {
      set.add(report.globalDefaultModelId);
    }
    return set;
  }, [report]);

  useEffect(() => {
    if (open) {
      setStep("input");
      setBaseUrl("");
      setApiKey("");
      setLabel("");
      setDiscoveredModelIds([]);
      setSelectedModelIds(new Set());
      setModelSearch("");
    }
  }, [open]);

  // 步骤 1：获取模型
  const handleProbeModels = async () => {
    const trimmedUrl = baseUrl.trim();
    const trimmedKey = apiKey.trim();

    if (!trimmedUrl) {
      feedbackToast.error("请填写 API 接口地址");
      return;
    }
    if (!trimmedKey) {
      feedbackToast.error("请填写 API Key 密钥");
    }

    setProbing(true);
    try {
      const res = await runCommand("probe_provider_models", {
        base_url: trimmedUrl,
        api_key: trimmedKey,
      });

      if (res.ok) {
        const body = res.body as {
          modelIds?: string[];
        };
        const ids = body.modelIds || [];

        setDiscoveredModelIds(ids);

        // 自动勾上正在被业务或全局默认使用的模型（与 modelIds 取交集）
        const autoSelected = new Set<string>();
        for (const id of ids) {
          if (inUseModelIds.has(id)) {
            autoSelected.add(id);
          }
        }
        setSelectedModelIds(autoSelected);
        setStep("explore");
        feedbackToast.success(`成功探测到 ${ids.length} 个上游可用模型`);
      } else {
        feedbackToast.error(res.error || "获取上游模型失败，请检查地址和密钥");
      }
    } finally {
      setProbing(false);
    }
  };

  // 步骤 2：提交保存
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await runCommand(
        "create",
        {
          base_url: baseUrl.trim(),
          api_key: apiKey.trim(),
          label: label.trim() || undefined,
          selected_model_ids: Array.from(selectedModelIds),
        },
        "key"
      );

      if (res.ok) {
        feedbackToast.success("渠道接入成功！");
        onOpenChange(false);
        const createdKeyId = (res.body as { key?: { id: string } })?.key?.id;
        if (createdKeyId && onSuccess) onSuccess(createdKeyId);
      } else {
        feedbackToast.error(res.error || "保存渠道失败");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedModelIds(new Set(discoveredModelIds));
    } else {
      setSelectedModelIds(new Set());
    }
  };

  const handleToggleModel = (id: string, checked: boolean) => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // 过滤后的模型
  const filteredModelIds = useMemo(() => {
    if (!modelSearch.trim()) return discoveredModelIds;
    const q = modelSearch.toLowerCase().trim();
    return discoveredModelIds.filter((id) => id.toLowerCase().includes(q));
  }, [discoveredModelIds, modelSearch]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col overflow-hidden rounded-2xl border border-[#E2E2DF] bg-white p-6 shadow-claude-dialog w-[94vw] sm:w-[680px] sm:max-w-[680px] max-h-[88vh]">
        <DialogHeader className="border-b border-[#E2E2DF]/60 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            {step === "explore" && (
              <Button
                variant="ghost"
                size="icon-s"
                onClick={() => setStep("input")}
                className="size-7 text-[#78716C] mr-1"
                title="返回修改配置"
              >
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <DialogTitle className="text-[20px] text-[#141413]">
              {step === "input" ? "接入新渠道" : "勾选供应模型"}
            </DialogTitle>
          </div>
          <p className="text-[12px] text-[#78716C]">
            {step === "input"
              ? "填入服务商 API 接口地址与密钥，系统将自动识别上游提供的模型。"
              : `已探测到 ${discoveredModelIds.length} 个模型，请勾选本渠道需要提供给系统调度的模型。`}
          </p>
        </DialogHeader>

        <DialogBody className="min-h-0 flex-1 space-y-4 overflow-y-auto py-3">
          {step === "input" ? (
            <div className="space-y-4">
              {/* 1. API 接口地址 */}
              <div className="space-y-2">
                <Label htmlFor="channel-base-url" className="text-[12px] text-[#1F1E1D]">
                  API 接口地址 (Base URL) <span className="text-status-danger">*</span>
                </Label>
                <Input
                  id="channel-base-url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1 或中转商地址"
                  className="h-8 text-[12px] font-mono border-[#E2E2DF]"
                />
                <p className="text-[12px] text-[#78716C]">
                  系统会自动根据地址归类接入点；若已接入过相同地址，将自动归入同一组。
                </p>
              </div>

              {/* 2. API Key */}
              <div className="space-y-2">
                <Label htmlFor="channel-api-key" className="text-[12px] text-[#1F1E1D]">
                  API Key 密钥 <span className="text-status-danger">*</span>
                </Label>
                <Input
                  id="channel-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="h-8 text-[12px] font-mono border-[#E2E2DF]"
                />
              </div>

              {/* 3. 渠道名称（选填） */}
              <div className="space-y-2">
                <Label htmlFor="channel-label" className="text-[12px] text-[#1F1E1D]">
                  渠道名称 (选填)
                </Label>
                <Input
                  id="channel-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="例如：主通道、备用-硅基流动（留空则使用地址主机名）"
                  className="h-8 text-[12px] border-[#E2E2DF]"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* 工具条：全选与搜索 */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all-models"
                    checked={
                      selectedModelIds.size > 0 &&
                      selectedModelIds.size === discoveredModelIds.length
                    }
                    onCheckedChange={(checked) => handleToggleSelectAll(Boolean(checked))}
                    className="size-4 rounded-md"
                  />
                  <Label htmlFor="select-all-models" className="text-[12px] text-[#1F1E1D] cursor-pointer">
                    全选 ({selectedModelIds.size}/{discoveredModelIds.length})
                  </Label>
                </div>

                <div className="relative min-w-[200px]">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-[#78716C]" />
                  <Input
                    value={modelSearch}
                    onChange={(e) => setModelSearch(e.target.value)}
                    placeholder="筛选模型..."
                    className="h-7 pl-7 text-[12px] border-[#E2E2DF]"
                  />
                </div>
              </div>

              {/* 模型列表 */}
              <div className="divide-y divide-[#E2E2DF]/60 rounded-xl border border-[#E2E2DF] bg-white max-h-[360px] overflow-y-auto">
                {filteredModelIds.length === 0 ? (
                  <div className="p-8 text-center text-[12px] text-[#78716C]">
                    未找到匹配的模型
                  </div>
                ) : (
                  filteredModelIds.map((id) => {
                    const isSelected = selectedModelIds.has(id);
                    const isInUse = inUseModelIds.has(id);

                    return (
                      <div
                        key={id}
                        className="p-2.5 flex items-center justify-between gap-3 hover:bg-[#F7F7F6]/60 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Checkbox
                            id={`model-${id}`}
                            checked={isSelected}
                            onCheckedChange={(checked) => handleToggleModel(id, Boolean(checked))}
                            className="size-4 rounded-md"
                          />
                          <Label
                            htmlFor={`model-${id}`}
                            className="text-[12px] font-mono text-[#141413] cursor-pointer truncate"
                          >
                            {id}
                          </Label>
                        </div>

                        {isInUse && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-[#D97757]/10 px-1.5 py-0.5 text-[12px] text-[#D97757] shrink-0">
                            <Sparkles className="size-2.5" />
                            业务在用 · 推荐勾选
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </DialogBody>

        <DialogFooter className="border-t border-[#E2E2DF]/60 pt-3 shrink-0 flex items-center justify-between sm:justify-between">
          <Button
            variant="outline"
            size="s"
            onClick={() => onOpenChange(false)}
            className="h-8 text-[12px] border-[#E2E2DF] text-[#1F1E1D]"
          >
            取消
          </Button>

          {step === "input" ? (
            <Button
              size="s"
              disabled={probing}
              onClick={handleProbeModels}
              className="h-8 px-4 text-[12px] bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal shadow-input"
            >
              {probing ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  正在连接上游…
                </>
              ) : (
                "获取模型"
              )}
            </Button>
          ) : (
            <Button
              size="s"
              disabled={saving}
              onClick={handleSave}
              className="h-8 px-4 text-[12px] bg-[#D97757] hover:bg-[#D97757]/90 text-white font-normal shadow-input"
            >
              {saving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  正在保存…
                </>
              ) : (
                `保存渠道 (已选 ${selectedModelIds.size} 个模型)`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
