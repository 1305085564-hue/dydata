"use client";

import { useState } from "react";
import { Copy, Check, Calendar, User, Eye, ImageIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatShortDate } from "./format";
import type { ApprovedDraftItem } from "./types";

interface CaseDetailDialogProps {
  item: ApprovedDraftItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenLightbox: (paths: string[], index: number) => void;
}

export function CaseDetailDialog({
  item,
  open,
  onOpenChange,
  onOpenLightbox,
}: CaseDetailDialogProps) {
  const [copied, setCopied] = useState(false);
  if (!item) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(item.script_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignored */
    }
  };

  const handleViewScreenshot = (index: number) => {
    if (item.screenshot_paths.length > 0) {
      onOpenLightbox(item.screenshot_paths, index);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-white p-6 rounded-2xl border border-stone-200">
        <DialogHeader>
          <DialogTitle className="text-[16px] font-bold text-stone-800">
            稿件案例详情
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-5">
          {/* 文案内容展示 */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-stone-500">
              话术文案
            </label>
            <div className="relative rounded-xl bg-stone-50 p-4 text-[13px] leading-[1.6] text-stone-800">
              <p className="whitespace-pre-wrap">{item.script_text}</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="absolute top-2 right-2 hover:bg-stone-200/50"
              >
                {copied ? (
                  <>
                    <Check className="mr-1 size-3.5 text-[#6FAA7D]" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 size-3.5" />
                    复制
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* 属性元数据 */}
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-stone-100 p-3 bg-stone-50/20 text-[12px]">
            <div className="flex items-center gap-2 text-stone-600">
              <User className="size-4 text-stone-400" />
              <span>提交成员：</span>
              <span className="font-semibold text-stone-800">
                {item.submitted_by_name}
              </span>
            </div>
            <div className="flex items-center gap-2 text-stone-600">
              <Calendar className="size-4 text-stone-400" />
              <span>发布时间：</span>
              <span className="font-mono text-stone-800">
                {formatShortDate(item.approved_at)}
              </span>
            </div>
            <div className="col-span-2 flex items-center gap-2 text-stone-600">
              <span className="size-1.5 rounded-full bg-stone-400" />
              <span>关联账号：</span>
              <span className="font-medium text-stone-800">
                {item.account_name_snapshot ?? "未关联账号"}
              </span>
            </div>
          </div>

          {/* 截图凭证列表 */}
          <div className="space-y-2">
            <label className="text-[12px] font-medium text-stone-500">
              截图凭证 ({item.screenshot_paths.length})
            </label>
            {item.screenshot_paths.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {item.screenshot_paths.map((path, idx) => (
                  <div
                    key={path}
                    onClick={() => handleViewScreenshot(idx)}
                    className="group relative aspect-[16/10] overflow-hidden rounded-xl bg-stone-100 border border-stone-200 cursor-pointer"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/violations/screenshot/${encodeURI(path)}`}
                      alt={`截图 ${idx + 1}`}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-stone-900/30 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      <Eye className="size-5 text-white" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-stone-200 text-[12px] text-stone-400">
                <ImageIcon className="mr-1.5 size-4" />
                该作品暂未上传截图凭证
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
