"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { VIOLATION_EVENT_TYPES } from "@/lib/conversion-hub/types";
import type { ViolationAccount } from "../types";
import { renderAccountLabel } from "../format";
import type { WizardFormData } from "../types";

const APPEAL_OPTIONS: Array<WizardFormData["appealStatus"]> = [
  "未申诉",
  "申诉成功",
  "申诉失败",
];

interface StepViolationDetailProps {
  data: Pick<
    WizardFormData,
    | "accountId"
    | "eventType"
    | "occurredAt"
    | "platformNotice"
    | "appealStatus"
    | "appealText"
  >;
  onChange: (data: Partial<WizardFormData>) => void;
  accounts: ViolationAccount[];
}

export function StepViolationDetail({
  data,
  onChange,
  accounts,
}: StepViolationDetailProps) {
  const showAppealText = data.appealStatus !== "未申诉";

  return (
    <div className="space-y-5">
      {/* Account */}
      <div className="space-y-2">
        <Label className="text-[12px] font-normal text-stone-500">
          被处罚的账号 <span className="text-[#C9604D]">*</span>
        </Label>
        <Select
          value={data.accountId}
          onValueChange={(value) => value && onChange({ accountId: value })}
        >
          <SelectTrigger className="h-11 w-full rounded-xl border border-stone-200 bg-stone-50 text-[13px] focus:border-stone-500 focus:bg-white focus:shadow-sm focus:ring-1 focus:ring-stone-900/5">
            <SelectValue placeholder="选择账号">
              {data.accountId === "none" || !data.accountId
                ? "选择账号"
                : (() => {
                    const idx = accounts.findIndex((a) => a.id === data.accountId);
                    return idx >= 0
                      ? renderAccountLabel(accounts[idx], idx, accounts.length)
                      : "选择账号";
                  })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {accounts.map((account, index) => (
              <SelectItem key={account.id} value={account.id}>
                {renderAccountLabel(account, index, accounts.length)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Event type */}
      <div className="space-y-2">
        <Label className="text-[12px] font-normal text-stone-500">
          处罚类型 <span className="text-[#C9604D]">*</span>
        </Label>
        <div className="flex flex-wrap gap-2">
          {VIOLATION_EVENT_TYPES.map((type) => {
            const active = data.eventType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => onChange({ eventType: type })}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors active:translate-y-0",
                  active
                    ? "border-[#D97757]/40 text-[#D97757]"
                    : "border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700",
                )}
              >
                {type}
              </button>
            );
          })}
        </div>
      </div>

      {/* Date + Appeal status */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="occurred_at" className="text-[12px] font-normal text-stone-500">
            发生时间 <span className="text-[#C9604D]">*</span>
          </Label>
          <Input
            id="occurred_at"
            type="datetime-local"
            value={data.occurredAt}
            onChange={(e) => onChange({ occurredAt: e.target.value })}
            className="h-11 rounded-xl border border-stone-200 bg-stone-50 text-[13px] focus:border-stone-500 focus:bg-white focus:shadow-sm focus:ring-1 focus:ring-stone-900/5"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[12px] font-normal text-stone-500">
            申诉状态 <span className="text-[#C9604D]">*</span>
          </Label>
          <Select
            value={data.appealStatus}
            onValueChange={(value) =>
              value && onChange({ appealStatus: value as WizardFormData["appealStatus"] })
            }
          >
            <SelectTrigger className="h-11 w-full rounded-xl border border-stone-200 bg-stone-50 text-[13px] focus:border-stone-500 focus:bg-white focus:shadow-sm focus:ring-1 focus:ring-stone-900/5">
              <SelectValue>{data.appealStatus}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {APPEAL_OPTIONS.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Appeal text (conditional) */}
      <AnimatePresence initial={false}>
        {showAppealText && (
          <motion.div
            key="appeal_text"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-2 pt-1">
              <Label htmlFor="appeal_text" className="text-[12px] font-normal text-stone-500">
                申诉话术 <span className="text-[#C9604D]">*</span>
              </Label>
              <Textarea
                id="appeal_text"
                rows={3}
                value={data.appealText}
                onChange={(e) => onChange({ appealText: e.target.value })}
                placeholder="把你提交申诉时写的内容原封不动贴进来"
                className="rounded-xl border border-stone-200 bg-stone-50 text-[13px] leading-[1.6] focus:border-stone-500 focus:bg-white focus:shadow-sm focus:ring-1 focus:ring-stone-900/5"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Platform notice */}
      <div className="space-y-2">
        <Label htmlFor="platform_notice" className="text-[12px] font-normal text-stone-500">
          平台通知文本 <span className="text-[#C9604D]">*</span>
        </Label>
        <Textarea
          id="platform_notice"
          rows={4}
          value={data.platformNotice}
          onChange={(e) => onChange({ platformNotice: e.target.value })}
          placeholder={
            showAppealText
              ? "粘贴平台对你申诉的最终回复（成功/失败的原文）"
              : "粘贴平台发来的处罚原文通知"
          }
          className="rounded-xl border border-stone-200 bg-stone-50 text-[13px] leading-[1.6] focus:border-stone-500 focus:bg-white focus:shadow-sm focus:ring-1 focus:ring-stone-900/5"
        />
        <p className="text-[12px] text-stone-500">
          这是判违规的最硬证据，没有通知文本审核会被驳回。
        </p>
      </div>
    </div>
  );
}
