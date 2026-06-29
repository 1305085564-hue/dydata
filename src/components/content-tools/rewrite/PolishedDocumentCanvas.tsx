'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Check, Copy, RefreshCw, Eye, Edit3, Save, FileText, Lock, Unlock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DocumentParagraph } from './useRewriteLogic';

interface PolishedDocumentCanvasProps {
  originalDraft: string;
  polishedText: string;
  isSending: boolean;
  paragraphs?: DocumentParagraph[];
  traceabilityMode?: boolean;
  selectedParagraphIds?: Set<string>;
  onTextChange: (text: string) => void;
  onReloadAsInput: (text: string) => void;
  onToggleParagraphLock?: (paragraph: DocumentParagraph) => void;
  onToggleParagraphSelect?: (paragraphId: string) => void;
  onClearParagraphSelect?: () => void;
  onInlinePatchSubmit?: (prompt: string) => void;
}

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
  selectedParagraphIds = new Set(),
  onTextChange,
  onReloadAsInput,
  onToggleParagraphLock,
  onToggleParagraphSelect,
  onClearParagraphSelect,
  onInlinePatchSubmit,
}: PolishedDocumentCanvasProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(polishedText);
  const [showDiff, setShowDiff] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inlinePrompt, setInlinePrompt] = useState('');
  const [ghostText, setGhostText] = useState('');
  const [microMenuState, setMicroMenuState] = useState<{
    show: boolean;
    x: number;
    y: number;
    text: string;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ghostDebounceRef = useRef<number | undefined>(undefined);

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
    setGhostText('');
  };

  const handleCancelEdit = () => {
    setEditText(polishedText);
    setIsEditing(false);
    setGhostText('');
  };

  const handleEditTextChange = (val: string) => {
    setEditText(val);
    setGhostText('');
    window.clearTimeout(ghostDebounceRef.current);
    
    // Mock fast completion API (Debounce 600ms)
    ghostDebounceRef.current = window.setTimeout(() => {
      if (val.trim().length === 0) return;
      const lastChar = val.slice(-1);
      if (['。', '！', '？', '\n'].includes(lastChar)) {
        setGhostText('此外，我们还做了更多体验优化，期待您的探索。');
      } else if (['，', '、'].includes(lastChar)) {
        setGhostText('带来更流畅的心流体验');
      } else if (val.length > 5 && Math.random() > 0.5) {
        // random completion mock
        setGhostText('，极大地提升了内容生产的效率。');
      }
    }, 600);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (ghostText && e.key === 'Tab') {
      e.preventDefault();
      setEditText((prev) => prev + ghostText);
      setGhostText('');
    } else if (ghostText && !['Shift', 'Meta', 'Alt', 'Control'].includes(e.key)) {
      setGhostText('');
    }
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
    <div className="flex h-full flex-col bg-zinc-50/20 p-4">
      {/* Canvas Header */}
      <div className="mb-3 flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-1.5 pl-1">
          <FileText className="h-4 w-4 text-zinc-400" />
          <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
            润色终稿画布
          </span>
        </div>

        {/* Toolbar Buttons */}
        {hasText && (
          <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg p-0.5 shadow-sm">
            {/* Diff Toggler */}
            {!isEditing && (
              <button
                type="button"
                onClick={() => setShowDiff(!showDiff)}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium transition-colors',
                  showDiff
                    ? 'bg-zinc-100 text-zinc-900 font-semibold'
                    : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800'
                )}
                title={showDiff ? '关闭对比' : '显示修改对比'}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>对比</span>
              </button>
            )}

            {/* Copy Button */}
            {!isEditing && (
              <button
                type="button"
                onClick={handleCopy}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium transition-colors',
                  copied
                    ? 'bg-[#6FAA7D]/10 text-[#4F7F5E]'
                    : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800'
                )}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? '已复制' : '复制'}</span>
              </button>
            )}

            {/* Reload/Return to Input Button */}
            {!isEditing && (
              <button
                type="button"
                onClick={() => onReloadAsInput(polishedText)}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 transition-colors"
                title="将当前文案回填为新原文重新修改"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>回填新会话</span>
              </button>
            )}

            {/* Edit Toggler */}
            {isEditing ? (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="inline-flex h-7 items-center gap-1 rounded-md bg-[#D97757] px-2.5 text-[11px] font-medium text-white shadow-sm hover:bg-[#C96442] transition-colors"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span>保存</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="inline-flex h-7 items-center justify-center rounded-md px-2 text-[11px] font-medium text-zinc-400 hover:bg-zinc-50 hover:text-zinc-800 transition-colors"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 transition-colors"
                title="编辑终稿"
              >
                <Edit3 className="h-3.5 w-3.5" />
                <span>编辑</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Document Sheet Area */}
      <div 
        className="relative flex-1 min-h-0 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-sm transition-[border-color,box-shadow] duration-200 focus-within:border-zinc-300"
        onClick={(e) => {
          // Clear selection if clicking outside blocks
          if (e.target === e.currentTarget && selectedParagraphIds.size > 0 && onClearParagraphSelect) {
            onClearParagraphSelect();
          }
          if (window.getSelection()?.toString().trim() === '') {
            setMicroMenuState(null);
          }
        }}
      >
        {!hasText && !isSending ? (
          <div className="flex h-full flex-col items-center justify-center text-center px-4">
            <div className="h-8 w-8 rounded-full border border-dashed border-zinc-300 flex items-center justify-center mb-2">
              <FileText className="h-4 w-4 text-zinc-300" />
            </div>
            <p className="text-[12px] font-medium text-zinc-400">终稿画布</p>
            <p className="text-[11px] text-zinc-400 mt-1 leading-[1.5] max-w-[200px]">
              左侧输入并润色后，最终修改文本将在此处呈现与对比。
            </p>
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
            {ghostText && (
              <div 
                className="pointer-events-none absolute inset-0 h-full w-full p-0 text-[14px] leading-[1.8] whitespace-pre-wrap break-words z-0 overflow-hidden"
              >
                <span className="text-transparent">{editText}</span>
                <span className="text-zinc-400 italic">
                  {ghostText}
                  <span className="ml-2 inline-flex items-center rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 text-[10px] font-sans not-italic text-zinc-400">Tab 采纳</span>
                </span>
              </div>
            )}
          </div>
        ) : showDiff ? (
          renderDiffContent()
        ) : hasParagraphs ? (
          <div className="space-y-3 relative pb-20">
            {paragraphs.map((paragraph) => {
              const isSelected = selectedParagraphIds.has(paragraph.paragraphId);
              let sourceColorClass = '';
              if (traceabilityMode) {
                if (paragraph.sourceType === 'ai') sourceColorClass = 'border-l-4 border-l-[#6FAA7D] pl-3';
                else if (paragraph.sourceType === 'user') sourceColorClass = 'border-l-4 border-l-[#5C89C7] pl-3';
                else sourceColorClass = 'border-l-4 border-l-zinc-300 pl-3';
              }

              return (
                <div
                  key={paragraph.id}
                  onClick={() => {
                    onToggleParagraphSelect?.(paragraph.paragraphId);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onToggleParagraphLock?.(paragraph);
                  }}
                  className={cn(
                    'group relative rounded-xl border px-4 py-3 transition-[border-color,background-color,box-shadow]',
                    sourceColorClass,
                    isSelected ? 'ring-2 ring-zinc-950 bg-zinc-50 border-transparent' : '',
                    paragraph.isLocked && !isSelected
                      ? 'border-[#D99E55]/40 bg-[#D99E55]/5'
                      : !isSelected ? 'border-transparent bg-transparent hover:border-zinc-200 hover:bg-zinc-50' : '',
                  )}
                >
                  {/* Hover Handles */}
                  <div className="absolute -left-3 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 flex flex-col gap-1 items-center justify-center h-full cursor-pointer"
                       onClick={(e) => { e.stopPropagation(); onToggleParagraphSelect?.(paragraph.paragraphId); }}
                  >
                    <div className="flex flex-col gap-0.5 text-zinc-300 hover:text-zinc-500">
                      <div className="flex gap-0.5"><div className="w-1 h-1 rounded-full bg-current"/><div className="w-1 h-1 rounded-full bg-current"/></div>
                      <div className="flex gap-0.5"><div className="w-1 h-1 rounded-full bg-current"/><div className="w-1 h-1 rounded-full bg-current"/></div>
                      <div className="flex gap-0.5"><div className="w-1 h-1 rounded-full bg-current"/><div className="w-1 h-1 rounded-full bg-current"/></div>
                    </div>
                  </div>

                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                      段落 {paragraph.position + 1} {traceabilityMode && `(${paragraph.sourceType})`}
                    </span>
                    {onToggleParagraphLock && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onToggleParagraphLock(paragraph); }}
                        className={cn(
                          'inline-flex h-6 items-center gap-1 rounded-md px-2 text-[10px] font-medium transition-colors',
                          paragraph.isLocked
                            ? 'bg-[#D99E55]/10 text-[#A96F2F] opacity-100'
                            : 'text-zinc-400 opacity-0 hover:bg-zinc-100 hover:text-zinc-700 group-hover:opacity-100',
                        )}
                        title={paragraph.isLocked ? '解除锁定' : '锁定段落'}
                      >
                        {paragraph.isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                        <span>{paragraph.isLocked ? '已锁定' : '锁定'}</span>
                      </button>
                    )}
                  </div>
                  <div 
                    className="whitespace-pre-wrap text-[14px] leading-[1.8] tracking-wide text-zinc-800"
                    onMouseUp={() => {
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
                          });
                        }
                      } else {
                        setMicroMenuState(null);
                      }
                    }}
                  >
                    {paragraph.content}
                  </div>
                </div>
              );
            })}

            {/* Floating Inline Prompt Bar */}
            {selectedParagraphIds.size > 0 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[80%] max-w-[500px] bg-zinc-900 rounded-xl shadow-2xl border border-zinc-800 p-2 flex items-center gap-2 animate-in slide-in-from-bottom-4 fade-in duration-200">
                <div className="pl-3 pr-1 text-[12px] font-medium text-zinc-300 border-r border-zinc-700">
                  已选 {selectedParagraphIds.size} 段
                </div>
                <input
                  type="text"
                  value={inlinePrompt}
                  onChange={(e) => setInlinePrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      onInlinePatchSubmit?.(inlinePrompt);
                      setInlinePrompt('');
                    }
                  }}
                  placeholder="要求 AI 局部重写 (Enter确认)..."
                  className="flex-1 bg-transparent border-none text-[13px] text-zinc-100 placeholder:text-zinc-500 px-2 py-1 outline-none focus:ring-0"
                />
                <button
                  onClick={() => {
                    onInlinePatchSubmit?.(inlinePrompt);
                    setInlinePrompt('');
                  }}
                  className="shrink-0 h-7 px-3 bg-white text-zinc-900 rounded-md text-[12px] font-medium hover:bg-zinc-200 transition-colors"
                >
                  重写
                </button>
                <button
                  onClick={onClearParagraphSelect}
                  className="shrink-0 h-7 w-7 flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-md transition-colors"
                >
                  <span className="sr-only">取消</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="whitespace-pre-wrap text-[14px] leading-[1.8] text-zinc-800 tracking-wide font-normal select-text">
            {polishedText}
          </div>
        )}
      </div>

      {/* Micro-selection Toolbar */}
      {microMenuState?.show && (
        <div 
          className="fixed z-50 flex items-center gap-1 rounded-lg border border-zinc-200 bg-white/80 backdrop-blur-xl p-1 shadow-xl animate-in fade-in zoom-in-95 duration-150"
          style={{
            left: microMenuState.x,
            top: microMenuState.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <button onClick={() => { onInlinePatchSubmit?.(`魔法润色：${microMenuState.text}`); setMicroMenuState(null); }} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 transition-colors">
            🪄 润色
          </button>
          <div className="w-px h-3 bg-zinc-200" />
          <button onClick={() => { onInlinePatchSubmit?.(`扩写缩写：${microMenuState.text}`); setMicroMenuState(null); }} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 transition-colors">
            ↔️ 扩缩
          </button>
          <div className="w-px h-3 bg-zinc-200" />
          <button onClick={() => { onInlinePatchSubmit?.(`换个语气：${microMenuState.text}`); setMicroMenuState(null); }} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 transition-colors">
            🔄 语气
          </button>
        </div>
      )}
    </div>
  );
}
