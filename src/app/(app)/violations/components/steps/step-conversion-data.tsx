"use client";

import { useEffect, useMemo } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  PLATFORMS,
  calcConversionRate,
  resolveConfidence,
  type Platform,
} from "@/lib/case-library/confidence";
import type { WizardFormData } from "../types";

interface StepConversionDataProps {
  data: Pick<WizardFormData, "platforms" | "viewsInput" | "followsInput">;
  onChange: (data: Partial<WizardFormData>) => void;
}

/** 数字滚动过渡 — easeOutExpo 风格的 spring */
function MotionNumber({
  value,
  format,
  className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const motionVal = useMotionValue(value);
  const spring = useSpring(motionVal, {
    stiffness: 220,
    damping: 28,
    mass: 0.6,
  });
  const display = useTransform(spring, (v) => format(v));

  useEffect(() => {
    motionVal.set(value);
  }, [motionVal, value]);

  return <motion.span className={className}>{display}</motion.span>;
}

export function StepConversionData({ data, onChange }: StepConversionDataProps) {
  const { platforms, viewsInput, followsInput } = data;

  const viewsNumber = useMemo(() => {
    const n = Number(viewsInput);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }, [viewsInput]);

  const followsNumber = useMemo(() => {
    const n = Number(followsInput);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }, [followsInput]);

  const conversionRate = useMemo(
    () => calcConversionRate(viewsNumber, followsNumber),
    [viewsNumber, followsNumber],
  );

  const confidence = useMemo(() => resolveConfidence(viewsNumber), [viewsNumber]);
  const followsExceedsViews = followsNumber > viewsNumber && viewsNumber > 0;

  function togglePlatform(platform: Platform) {
    const next = platforms.includes(platform)
      ? platforms.length === 1
        ? platforms
        : platforms.filter((p) => p !== platform)
      : [...platforms, platform];
    onChange({ platforms: next });
  }

  return (
    <div className="space-y-6">
      {/* Views + Follows */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="conv_views" className="text-[12px] font-normal text-stone-500">
            流量 <span className="text-[#B24E3E]">*</span>
            <span className="ml-1 text-[12px] font-normal text-stone-500">播放/曝光</span>
          </Label>
          <Input
            id="conv_views"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={viewsInput}
            onChange={(e) => onChange({ viewsInput: e.target.value })}
            placeholder="例如 30000"
            autoFocus
            className="h-14 rounded-xl border border-stone-200 bg-stone-50 text-[13px] font-normal tabular-nums text-stone-700 placeholder:text-[13px] placeholder:font-normal placeholder:text-stone-500 focus:border-stone-500 focus:bg-white focus:shadow-sm focus:ring-1 focus:ring-stone-900/5"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="conv_follows" className="text-[12px] font-normal text-stone-500">
            导粉 <span className="text-[#B24E3E]">*</span>
            <span className="ml-1 text-[12px] font-normal text-stone-500">没涨粉填 0</span>
          </Label>
          <Input
            id="conv_follows"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={followsInput}
            onChange={(e) => onChange({ followsInput: e.target.value })}
            placeholder="例如 180"
            className={cn(
              "h-14 rounded-xl border border-stone-200 bg-stone-50 text-[13px] font-normal tabular-nums text-stone-700 placeholder:text-[13px] placeholder:font-normal placeholder:text-stone-500 focus:border-stone-500 focus:bg-white focus:shadow-sm focus:ring-1 focus:ring-stone-900/5",
              followsExceedsViews && "border-[#C9604D]/40 bg-white",
            )}
          />
          {followsExceedsViews ? (
            <p className="text-[12px] text-[#B24E3E]">导粉数不能大于流量</p>
          ) : null}
        </div>
      </div>

      {/* Conversion rate + Confidence */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-10">
        <div>
          <p className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
            转化率
          </p>
          <p className="mt-2 flex items-baseline gap-1 leading-none tabular-nums">
            {conversionRate === null ? (
              <span className="text-[18px] font-medium text-stone-500">—</span>
            ) : (
              <>
                <MotionNumber
                  value={conversionRate * 100}
                  format={(n) => n.toFixed(2)}
                  className="text-[24px] font-semibold tabular-nums text-stone-900"
                />
                <span className="text-[12px] font-normal text-stone-500">%</span>
              </>
            )}
          </p>
          <p className="mt-1.5 text-[12px] text-stone-500">导粉 ÷ 流量</p>
        </div>
        <div className="sm:flex-1">
          <p className="text-[12px] font-normal tracking-[0.12em] text-stone-500">
            置信度
          </p>
          <div className="mt-2 inline-flex items-center gap-2">
            <motion.span
              className="size-2 rounded-full"
              animate={{ backgroundColor: confidence.toneHex }}
              transition={{ duration: 0.3 }}
              aria-hidden
            />
            <motion.span
              className="text-[13px] font-medium tabular-nums"
              animate={{ color: confidence.toneHex }}
              transition={{ duration: 0.3 }}
            >
              {confidence.label}
            </motion.span>
          </div>
          <p className="mt-1.5 text-[12px] text-stone-500">{confidence.hint}</p>
        </div>
      </div>

      {/* Platforms */}
      <div className="space-y-2">
        <Label className="text-[12px] font-normal text-stone-500">
          平台 <span className="text-[#B24E3E]">*</span>
          <span className="ml-2 text-[12px] font-normal text-stone-500">可多选 · 默认抖音</span>
        </Label>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((platform) => {
            const active = platforms.includes(platform);
            return (
              <motion.button
                key={platform}
                type="button"
                onClick={() => togglePlatform(platform)}
                aria-pressed={active}
                whileTap={{ scale: 0.96 }}
                transition={{ type: "spring", stiffness: 380, damping: 24 }}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors",
                  active
                    ? "border-[#D97757]/40 bg-[#D97757]/10 text-[#B4532F]"
                    : "border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700",
                )}
              >
                {platform}
              </motion.button>
            );
          })}
        </div>
      </div>

      <p className="text-[12px] text-stone-500">
        高置信 ≥ 5 万 / 中置信 ≥ 2.5 万 / 低置信 ≥ 1.5 万 / 1.5 万以下样本不足
      </p>
    </div>
  );
}
