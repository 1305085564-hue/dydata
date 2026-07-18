'use client';

import React, { useEffect } from 'react';
import { Calendar, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Revision, DiffMode } from './useRewriteV3Logic';

interface TimelineDiffProps {
  revisions: Revision[];
  selectedRevisionId: string | null;
  diffMode: DiffMode;
  onSelectRevision: (id: string | null) => void;
  onSelectDiffMode: (mode: DiffMode) => void;
  onAdoptRevision: (id: string, content: string) => void;
}

function formatRevisionTime(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

export function TimelineDiff({
  revisions,
  selectedRevisionId,
  diffMode,
  onSelectRevision,
  onSelectDiffMode,
  onAdoptRevision,
}: TimelineDiffProps) {
  // 过滤出 completed 状态的 revision
  const completedRevisions = revisions
    .filter((r) => r.status === 'completed')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const latestRevision = completedRevisions.at(-1);
  const isViewingLatest = !selectedRevisionId || selectedRevisionId === latestRevision?.id;

  const currentSelectedRevision = completedRevisions.find((r) => r.id === selectedRevisionId) || latestRevision;

  // 监听 Option / Alt 快捷键，按下时自动切换 Diff 模式
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) {
        onSelectDiffMode('vs-previous');
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.altKey) {
        onSelectDiffMode('vs-latest');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [onSelectDiffMode]);

  if (completedRevisions.length <= 1) {
    return null; // 单个版本或无版本时不展示时间轴
  }

  return (
    <div className="shrink-0 bg-white/70 backdrop-blur-md border-b border-stone-200 px-5 py-2.5 flex items-center justify-between z-30 h-[48px] select-none">
      <div className="flex items-center gap-4 max-w-[70%] min-w-0">
        {/* 中文化时光机眉题及引导说明 */}
        <div className="flex items-center gap-1.5 shrink-0 select-none">
          <Calendar className="h-3.5 w-3.5 text-stone-500" />
          <span className="text-[12px] font-medium text-stone-700 font-sans tracking-wide">
            版本时光机
          </span>
          <span className="text-[12px] font-medium text-stone-500 hidden sm:inline">
            (点击圆点回溯)
          </span>
        </div>

        {/* 离散时间轴容器（底盘轨道线穿过珍珠） */}
        <div className="relative flex-1 flex items-center min-w-0 overflow-x-auto scrollbar-none py-1">
          {/* 底盘贯穿轨道线：纯色、无透明度 */}
          <div className="absolute left-4 right-4 h-0 border-t border-dashed border-stone-200 pointer-events-none z-0" />

          {/* 珍珠节点列表：gap-3 物理隔离 */}
          <div className="relative flex items-center gap-3 z-10">
            {completedRevisions.map((rev, index) => {
              const isSelected = selectedRevisionId ? rev.id === selectedRevisionId : rev.id === latestRevision?.id;
              const isAi = rev.sourceType === 'ai_generation' || rev.sourceType === 'paragraph_patch';
              const wordCount = rev.fullContent?.length ?? 0;
              const createTime = formatRevisionTime(rev.createdAt);

              return (
                <button
                  key={rev.id}
                  onClick={() => onSelectRevision(rev.id === latestRevision?.id ? null : rev.id)}
                  className="group relative h-8.5 w-8.5 shrink-0 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5F82A8]/40"
                >
                  {/* 外围 2px 选中导轨 (Selected 状态) */}
                  <span
                    className={cn(
                      'h-4.5 w-4.5 rounded-full flex items-center justify-center border-2 transition-all duration-150 group-hover:scale-105',
                      isSelected ? 'border-[#5F82A8]' : 'border-transparent'
                    )}
                  >
                    {/* 内围核心圆点 (AI 实心、人手空心；选中统一石青，未选中统一灰阶) */}
                    <span
                      className={cn(
                        'rounded-full transition-all duration-150',
                        isAi
                          ? // AI 版本：实心形态
                            cn(
                              'h-2.5 w-2.5',
                              isSelected
                                ? 'bg-[#5F82A8]'
                                : 'bg-stone-300 group-hover:bg-stone-400'
                            )
                          : // 人手版本：空心环形态
                            cn(
                              'h-2.5 w-2.5 border-2 bg-white',
                              isSelected
                                ? 'border-[#5F82A8]'
                                : 'border-stone-300 group-hover:border-stone-400'
                            )
                      )}
                    />
                  </span>

                  {/* 悬浮 CSS Tooltip 浮窗 */}
                  <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 opacity-0 pointer-events-none group-hover:opacity-100 transition-all duration-150 delay-150 z-50 bg-stone-900/95 backdrop-blur text-white text-[12px] p-2 rounded-lg shadow-xl whitespace-nowrap leading-normal font-sans">
                    <div className="flex items-center gap-1.5 font-medium">
                      <span className={cn('h-1.5 w-1.5 rounded-full', isAi ? 'bg-amber-400' : 'bg-sky-400')} />
                      <span>第 {index + 1} 版 {isSelected && '(当前预览)'}</span>
                    </div>
                    <div className="text-[12px] text-stone-500 mt-0.5 flex gap-2">
                      <span>方式: {isAi ? 'AI 改写' : '手工编辑'}</span>
                      <span>时间: {createTime}</span>
                      <span>字数: {wordCount} 字</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 右侧：微型模式切换器 + 基于此版本继续 */}
      <div className="flex items-center gap-3 shrink-0">
        {!isViewingLatest && (
          <div className="flex items-center gap-1 rounded-lg border border-stone-200/50 bg-stone-100/50 p-0.5">
            <button
              onClick={() => onSelectDiffMode('vs-latest')}
              className={cn(
                'px-2 py-0.5 text-[12px] font-medium rounded-lg transition-all active:scale-[0.98]',
                diffMode === 'vs-latest'
                  ? 'bg-white text-stone-900 shadow-sm border border-stone-200/20'
                  : 'text-stone-500 hover:text-stone-900'
              )}
              title="对比所选版本与当前最新版本"
            >
              对比最新
            </button>
            <button
              onClick={() => onSelectDiffMode('vs-previous')}
              className={cn(
                'px-2 py-0.5 text-[12px] font-medium rounded-lg transition-all active:scale-[0.98]',
                diffMode === 'vs-previous'
                  ? 'bg-white text-stone-900 shadow-sm border border-stone-200/20'
                  : 'text-stone-500 hover:text-stone-900'
              )}
              title="对比所选版本与它的前一版 (按住 Alt / Option 临时切换)"
            >
              对比前版
            </button>
          </div>
        )}

        {/* 基于此版本继续 */}
        {!isViewingLatest && currentSelectedRevision && (
          <button
            onClick={() => onAdoptRevision(currentSelectedRevision.id, currentSelectedRevision.fullContent || '')}
            className="inline-flex items-center gap-1 bg-[#D97757] text-white hover:bg-[#C96442] font-medium text-[12px] px-2.5 py-1 rounded-lg shadow-sm shadow-[#D97757]/20 transition-all duration-200 active:scale-[0.98]"
            title="以当前预览的历史版本文字为基准，拉出分支继续对话改写"
          >
            <RotateCcw className="h-3 w-3 shrink-0" />
            <span>基于此版继续</span>
          </button>
        )}
      </div>
    </div>
  );
}
