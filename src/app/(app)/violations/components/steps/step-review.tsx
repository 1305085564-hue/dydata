"use client";

import { ClipboardCopy } from "lucide-react";
import type { WizardFormData, ViolationAccount } from "../types";
import { renderAccountLabel } from "../format";
import {
  calcConversionRate,
  resolveConfidence,
} from "@/lib/case-library/confidence";

interface StepReviewProps {
  data: WizardFormData;
  accounts: ViolationAccount[];
}

export function StepReview({ data, accounts }: StepReviewProps) {
  const isViolation = data.submissionPath === "violation";

  const viewsNumber = Number.isFinite(Number(data.viewsInput))
    ? Math.floor(Number(data.viewsInput))
    : 0;
  const followsNumber = Number.isFinite(Number(data.followsInput))
    ? Math.floor(Number(data.followsInput))
    : 0;
  const conversionRate = calcConversionRate(viewsNumber, followsNumber);
  const confidence = resolveConfidence(viewsNumber);

  const accountLabel =
    data.accountId === "none" || !data.accountId
      ? "未选择"
      : (() => {
          const idx = accounts.findIndex((a) => a.id === data.accountId);
          return idx >= 0
            ? renderAccountLabel(accounts[idx], idx, accounts.length)
            : "未知账号";
        })();

  return (
    <div className="space-y-5">
      {/* Script text preview */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-[#D97757]" />
          <span className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
            话术原文
          </span>
        </div>
        <blockquote className="rounded-lg border-l-2 border-l-[#D97757]/40 bg-stone-50/60 p-4 text-[13px] leading-[1.7] text-stone-700">
          {data.script_text || "（未填写）"}
        </blockquote>
      </div>

      {/* Screenshots */}
      {data.screenshots.length > 0 ? (
        <div className="space-y-2">
          <span className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
            截图 ({data.screenshots.length} 张)
          </span>
          <div className="flex flex-wrap gap-2">
            {data.screenshots.map((s) => (
              <span
                key={s.path}
                className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[12px] text-stone-700"
              >
                {s.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Account */}
      <div className="grid grid-cols-2 gap-3 text-[13px]">
        <div>
          <span className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
            关联账号
          </span>
          <p className="mt-1 font-medium text-stone-700">{accountLabel}</p>
        </div>
        <div>
          <span className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
            提交类型
          </span>
          <p className="mt-1 font-medium text-stone-700">
            {isViolation ? "违规话术" : "转化话术"}
          </p>
        </div>
      </div>

      {/* Violation-specific */}
      {isViolation ? (
        <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <span className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
                处罚类型
              </span>
              <p className="mt-1 text-[13px] font-normal text-stone-700">{data.eventType}</p>
            </div>
            <div>
              <span className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
                发生时间
              </span>
              <p className="mt-1 text-[13px] font-normal tabular-nums text-stone-700">{data.occurredAt || "—"}</p>
            </div>
            <div>
              <span className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
                申诉状态
              </span>
              <p className="mt-1 text-[13px] font-normal text-stone-700">{data.appealStatus}</p>
            </div>
          </div>
          <div>
            <span className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
              平台通知文本
            </span>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-[1.7] text-stone-700">
              {data.platformNotice || "（未填写）"}
            </p>
          </div>
          {data.appealText ? (
            <div>
              <span className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
                申诉话术
              </span>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-[1.7] text-stone-700">
                {data.appealText}
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        /* Conversion-specific */
        <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <span className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
                流量
              </span>
              <p className="mt-1 text-[13px] font-normal tabular-nums text-stone-700">
                {viewsNumber.toLocaleString("zh-CN")}
              </p>
            </div>
            <div>
              <span className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
                导粉
              </span>
              <p className="mt-1 text-[13px] font-normal tabular-nums text-stone-700">
                {followsNumber.toLocaleString("zh-CN")}
              </p>
            </div>
            <div>
              <span className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
                转化率
              </span>
              <p className="mt-1 text-[13px] font-normal tabular-nums text-stone-700">
                {conversionRate === null
                  ? "—"
                  : `${(conversionRate * 100).toFixed(2)}%`}
              </p>
            </div>
            <div>
              <span className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
                置信度
              </span>
              <p className="mt-1 font-medium" style={{ color: confidence.toneHex }}>
                {confidence.label}
              </p>
            </div>
          </div>
          <div>
            <span className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
              平台
            </span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {data.platforms.map((p) => (
                <span
                  key={p}
                  className="rounded-lg border border-stone-200 px-2 py-0.5 text-[12px] text-stone-500"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Warning */}
      <div className="flex items-start gap-2 rounded-lg border border-[#D99E55]/30 bg-stone-50/60 p-3">
        <ClipboardCopy className="mt-0.5 size-4 shrink-0 text-[#8F641B]" />
        <p className="text-[12px] leading-5 text-stone-500">
          话术原文提交后不可修改，如需补充请在备注中追加。请确认以上信息无误后再提交。
        </p>
      </div>
    </div>
  );
}
