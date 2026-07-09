"use client";

import { useState } from "react";
import { AlertTriangle, Check, CornerDownLeft, FileCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { feedbackToast } from "@/components/ui/feedback-toast";
import { cn } from "@/lib/utils";

interface DataEnrichmentPanelProps {
  caseId: string;
  caseDetail: any;
  onProcessed: () => void;
  onClose: () => void;
}

const emotionTags = ["焦虑", "痛点", "理智", "兴奋", "期待", "好奇", "反差", "恐慌"];
const scenarioTags = ["职场", "社交", "搞钱", "副业", "相亲", "育儿", "读书", "日常"];
const categoryTags = ["投顾服务", "训练营", "一对一咨询", "会员社群", "公开课", "电子书"];

export function DataEnrichmentPanel({
  caseId,
  caseDetail,
  onProcessed,
  onClose,
}: DataEnrichmentPanelProps) {
  const [hookText, setHookText] = useState(caseDetail.hook_text || "");
  const [adminInsight, setAdminInsight] = useState(caseDetail.admin_conclusion || caseDetail.admin_insight || "");
  const [bodyText, setBodyText] = useState(caseDetail.body_text || caseDetail.script_text || "");
  const [ctaText, setCtaText] = useState(caseDetail.cta_text || "");
  const [originalVideoId, setOriginalVideoId] = useState(caseDetail.original_video_id || "");

  // Taxonomy tags state
  const [selectedEmotions, setSelectedEmotions] = useState<string[]>(
    caseDetail.taxonomy?.emotion || []
  );
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>(
    caseDetail.taxonomy?.scenario || []
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    caseDetail.taxonomy?.product_category || []
  );

  // Request supplement status
  const [showSupplementForm, setShowSupplementForm] = useState(false);
  const [supplementReason, setSupplementReason] = useState("");
  const [missingFields, setMissingFields] = useState<string[]>(["screenshot"]);
  const [submitting, setSubmitting] = useState(false);

  const toggleTag = (list: string[], setList: (v: string[]) => void, tag: string) => {
    if (list.includes(tag)) {
      setList(list.filter((t) => t !== tag));
    } else {
      setList([...list, tag]);
    }
  };

  const handleEnrichVerify = async () => {
    if (!hookText.trim()) {
      feedbackToast.error("请提取钩子文案 (hook_text)");
      return;
    }
    if (!adminInsight.trim()) {
      feedbackToast.error("请填写系统级总结洞察 (admin_insight)");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/case-library/knowledge-cases/${caseId}/enrich-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hook_text: hookText.trim(),
          body_text: bodyText.trim() || null,
          cta_text: ctaText.trim() || null,
          admin_insight: adminInsight.trim(),
          original_video_id: originalVideoId.trim() || null,
          taxonomy: {
            emotion: selectedEmotions,
            scenario: selectedScenarios,
            product_category: selectedCategories,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "富化升库失败");
      feedbackToast.success("案例已成功富化并Verified入库");
      onProcessed();
    } catch (e) {
      feedbackToast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestSupplement = async () => {
    if (!supplementReason.trim()) {
      feedbackToast.error("请输入索要凭证的具体原因");
      return;
    }
    if (missingFields.length === 0) {
      feedbackToast.error("请至少选择一项需要补充的凭证");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/case-library/knowledge-cases/${caseId}/request-supplement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: supplementReason.trim(),
          missing_fields: missingFields,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "打回失败");
      feedbackToast.success("已成功打回并向员工索要凭证");
      onProcessed();
    } catch (e) {
      feedbackToast.error(e instanceof Error ? e.message : "打回失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl overflow-hidden text-left">
      {/* Title */}
      <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCheck className="size-4.5 text-[#D97757]" />
          <h2 className="text-sm font-semibold text-stone-800">黄金知识沉淀台 (Data Enrichment Desk)</h2>
        </div>
        <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-50 transition-colors">
          <X className="size-4" />
        </button>
      </div>

      {/* Workspace scroll area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 min-h-0">
        
        {/* Original Script */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest">原始脚本文案</span>
          <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-4 font-mono text-[12px] leading-relaxed text-stone-700 whitespace-pre-wrap max-h-[120px] overflow-y-auto">
            {caseDetail.script_text}
          </div>
        </div>

        {!showSupplementForm ? (
          <>
            {/* Enrichment Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-stone-500 uppercase tracking-widest">
                  钩子文案 (hook_text) <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={hookText}
                  onChange={(e) => setHookText(e.target.value)}
                  className="w-full min-h-[64px] rounded-xl border border-stone-200 p-3 text-[12px] leading-relaxed text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-[#D97757]"
                  placeholder="提取视频前 3 秒吸引人点入的黄金钩子..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-stone-500 uppercase tracking-widest">
                  系统级总结洞察 (admin_insight) <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={adminInsight}
                  onChange={(e) => setAdminInsight(e.target.value)}
                  className="w-full min-h-[64px] rounded-xl border border-stone-200 p-3 text-[12px] leading-relaxed text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-[#D97757]"
                  placeholder="总结本条案例的核心数据高转化原因及可复用方法论..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-stone-500 uppercase tracking-widest">主体文案 (body_text)</label>
                <textarea
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  className="w-full min-h-[64px] rounded-xl border border-stone-200 p-3 text-[12px] leading-relaxed text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-[#D97757]"
                  placeholder="视频主体论证或价值交付段落..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-stone-500 uppercase tracking-widest">引导文案 (cta_text)</label>
                <textarea
                  value={ctaText}
                  onChange={(e) => setCtaText(e.target.value)}
                  className="w-full min-h-[64px] rounded-xl border border-stone-200 p-3 text-[12px] leading-relaxed text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-[#D97757]"
                  placeholder="结尾引导点赞关注、私信或加粉丝群的话术..."
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-stone-500 uppercase tracking-widest">关联原始视频 UUID (original_video_id)</label>
              <input
                type="text"
                value={originalVideoId}
                onChange={(e) => setOriginalVideoId(e.target.value)}
                className="w-full h-9 rounded-xl border border-stone-200 px-3 text-[12px] text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-[#D97757]"
                placeholder="若本话术来源于某条批改视频，可填入其 UUID"
              />
            </div>

            {/* Taxonomy Tag Pillars */}
            <div className="space-y-3.5 pt-2 border-t border-stone-100">
              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest">情感分类 (Emotion)</span>
                <div className="flex flex-wrap gap-1.5">
                  {emotionTags.map((tag) => {
                    const active = selectedEmotions.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(selectedEmotions, setSelectedEmotions, tag)}
                        className={cn(
                          "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors active:scale-95",
                          active
                            ? "border-[#D97757]/40 bg-[#D97757]/5 text-[#D97757]"
                            : "border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:text-stone-700"
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest">场景分类 (Scenario)</span>
                <div className="flex flex-wrap gap-1.5">
                  {scenarioTags.map((tag) => {
                    const active = selectedScenarios.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(selectedScenarios, setSelectedScenarios, tag)}
                        className={cn(
                          "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors active:scale-95",
                          active
                            ? "border-[#D97757]/40 bg-[#D97757]/5 text-[#D97757]"
                            : "border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:text-stone-700"
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-widest">产品品类 (Product Category)</span>
                <div className="flex flex-wrap gap-1.5">
                  {categoryTags.map((tag) => {
                    const active = selectedCategories.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(selectedCategories, setSelectedCategories, tag)}
                        className={cn(
                          "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors active:scale-95",
                          active
                            ? "border-[#D97757]/40 bg-[#D97757]/5 text-[#D97757]"
                            : "border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:text-stone-700"
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Request Supplement Panel */
          <div className="rounded-2xl border border-amber-200 bg-amber-50/20 p-5 space-y-4">
            <div className="flex items-start gap-2.5 text-xs text-amber-800 font-semibold uppercase tracking-wider">
              <AlertTriangle className="size-4.5 text-[#D99E55]" />
              向员工索要凭证 / 退回修改
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-stone-500 uppercase tracking-widest">打回具体原因说明</label>
              <textarea
                value={supplementReason}
                onChange={(e) => setSupplementReason(e.target.value)}
                className="w-full min-h-[80px] rounded-xl border border-stone-200 bg-white p-3 text-[12px] leading-relaxed text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-[#D97757]"
                placeholder="例如：请上传 24h 完播率或流量漏斗截图，以及本话术的使用效果反馈说明..."
              />
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-widest block">需要补充的缺省项</span>
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5 text-xs font-medium text-stone-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={missingFields.includes("screenshot")}
                    onChange={(e) => {
                      if (e.target.checked) setMissingFields([...missingFields, "screenshot"]);
                      else setMissingFields(missingFields.filter((f) => f !== "screenshot"));
                    }}
                    className="rounded border-stone-300 text-[#D97757] focus:ring-[#D97757] size-3.5"
                  />
                  完播/流量截图
                </label>
                <label className="flex items-center gap-1.5 text-xs font-medium text-stone-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={missingFields.includes("usage_metrics")}
                    onChange={(e) => {
                      if (e.target.checked) setMissingFields([...missingFields, "usage_metrics"]);
                      else setMissingFields(missingFields.filter((f) => f !== "usage_metrics"));
                    }}
                    className="rounded border-stone-300 text-[#D97757] focus:ring-[#D97757] size-3.5"
                  />
                  转化数据凭证
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                onClick={handleRequestSupplement}
                disabled={submitting}
                className="h-8 rounded-lg bg-[#C9604D] px-4 text-xs font-medium text-white hover:bg-[#B7513F] disabled:opacity-50"
              >
                确认打回并要求补交
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowSupplementForm(false)}
                className="h-8 rounded-lg border-stone-200 bg-white text-xs text-stone-600"
              >
                取消
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Footer bar */}
      {!showSupplementForm && (
        <div className="px-5 py-4 border-t border-stone-100 flex justify-between items-center bg-stone-50/50">
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-lg border-amber-200/60 bg-amber-50/30 text-xs text-amber-800 hover:bg-amber-50/60 hover:text-amber-900"
            onClick={() => setShowSupplementForm(true)}
          >
            打回并索要凭证
          </Button>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onClose}
              className="h-8 rounded-lg text-xs"
            >
              取消
            </Button>
            <Button
              size="sm"
              disabled={submitting}
              onClick={handleEnrichVerify}
              className="h-8 rounded-lg bg-[#D97757] text-xs text-white hover:bg-[#C96442] px-4"
            >
              {submitting ? "高光升库中..." : "确认富化并高光入库"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
