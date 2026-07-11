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
      <DialogContent className="sm:max-w-4xl bg-white p-6 rounded-2xl border border-stone-200">
        <DialogHeader>
          <DialogTitle className="text-[18px] font-medium text-stone-900">
            稿件案例详情
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {/* 主内容区：有截图时采用左右分栏，无截图时仅单栏 */}
          {item.screenshot_paths.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-6">
              {/* 左侧：截图凭证大缩略图 */}
              <div className="space-y-2">
                <label className="text-[12px] font-medium text-stone-500">
                  截图凭证 ({item.screenshot_paths.length})
                </label>
                <div className="space-y-2">
                  {/* 首张作为主图展示，高亮预览 */}
                  <div
                    onClick={() => handleViewScreenshot(0)}
                    className="group relative aspect-[10/16] w-full overflow-hidden rounded-xl bg-stone-50 border border-stone-200 cursor-pointer"
                  >
                    <img
                      src={`/api/violations/screenshot/${encodeURI(item.screenshot_paths[0])}`}
                      alt="凭证主图"
                      className="h-full w-full object-cover object-top transition-transform duration-350 group-hover:scale-102"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-stone-900/30 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      <Eye className="size-6 text-white" />
                    </div>
                  </div>
                  {/* 如果有多张图，在下方平铺展示小缩略图 */}
                  {item.screenshot_paths.length > 1 && (
                    <div className="grid grid-cols-4 gap-1.5">
                      {item.screenshot_paths.map((path, idx) => (
                        <div
                          key={path}
                          onClick={() => handleViewScreenshot(idx)}
                          className="group relative aspect-square overflow-hidden rounded-md bg-stone-50 border border-stone-200 cursor-pointer"
                        >
                          <img
                            src={`/api/violations/screenshot/${encodeURI(path)}`}
                            alt={`截图缩略 ${idx + 1}`}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 右侧：话术文案 */}
              <div className="space-y-2 flex flex-col h-full">
                <label className="text-[12px] font-medium text-stone-500">
                  话术文案
                </label>
                <div className="relative flex-1 rounded-xl bg-stone-50 p-4 text-[13px] leading-[1.6] text-stone-700 min-h-[260px] max-h-[440px] overflow-y-auto border border-stone-200/50">
                  <p className="whitespace-pre-wrap pr-8">{item.script_text}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="absolute top-2 right-2 hover:bg-stone-200/50 h-8 rounded-lg"
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
            </div>
          ) : (
            /* 无截图模式：保持单栏，文案占满宽度 */
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[12px] font-medium text-stone-500">
                  话术文案
                </label>
                <div className="relative rounded-xl bg-stone-50 p-4 text-[13px] leading-[1.6] text-stone-700 max-h-[360px] overflow-y-auto border border-stone-200/50">
                  <p className="whitespace-pre-wrap pr-8">{item.script_text}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="absolute top-2 right-2 hover:bg-stone-200/50 h-8 rounded-lg"
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
              <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-stone-200 text-[12px] text-stone-500 bg-stone-50/50">
                <ImageIcon className="mr-1.5 size-4" />
                该作品暂未上传截图凭证
              </div>
            </div>
          )}

          {/* 属性元数据：一行三个 (sm:grid-cols-3) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-3 gap-x-6 py-4 border-y border-stone-200/60 text-[12px]">
            <div className="flex items-center gap-2 text-stone-500 min-w-0">
              <User className="size-4 text-stone-500 shrink-0" />
              <span className="shrink-0">提交成员：</span>
              <span className="font-medium text-stone-700 truncate">
                {item.submitted_by_name}
              </span>
            </div>
            <div className="flex items-center gap-2 text-stone-500 min-w-0">
              <Calendar className="size-4 text-stone-500 shrink-0" />
              <span className="shrink-0">发布时间：</span>
              <span className="text-stone-700 truncate">
                {formatShortDate(item.approved_at)}
              </span>
            </div>
            <div className="flex items-center gap-2 text-stone-500 min-w-0">
              <span className="size-1.5 rounded-full bg-stone-400 shrink-0" />
              <span className="shrink-0">关联账号：</span>
              <span className="font-medium text-stone-700 truncate" title={item.account_name_snapshot ?? "未关联账号"}>
                {item.account_name_snapshot ?? "未关联账号"}
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
