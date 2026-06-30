'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Check, Copy, Eye, Edit3, Save, FileText, X, Quote, Sparkles, Scissors, MessageCircle, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { DocumentParagraph } from './useRewriteLogic';

interface PolishedDocumentCanvasProps {
  originalDraft: string;
  polishedText: string;
  isSending: boolean;
  paragraphs?: DocumentParagraph[];
  traceabilityMode?: boolean;
  generatingParagraphIds?: string[];
  streamingPatchText?: string;
  onTextChange: (text: string) => void;
  onInlinePatchSubmit?: (prompt: string, targetParagraphIds?: string[]) => void;
  onParagraphEdit?: (paragraphId: string, newContent: string) => void | Promise<void>;
  onReferSelection?: (text: string | null) => void;
  selectedParagraphIds?: string[];
  onParagraphSelectionChange?: (paragraphIds: string[], lastParagraphId: string | null) => void;
}

const renderSyntaxFadedBase = (text: string) => {
  const parts = text.split(/(\*\*|### |> |---|\* |`)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (['**', '### ', '> ', '---', '* ', '`'].includes(part)) {
          return <span key={index} className="text-zinc-300/60 font-light select-none">{part}</span>;
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
};

const renderParagraphRichText = (content: string) => {
  const text = content.trim();
  
  if (text.startsWith('### ')) {
    return <div className="text-[18px] font-bold tracking-tight text-zinc-900 mt-4 mb-2">{text.replace(/^###\s*/, '')}</div>;
  }
  
  if (text.startsWith('## ')) {
    return <div className="text-[20px] font-bold tracking-tight text-zinc-900 mt-6 mb-3 border-b border-zinc-100 pb-2">{text.replace(/^##\s*/, '')}</div>;
  }
 
  if (/^(\*\*|【|### |## )?(原版|修改前|原文|修改前：|原文：)(:|：|\*\*|】)?\s*/.test(text)) {
    const cleanContent = text.replace(/^(\*\*|【|### |## )?(原版|修改前|原文|修改前：|原文：)(:|：|\*\*|】)?\s*/, '').trim();
    return (
      <div className="p-4 my-2 bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-700 leading-[1.7]">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-[3px] h-3 bg-zinc-400 rounded-full" />
          <div className="text-[11px] font-bold text-zinc-500 tracking-widest uppercase">原版内容</div>
        </div>
        <div className="text-[14px] whitespace-pre-wrap opacity-90">{renderSyntaxFadedBase(cleanContent)}</div>
      </div>
    );
  }
  
  // Card for "修改后/润色后"
  if (/^(\*\*|【|### |## )?(修改后|润色后|现版|修改后：|润色后：)(:|：|\*\*|】)?\s*/.test(text)) {
    const cleanContent = text.replace(/^(\*\*|【|### |## )?(修改后|润色后|现版|修改后：|润色后：)(:|：|\*\*|】)?\s*/, '').trim();
    return (
      <div className="relative p-4 my-2 bg-white border border-zinc-200 border-l-[3px] border-l-[#6FAA7D] rounded-r-xl rounded-l-sm text-zinc-800 shadow-[0_1px_2px_rgba(0,0,0,0.04)] leading-[1.7]">
        <div className="text-[11px] font-bold text-[#6FAA7D] mb-2 tracking-widest uppercase flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" /> 修改后
        </div>
        <div className="text-[14.5px] whitespace-pre-wrap font-medium">{renderSyntaxFadedBase(cleanContent)}</div>
      </div>
    );
  }
 
  // Numbered lists (1. xxx or 1、xxx)
  const listMatch = text.match(/^(\d+)([\.、])\s*([\s\S]*)/);
  if (listMatch) {
    return (
      <div className="flex gap-3 my-2 leading-[1.7] group">
        <span className="text-[24px] font-serif font-black text-[#8AA8C7] shrink-0 mt-[-4px] opacity-80 group-hover:opacity-100 transition-opacity">{listMatch[1]}.</span>
        <div className="text-zinc-800 flex-1 whitespace-pre-wrap text-[14.5px] pt-0.5">{renderSyntaxFadedBase(listMatch[3])}</div>
      </div>
    );
  }
 
  // Normal text
  return <div className="text-zinc-800 leading-[1.75] my-3 text-[15px]">{renderSyntaxFadedBase(text)}</div>;
};

// DP-based sentence-level diff algorithm
function diffSentences(oldText: string, newText: string) {
  if (!oldText) {
    return [{ type: 'normal' as const, value: newText }];
  }
  // Split by sentences, clauses, or line breaks, keeping the separators in the array
  const oldSent = oldText.split(/([。！？\n])/).filter(Boolean);
  const newSent = newText.split(/([。！？\n])/).filter(Boolean);

  const dp: number[][] = Array(oldSent.length + 1)
    .fill(0)
    .map(() => Array(newSent.length + 1).fill(0));

  for (let i = 1; i <= oldSent.length; i++) {
    for (let j = 1; j <= newSent.length; j++) {
      if (oldSent[i - 1] === newSent[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: Array<{ type: 'added' | 'removed' | 'normal'; value: string }> = [];
  let i = oldSent.length;
  let j = newSent.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldSent[i - 1] === newSent[j - 1]) {
      result.push({ type: 'normal', value: oldSent[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'added', value: newSent[j - 1] });
      j--;
    } else {
      result.push({ type: 'removed', value: oldSent[i - 1] });
      i--;
    }
  }

  return result.reverse();
}

export function PolishedDocumentCanvas({
  originalDraft,
  polishedText,
  isSending,
  paragraphs = [],
  traceabilityMode = false,
  onTextChange,
  onInlinePatchSubmit,
  onParagraphEdit,
  generatingParagraphIds = [],
  streamingPatchText = '',
  onReferSelection,
  selectedParagraphIds = [],
  onParagraphSelectionChange,
}: PolishedDocumentCanvasProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(polishedText);
  const [showDiff, setShowDiff] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inlinePrompt, setInlinePrompt] = useState('');
  const [editingParagraphId, setEditingParagraphId] = useState<string | null>(null);
  const [microMenuState, setMicroMenuState] = useState<{
    show: boolean;
    x: number;
    y: number;
    text: string;
    paragraphId: string;
  } | null>(null);
  const [isPeeking, setIsPeeking] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Alt' || e.key === 'Option') {
        setIsPeeking(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt' || e.key === 'Option') {
        setIsPeeking(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const paragraphRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  useEffect(() => {
    if (generatingParagraphIds.length > 0) {
      const firstId = generatingParagraphIds[0];
      const el = paragraphRefs.current.get(firstId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [generatingParagraphIds]);

  // Sync editText when polishedText updates (e.g. streaming or conversation switch)
  useEffect(() => {
    setEditText(polishedText);
  }, [polishedText]);

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      // Position cursor at the end
      textareaRef.current.selectionStart = textareaRef.current.value.length;
      textareaRef.current.selectionEnd = textareaRef.current.value.length;
    }
  }, [isEditing]);

  const handleCopy = () => {
    if (!polishedText) return;
    navigator.clipboard.writeText(polishedText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleSaveEdit = () => {
    onTextChange(editText);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditText(polishedText);
    setIsEditing(false);
  };

  const handleEditTextChange = (val: string) => {
    setEditText(val);
  };

  const handleEditKeyDown = () => {
    // Left for future keyboard shortcuts if needed
  };

  const handleParagraphClick = (
    event: React.MouseEvent,
    paragraphId: string,
  ) => {
    if (editingParagraphId) return;
    const selectionText = window.getSelection()?.toString().trim();
    if (selectionText) return;

    event.stopPropagation();
    setMicroMenuState(null);

    const alreadySelected = selectedParagraphIds.includes(paragraphId);
    const shouldToggle = event.metaKey || event.ctrlKey;
    const nextIds = shouldToggle
      ? alreadySelected
        ? selectedParagraphIds.filter((id) => id !== paragraphId)
        : [...selectedParagraphIds, paragraphId]
      : [paragraphId];

    onParagraphSelectionChange?.(nextIds, paragraphId);
  };

  const submitParagraphPatch = (prompt: string, paragraphId: string) => {
    onInlinePatchSubmit?.(prompt, [paragraphId]);
    setMicroMenuState(null);
    setInlinePrompt('');
  };

  const handleDiffAction = (
    action: 'accept' | 'reject', 
    index: number, 
    allDiffs: Array<{ type: 'added' | 'removed' | 'normal'; value: string }>
  ) => {
    let newText = '';
    for (let i = 0; i < allDiffs.length; i++) {
      const diff = allDiffs[i];
      if (i === index) {
        if (diff.type === 'added' && action === 'accept') {
          newText += diff.value;
        } else if (diff.type === 'removed' && action === 'accept') {
          newText += diff.value;
        }
      } else {
        if (diff.type === 'added' || diff.type === 'normal') {
          newText += diff.value;
        }
      }
    }
    onTextChange(newText);
  };

  // Render text with diff markers
  const renderDiffContent = () => {
    const diffs = diffSentences(originalDraft, polishedText);
    return (
      <div className="whitespace-pre-wrap text-[14px] leading-[1.8] text-zinc-800 tracking-wide font-normal">
        {diffs.map((item, idx) => {
          if (item.type === 'added') {
            return (
              <span
                key={idx}
                className="group relative inline-block bg-[#6FAA7D]/10 text-[#4F7F5E] px-0.5 rounded font-medium border-b border-[#6FAA7D]/20 cursor-pointer"
              >
                {item.value}
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:flex items-center gap-0.5 rounded border border-zinc-200 bg-white p-0.5 shadow-sm z-10">
                  <button onClick={() => handleDiffAction('accept', idx, diffs)} className="rounded hover:bg-zinc-100 p-0.5 text-zinc-600" title="接受增加"><Check className="h-3 w-3"/></button>
                  <button onClick={() => handleDiffAction('reject', idx, diffs)} className="rounded hover:bg-zinc-100 p-0.5 text-zinc-600" title="拒绝增加 (删除)"><X className="h-3 w-3"/></button>
                </span>
              </span>
            );
          }
          if (item.type === 'removed') {
            return (
              <span
                key={idx}
                className="group relative inline-block bg-[#C9604D]/10 text-[#C9604D] line-through decoration-[#C9604D]/40 px-0.5 rounded cursor-pointer"
              >
                {item.value}
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:flex items-center gap-0.5 rounded border border-zinc-200 bg-white p-0.5 shadow-sm z-10">
                  <button onClick={() => handleDiffAction('accept', idx, diffs)} className="rounded hover:bg-zinc-100 p-0.5 text-zinc-600" title="接受删除 (恢复原文)"><Check className="h-3 w-3"/></button>
                  <button onClick={() => handleDiffAction('reject', idx, diffs)} className="rounded hover:bg-zinc-100 p-0.5 text-zinc-600" title="拒绝删除 (保持删除)"><X className="h-3 w-3"/></button>
                </span>
              </span>
            );
          }
          return <span key={idx}>{item.value}</span>;
        })}
      </div>
    );
  };

  const hasText = Boolean(polishedText.trim());
  const hasParagraphs = paragraphs.length > 0;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Canvas Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 px-6 bg-white/80 backdrop-blur-md z-20">
        <div className="flex items-center gap-2 pl-1">
          <FileText className="h-4.5 w-4.5 text-[#D97757]" />
          <span className="text-[14px] font-bold tracking-[0.05em] text-zinc-800 border-b-2 border-zinc-200 pb-[1px]">
            润色终稿画布
          </span>
        </div>

        {/* Toolbar Buttons */}
        {hasText && (
          <div className="flex items-center gap-0.5 bg-transparent p-0.5">
            {/* Peek Button */}
            {!isEditing && (
              <button
                type="button"
                onMouseDown={() => setIsPeeking(true)}
                onMouseUp={() => setIsPeeking(false)}
                onMouseLeave={() => setIsPeeking(false)}
                onTouchStart={() => setIsPeeking(true)}
                onTouchEnd={() => setIsPeeking(false)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-all cursor-pointer select-none',
                  isPeeking
                    ? 'bg-zinc-100/80 text-zinc-900'
                    : 'text-zinc-400 hover:bg-zinc-100/50 hover:text-zinc-700'
                )}
                title="按住看原稿 (快捷键: Alt/Option)"
              >
                <Eye className="h-3.5 w-3.5" />
                <span>对比</span>
              </button>
            )}

            {/* Diff Toggler */}
            {!isEditing && (
              <button
                type="button"
                onClick={() => setShowDiff(!showDiff)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-all',
                  showDiff
                    ? 'bg-zinc-100/80 text-zinc-900'
                    : 'text-zinc-400 hover:bg-zinc-100/50 hover:text-zinc-700'
                )}
                title={showDiff ? '关闭差异' : '显示修改差异'}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>差异</span>
              </button>
            )}

            <div className="w-px h-3.5 bg-zinc-200 mx-1" />

            {/* Copy Button */}
            {!isEditing && (
              <button
                type="button"
                onClick={handleCopy}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-all',
                  copied
                    ? 'text-[#4F7F5E] bg-[#6FAA7D]/10'
                    : 'text-zinc-400 hover:bg-zinc-100/50 hover:text-zinc-700'
                )}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? '已复制' : '复制'}</span>
              </button>
            )}

            {/* Edit Toggler */}
            {isEditing ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#D97757] px-3 text-[12px] font-medium text-white shadow-[0_2px_8px_rgba(217,119,87,0.25)] hover:bg-[#C96442] active:scale-95 transition-all"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>保存</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="inline-flex h-7 items-center justify-center rounded-md px-2.5 text-[12px] font-medium text-zinc-400 hover:bg-zinc-100/50 hover:text-zinc-700 transition-all"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-[12px] font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-800 transition-all"
              >
                <Edit3 className="h-3.5 w-3.5 text-zinc-400" />
                <span>进入编辑</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div 
        className="relative flex-1 min-h-0 overflow-y-auto bg-white"
        onClick={() => {
          if (window.getSelection()?.toString().trim() === '') {
            setMicroMenuState(null);
          }
        }}
      >
        {!hasText && !isSending ? (
          <div className="relative flex h-full w-full flex-col items-center justify-center text-center overflow-hidden">
            {/* 仪器卡尺感背景 */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-px h-full bg-zinc-100 absolute left-1/2 -translate-x-1/2" />
              <div className="h-px w-full bg-zinc-100 absolute top-1/2 -translate-y-1/2" />
              <div className="w-[320px] h-[320px] rounded-full border border-dashed border-zinc-200/50 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            {/* 中心微动几何体与克制文案 */}
            <div className="relative z-10 flex flex-col items-center gap-4">
              <div className="w-2 h-2 rounded-sm bg-zinc-300/50 rotate-45 animate-pulse" />
              <div className="space-y-1">
                <p className="text-[12px] uppercase tracking-[0.15em] font-medium text-zinc-500">
                  画布静默
                </p>
                <p className="text-[11px] text-zinc-400 tracking-wider">
                  左侧输入指令，即刻重塑文本
                </p>
              </div>
            </div>
          </div>
        ) : hasParagraphs ? (
          <div className="space-y-2 relative pb-32 w-full px-6 md:px-10 py-8">
            {paragraphs.map((paragraph) => {
              const isEditingCurrent = editingParagraphId === paragraph.paragraphId;
              const isGenerating = generatingParagraphIds.includes(paragraph.paragraphId);
              const isSelected = selectedParagraphIds.includes(paragraph.paragraphId);
              const traceColorClass =
                paragraph.sourceType === 'ai'
                  ? 'bg-[#6FAA7D]'
                  : paragraph.sourceType === 'user'
                    ? 'bg-[#D97757]'
                    : 'bg-zinc-300';
              return (
                <div
                  key={paragraph.id}
                  ref={(el) => {
                    if (el) paragraphRefs.current.set(paragraph.paragraphId, el);
                    else paragraphRefs.current.delete(paragraph.paragraphId);
                  }}
                  className={cn(
                    'group relative rounded-r-lg px-3 -mx-3 py-1.5 transition-[background-color,box-shadow] duration-150 hover:bg-zinc-50/70',
                    isSelected ? 'bg-[#8AA8C7]/10 shadow-[inset_2px_0_0_#8AA8C7]' : '',
                    isEditingCurrent ? 'bg-zinc-50/50' : '',
                    isGenerating ? 'animate-pulse bg-orange-50/30' : ''
                  )}
                  onClick={(event) => handleParagraphClick(event, paragraph.paragraphId)}
                >
                  {/* Active/Editing Anchor Line */}
                  {(isEditingCurrent || isSelected) && (
                    <div className="absolute left-[-16px] top-3 bottom-3 w-[2px] rounded-full bg-[#D97757]" />
                  )}

                  {/* Traceability Indicator */}
                  {traceabilityMode && (
                    <div className={cn('absolute left-[-16px] top-3 bottom-3 w-[2px] rounded-full', traceColorClass)} title={`来源: ${paragraph.sourceType}`} />
                  )}

                  <div 
                    className="whitespace-pre-wrap text-[14.5px] leading-[1.8] tracking-[0.02em] relative group/editor"
                    onDoubleClick={(e) => {
                      if (paragraph.isLocked) return;
                      e.stopPropagation();
                      setEditingParagraphId(paragraph.paragraphId);
                    }}
                    onMouseUp={() => {
                      if (isEditingCurrent) return;
                      const selection = window.getSelection();
                      const text = selection?.toString().trim();
                      if (text && text.length > 0) {
                        const rect = selection?.getRangeAt(0).getBoundingClientRect();
                        if (rect) {
                          setMicroMenuState({
                            show: true,
                            x: rect.left + rect.width / 2,
                            y: rect.top - 8,
                            text,
                            paragraphId: paragraph.paragraphId,
                          });
                        }
                      } else {
                        setMicroMenuState(null);
                      }
                    }}
                  >
                    {isEditingCurrent ? (
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        className="w-full outline-none min-h-[1.8em] text-zinc-800 bg-white border border-zinc-200 rounded-xl p-3 shadow-sm focus:ring-1 focus:ring-zinc-950/5 animate-in fade-in zoom-in-95 duration-100"
                        onBlur={(e) => {
                          const newContent = e.currentTarget.innerText || '';
                          if (newContent.trim() !== '' && newContent !== paragraph.content) {
                            onParagraphEdit?.(paragraph.paragraphId, newContent);
                          }
                          setEditingParagraphId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setEditingParagraphId(null);
                          }
                        }}
                        ref={(el) => {
                          if (el && document.activeElement !== el) {
                            el.innerText = paragraph.content;
                            el.focus();
                            // Move cursor to end
                            if (typeof window.getSelection !== 'undefined' && typeof document.createRange !== 'undefined') {
                              const range = document.createRange();
                              range.selectNodeContents(el);
                              range.collapse(false);
                              const sel = window.getSelection();
                              sel?.removeAllRanges();
                              sel?.addRange(range);
                            }
                          }
                        }}
                      />
                    ) : (
                      <div className={cn(paragraph.isLocked ? 'text-zinc-500' : 'text-zinc-800')}>
                        {isSelected && !isGenerating && (
                          <div className="mb-1.5 inline-flex items-center gap-1 rounded-md border border-[#8AA8C7]/30 bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#4F6F8D]">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#8AA8C7]" />
                            {paragraph.isLocked ? '已选中 · 段落锁定' : '已选中'}
                          </div>
                        )}
                        {isGenerating && generatingParagraphIds[0] === paragraph.paragraphId ? (
                          streamingPatchText
                            ? renderSyntaxFadedBase(streamingPatchText)
                            : <span className="text-zinc-300">正在改写这一段...</span>
                        ) : isGenerating && generatingParagraphIds[0] !== paragraph.paragraphId ? (
                          null // Hide other generating paragraphs as the first one will show the combined stream
                        ) : (
                          renderParagraphRichText(paragraph.content)
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}


          </div>
        ) : isSending && !polishedText ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <div className="flex space-x-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-[#D97757] animate-pulse [animation-delay:-0.3s]" />
              <div className="h-1.5 w-1.5 rounded-full bg-[#D97757] animate-pulse [animation-delay:-0.15s]" />
              <div className="h-1.5 w-1.5 rounded-full bg-[#D97757] animate-pulse" />
            </div>
            <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 font-semibold animate-pulse">
              正在润色文案
            </span>
          </div>
        ) : isEditing ? (
          <div className="relative h-full w-full">
            <textarea
              ref={textareaRef}
              value={editText}
              onChange={(e) => handleEditTextChange(e.target.value)}
              onKeyDown={handleEditKeyDown}
              className="absolute inset-0 h-full w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-[1.8] text-zinc-800 outline-none placeholder:text-zinc-300 focus:ring-0 focus-visible:outline-none z-10"
              placeholder="在此处编辑润色后的文案内容..."
            />
          </div>
        ) : isPeeking ? (
          <div className="whitespace-pre-wrap text-[14px] leading-[1.8] text-zinc-800 tracking-wide font-normal select-text opacity-70 transition-opacity">
            {originalDraft || '暂无原稿'}
          </div>
        ) : showDiff ? (
          renderDiffContent()
        ) : (
          <div className="whitespace-pre-wrap text-[14.5px] leading-[1.75] text-zinc-800 tracking-wide font-normal select-text">
            {renderParagraphRichText(polishedText)}
          </div>
        )}
      </div>

      {/* Micro-selection Toolbar */}
      <AnimatePresence>
        {microMenuState?.show && (
          <div
            className="fixed z-50 pointer-events-none"
            style={{
              left: microMenuState.x,
              top: microMenuState.y,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 5 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className="pointer-events-auto flex flex-col gap-1 rounded-xl border border-white/20 bg-[#1A1A1A] p-1.5 shadow-2xl overflow-hidden min-w-[280px]"
            >
              {/* Top Input Area */}
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-white/5 rounded-lg border border-white/10 focus-within:border-white/30 focus-within:bg-white/10 transition-colors">
                <input
                  type="text"
                  value={inlinePrompt}
                  onChange={(e) => setInlinePrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && inlinePrompt.trim()) {
                      e.preventDefault();
                      submitParagraphPatch(`${inlinePrompt}：${microMenuState.text}`, microMenuState.paragraphId);
                    }
                  }}
                  placeholder="针对选中文本提出要求..."
                  className="flex-1 bg-transparent border-none text-[13px] text-zinc-200 placeholder:text-zinc-500 outline-none focus:ring-0 min-w-0"
                />
              </div>
              {/* Bottom Quick Action Area */}
              <div className="flex items-center gap-0.5 mt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    onReferSelection?.(microMenuState.text);
                    setMicroMenuState(null);
                    setInlinePrompt('');
                  }}
                  className="flex-1 flex justify-center items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <Quote className="h-3.5 w-3.5" />
                  引用
                </button>
                <div className="w-px h-3 bg-white/10 mx-0.5" />
                <button onClick={() => submitParagraphPatch(`一键润色：${microMenuState.text}`, microMenuState.paragraphId)} className="flex-1 flex justify-center items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-zinc-300 hover:bg-white/10 hover:text-white transition-colors">
                  <Sparkles className="h-3.5 w-3.5" />
                  润色
                </button>
                <div className="w-px h-3 bg-white/10 mx-0.5" />
                <button onClick={() => submitParagraphPatch(`精简此段：${microMenuState.text}`, microMenuState.paragraphId)} className="flex-1 flex justify-center items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-zinc-300 hover:bg-white/10 hover:text-white transition-colors">
                  <Scissors className="h-3.5 w-3.5" />
                  精简
                </button>
                <div className="w-px h-3 bg-white/10 mx-0.5" />
                <button onClick={() => submitParagraphPatch(`换个语气：${microMenuState.text}`, microMenuState.paragraphId)} className="flex-1 flex justify-center items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-zinc-300 hover:bg-white/10 hover:text-white transition-colors">
                  <MessageCircle className="h-3.5 w-3.5" />
                  语气
                </button>
                <div className="w-px h-3 bg-white/10 mx-0.5" />
                <button onClick={() => submitParagraphPatch(`进行补充：${microMenuState.text}`, microMenuState.paragraphId)} className="flex-1 flex justify-center items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-zinc-300 hover:bg-white/10 hover:text-white transition-colors">
                  <Plus className="h-3.5 w-3.5" />
                  补充
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
