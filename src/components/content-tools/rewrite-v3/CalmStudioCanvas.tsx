'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Copy, Quote, Check, X, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { diffWords, type DiffToken } from './diff-helper';
import { splitIntoParagraphs, type DocumentParagraph, type Revision } from './useRewriteV3Logic';

interface CalmStudioCanvasProps {
  paragraphs: DocumentParagraph[];
  polishedText: string;
  isSending: boolean;
  generatingParagraphIds: string[];
  streamingPatchText: string;
  selectedRevisionId: string | null;
  revisions: Revision[];
  diffMode: 'vs-latest' | 'vs-previous';
  showDiffInLatest: boolean;
  onParagraphEdit: (id: string, content: string) => void;
  onReferSelection: (text: string | null) => void;
  onInputChange: (text: string) => void;
}

interface FloatingSelectionBar {
  text: string;
  rect: DOMRect;
  paragraphId: string;
  paragraphIndex: number;
}

export function CalmStudioCanvas({
  paragraphs,
  polishedText,
  isSending,
  generatingParagraphIds,
  streamingPatchText,
  selectedRevisionId,
  revisions,
  diffMode,
  showDiffInLatest,
  onParagraphEdit,
  onReferSelection,
  onInputChange,
}: CalmStudioCanvasProps) {
  const [hoveredParagraphId, setHoveredParagraphId] = useState<string | null>(null);
  const [editingParagraphId, setEditingParagraphId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [copiedParagraphId, setCopiedParagraphId] = useState<string | null>(null);

  // 划选改写浮条状态
  const [floatingBar, setFloatingBar] = useState<FloatingSelectionBar | null>(null);
  const [copiedSelection, setCopiedSelection] = useState(false);
  const canvasScrollRef = useRef<HTMLDivElement>(null);

  // 1. 监听全局点击与滚动，及时隐藏划选浮动条
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const barEl = document.getElementById('text-selection-floating-bar');
      if (barEl && !barEl.contains(e.target as Node)) {
        setFloatingBar(null);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const handleCanvasScroll = () => {
    if (floatingBar) {
      setFloatingBar(null);
    }
  };

  // 2. 处理划选选区检测
  const handleTextMouseUp = (e: React.MouseEvent, paragraphId: string, paragraphIndex: number) => {
    if (editingParagraphId) return;
    // 稍作延时以等待 DOM 选区解析就绪
    setTimeout(() => {
      if (document.activeElement?.tagName === 'TEXTAREA') {
        setFloatingBar(null);
        return;
      }
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setFloatingBar(null);
        return;
      }
      const selectedText = selection.toString().trim();
      if (!selectedText) {
        setFloatingBar(null);
        return;
      }

      try {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();

        // 校验选区是否落在当前段落之内
        let node: Node | null = range.commonAncestorContainer;
        let isInsideParagraph = false;
        while (node) {
          if (node.nodeType === Node.ELEMENT_NODE && (node as Element).getAttribute('data-paragraph-id') === paragraphId) {
            isInsideParagraph = true;
            break;
          }
          node = node.parentNode;
        }

        if (isInsideParagraph) {
          setFloatingBar({
            text: selectedText,
            rect,
            paragraphId,
            paragraphIndex,
          });
          setCopiedSelection(false);
        } else {
          setFloatingBar(null);
        }
      } catch (err) {
        setFloatingBar(null);
      }
    }, 15);
  };

  // 3. 解析要显示的段落列表
  const completedRevisions = revisions
    .filter((r) => r.status === 'completed')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const latestRevision = completedRevisions.at(-1);
  const isViewingHistory = selectedRevisionId && selectedRevisionId !== latestRevision?.id;
  const activeRevision = isViewingHistory
    ? revisions.find((r) => r.id === selectedRevisionId)
    : latestRevision;

  // 用来进行 Diff 对比的对比源版本
  let comparisonRevision: Revision | undefined;
  if (isViewingHistory && activeRevision) {
    if (diffMode === 'vs-latest') {
      comparisonRevision = latestRevision;
    } else {
      const idx = completedRevisions.findIndex((r) => r.id === activeRevision.id);
      if (idx > 0) {
        comparisonRevision = completedRevisions[idx - 1];
      }
    }
  } else if (!isViewingHistory && showDiffInLatest && completedRevisions.length > 1) {
    // 正常模式下开启修订模式，默认对比上一个已完成版本
    comparisonRevision = completedRevisions.at(-2);
  }

  // 将内容按段落准备好展示
  let displayParagraphs: Array<{ id: string; content: string; isAbortedShadow?: boolean; sourceType?: string }> = [];

  if (isViewingHistory && activeRevision) {
    const splitTexts = splitIntoParagraphs(activeRevision.fullContent || '');
    displayParagraphs = splitTexts.map((text: string, idx: number) => ({
      id: `history-${activeRevision.id}-${idx}`,
      content: text,
      sourceType: activeRevision.sourceType,
    }));
  } else {
    if (isSending && generatingParagraphIds.length === 0) {
      const splitTexts = splitIntoParagraphs(polishedText);
      displayParagraphs = splitTexts.map((text: string, idx: number) => {
        const originalP = paragraphs[idx];
        return {
          id: originalP?.paragraphId || `stream-${idx}`,
          content: text,
          sourceType: 'ai',
        };
      });
    } else {
      displayParagraphs = paragraphs.map((p) => {
        const isPatching = generatingParagraphIds.includes(p.paragraphId);
        return {
          id: p.paragraphId,
          content: isPatching ? streamingPatchText || p.content : p.content,
          isAbortedShadow: p.isAbortedShadow,
          sourceType: p.sourceType,
        };
      });
    }
  }

  // 一键复制代码
  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedParagraphId(id);
    setTimeout(() => setCopiedParagraphId(null), 1500);
  };

  // 双击进入人手编辑
  const handleDoubleClick = (id: string, content: string) => {
    if (isSending || isViewingHistory) return;

    // 捕获双击时的选区字符偏移量，以便在挂载后定位光标 (“从落点出来”)
    let selStart = content.length;
    let selEnd = content.length;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      selStart = range.startOffset;
      selEnd = range.endOffset;
    }

    setEditingParagraphId(id);
    setEditContent(content);
    setFloatingBar(null); // 双击编辑时关闭划选

    // 在 textarea 挂载后的微任务执行中，将选区还原到 input 中
    setTimeout(() => {
      const textarea = document.querySelector(`textarea[data-editing-para="${id}"]`) as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(selStart, selEnd);
      }
    }, 0);
  };

  // 保存人手编辑
  const handleSaveEdit = (id: string) => {
    onParagraphEdit(id, editContent);
    setEditingParagraphId(null);
  };

  // 引用至左侧对话框
  const handleQuote = (index: number, content: string) => {
    onReferSelection(content);
    onInputChange(`【针对第 ${index + 1} 段】 `);
    const textarea = document.querySelector('textarea');
    if (textarea) {
      (textarea as HTMLTextAreaElement).focus();
    }
  };

  return (
    <div
      ref={canvasScrollRef}
      onScroll={handleCanvasScroll}
      className="flex-1 flex flex-col min-h-0 bg-white relative select-text"
    >
      {/* 阅览区域 */}
      <div className="flex-1 overflow-y-auto px-10 py-10 space-y-6">
        {displayParagraphs.map((para, index) => {
          const isPatching = generatingParagraphIds.includes(para.id);
          const isTemporarilyDimmed = isSending && generatingParagraphIds.length > 0 && !isPatching;

          const isLastStreamingPara =
            isSending && generatingParagraphIds.length === 0 && index === displayParagraphs.length - 1;

          const isAbortedShadow = para.isAbortedShadow;
          const isEditing = editingParagraphId === para.id;

          // Diff 对比计算
          let diffTokens: DiffToken[] | null = null;
          if ((isViewingHistory || showDiffInLatest) && comparisonRevision && activeRevision) {
            const compTexts = splitIntoParagraphs(comparisonRevision.fullContent || '');
            const compText = compTexts[index] || '';
            diffTokens = diffWords(compText, para.content);
          }

          return (
            <div
              key={para.id}
              data-paragraph-id={para.id}
              onMouseUp={(e) => handleTextMouseUp(e, para.id, index)}
              className={cn(
                'group relative rounded-lg transition-all duration-300 px-4 py-3 border border-transparent',
                // 1. 系统临时暗化
                isTemporarilyDimmed && 'opacity-25 transition-opacity duration-300',
                // 2. 生成中的段落：带有呼吸高亮
                isPatching && 'bg-amber-500/[0.03] border-amber-500/20 ring-1 ring-amber-500/10 shadow-sm animate-pulse',
                // 3. 全局生成流式最后段落（打字重叠）
                isLastStreamingPara && 'border-l-2 border-amber-500 pl-3 bg-amber-500/[0.02]',
                // 4. 中断的影子：物理降灰 60%
                isAbortedShadow && 'opacity-60 saturate-50 select-none pointer-events-none',
                // Hover 态微弱反馈
                !isSending && !isViewingHistory && !isEditing && 'hover:bg-stone-50/50 hover:border-stone-200/30'
              )}
              onMouseEnter={() => !isSending && !isViewingHistory && setHoveredParagraphId(para.id)}
              onMouseLeave={() => setHoveredParagraphId(null)}
            >

              {/* 手工编辑状态 */}
              {isEditing ? (
                <div className="relative w-full z-15">
                  <textarea
                    value={editContent}
                    data-editing-para={para.id}
                    onChange={(e) => {
                      setEditContent(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = `${e.target.scrollHeight}px`;
                    }}
                    ref={(el) => {
                      if (el) {
                        el.style.height = 'auto';
                        el.style.height = `${el.scrollHeight}px`;
                      }
                    }}
                    onBlur={() => handleSaveEdit(para.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        handleSaveEdit(para.id);
                      } else if (e.key === 'Escape') {
                        setEditingParagraphId(null);
                      }
                    }}
                    className="w-full text-[13px] leading-relaxed tracking-wide text-stone-800 bg-transparent border-0 p-0 outline-none focus:ring-0 resize-none font-sans overflow-hidden"
                    placeholder="编辑段落内容..."
                    autoFocus
                  />
                </div>
              ) : (
                /* 正常显示文本状态 */
                <div
                  onDoubleClick={() => handleDoubleClick(para.id, para.content)}
                  className={cn(
                    'text-[13px] leading-relaxed tracking-wide whitespace-pre-wrap transition-colors text-stone-800',
                    isViewingHistory && 'text-stone-700'
                  )}
                  title={!isSending && !isViewingHistory ? '双击可编辑该段落' : undefined}
                >
                  {diffTokens ? (
                    diffTokens.map((token, tIdx) => {
                      if (token.type === 'added') {
                        return (
                          <ins
                            key={tIdx}
                            className="bg-emerald-50 text-emerald-700 no-underline border-b border-emerald-300 px-0.5 rounded"
                          >
                            {token.value}
                          </ins>
                        );
                      }
                      if (token.type === 'removed') {
                        return (
                          <del
                            key={tIdx}
                            className="bg-rose-50 text-rose-600 line-through decoration-rose-300 px-0.5 rounded opacity-80"
                          >
                            {token.value}
                          </del>
                        );
                      }
                      return <span key={tIdx}>{token.value}</span>;
                    })
                  ) : (
                    para.content || <span className="text-stone-300 italic select-none">此段内容为空</span>
                  )}
                </div>
              )}

              {/* Hover 时浮现的极简 Magic Action Bar */}
              {hoveredParagraphId === para.id && !isEditing && (
                <div className="absolute right-3 top-[-14px] flex items-center bg-white border border-stone-200/70 p-0.5 rounded-lg shadow-md z-20 animate-in fade-in slide-in-from-bottom-1 duration-150 select-none text-[12px]">
                  {/* 1. 引用到对话 */}
                  <button
                    onClick={() => handleQuote(index, para.content)}
                    className="rounded-lg p-1 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
                    title="引用此段至对话微调"
                  >
                    <Quote className="h-3 w-3 rotate-180" />
                  </button>

                  {/* 2. 复制 */}
                  <button
                    onClick={() => handleCopy(para.id, para.content)}
                    className="relative rounded-lg p-1 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800"
                    title="复制此段"
                  >
                    <Copy className="h-3 w-3" />
                    {copiedParagraphId === para.id && (
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-stone-900 text-white text-[9px] px-1 rounded shadow-sm whitespace-nowrap">
                        已复制
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {/* 骨架屏 */}
        {isSending && generatingParagraphIds.length === 0 && displayParagraphs.length === 0 && (
          <div className="space-y-4 py-4">
            <div className="h-4 bg-stone-100 rounded-lg w-3/4 animate-pulse" />
            <div className="h-4 bg-stone-100 rounded-lg w-5/6 animate-pulse [animation-delay:150ms]" />
            <div className="h-4 bg-stone-100 rounded-lg w-2/3 animate-pulse [animation-delay:300ms]" />
          </div>
        )}
      </div>

      {/* 4. 划选文字悬浮 Action Bar (工业级原位体验) */}
      {floatingBar && (
        <div
          id="text-selection-floating-bar"
          style={{
            position: 'fixed',
            left: `${floatingBar.rect.left + floatingBar.rect.width / 2}px`,
            top: `${floatingBar.rect.top - 42}px`,
            transform: 'translateX(-50%)',
          }}
          className="flex items-center gap-1 bg-stone-900/95 backdrop-blur-md text-white p-0.5 rounded-lg shadow-xl z-50 animate-in fade-in slide-in-from-bottom-1.5 duration-150 select-none border border-stone-800/60"
        >
          <button
            onClick={() => {
              onReferSelection(floatingBar.text);
              onInputChange(`【针对第 ${floatingBar.paragraphIndex + 1} 段选区】 `);
              const textarea = document.querySelector('textarea');
              if (textarea) {
                (textarea as HTMLTextAreaElement).focus();
              }
              setFloatingBar(null);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 hover:bg-stone-800 rounded-lg text-[12px] font-bold text-stone-100 transition-colors"
          >
            <Quote className="h-3 w-3 rotate-180 text-stone-400" />
            <span>引用选区改写</span>
          </button>
          <div className="w-[1px] h-3 bg-stone-800" />
          <button
            onClick={() => {
              navigator.clipboard.writeText(floatingBar.text);
              setCopiedSelection(true);
              setTimeout(() => setFloatingBar(null), 1000);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 hover:bg-stone-800 rounded-lg text-[12px] font-bold text-stone-100 transition-colors"
          >
            <Copy className="h-3 w-3 text-stone-400" />
            <span>{copiedSelection ? '已复制' : '复制'}</span>
          </button>
        </div>
      )}

      {/* 底部浮标 */}
      {isViewingHistory && activeRevision && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-lg flex items-center gap-2.5 z-40 backdrop-blur-md shadow-lg animate-in slide-in-from-bottom-2 duration-300">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0" />
          <div className="text-[12px] text-amber-800 font-semibold">
            正在阅览历史版本 (由 {activeRevision.sourceType === 'fork' ? 'Fork' : activeRevision.sourceType === 'user_edit' ? '人手修改' : 'AI生成'} 创建于 {new Date(activeRevision.createdAt).toLocaleTimeString()})
          </div>
        </div>
      )}
    </div>
  );
}
