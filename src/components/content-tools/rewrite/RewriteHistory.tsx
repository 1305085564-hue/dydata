import React from 'react';
import { Plus, MessageSquare, PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Conversation } from '../types';

interface RewriteHistoryProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  featureLabel: string;
  onNewConversation: () => void;
  onSelectConversation: (conversation: Conversation) => void;
  getConversationTag: (conversation: Conversation) => string;
}

export function RewriteHistory({
  conversations,
  currentConversationId,
  featureLabel,
  onNewConversation,
  onSelectConversation,
  getConversationTag,
}: RewriteHistoryProps) {
  return (
    <div className="flex h-full flex-col bg-white">
      {/* 头部 */}
      <div className="shrink-0 border-b border-zinc-100 p-3">
        <div className="flex items-center gap-2 px-1">
          <PenLine className="h-4 w-4 text-zinc-400" />
          <h1 className="text-[13px] font-bold tracking-tight text-zinc-900">{featureLabel}</h1>
        </div>
        <button
          onClick={onNewConversation}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] font-semibold text-zinc-900 transition hover:border-zinc-900 hover:bg-zinc-950 hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" />
          新建文案
        </button>
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-3 text-center">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-50 text-zinc-300">
              <MessageSquare className="h-4 w-4" />
            </div>
            <p className="text-[12px] font-medium text-zinc-500">暂无记录</p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-zinc-400">
              改写的文案会保存在这里
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((conversation) => {
              const active = currentConversationId === conversation.id;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => onSelectConversation(conversation)}
                  className={cn(
                    'w-full rounded-lg px-2.5 py-2 text-left transition-colors',
                    active
                      ? 'bg-zinc-100'
                      : 'hover:bg-zinc-50'
                  )}
                >
                  <p className={cn(
                    'truncate text-[12px] font-medium leading-tight',
                    active ? 'text-zinc-900' : 'text-zinc-600'
                  )}>
                    {conversation.title || '新文案改写'}
                  </p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-400">
                      {new Date(conversation.updatedAt).toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <span className={cn(
                      'rounded px-1 py-0.5 text-[9px] font-medium',
                      active
                        ? 'bg-white text-zinc-600 ring-1 ring-zinc-200'
                        : 'bg-zinc-50 text-zinc-500'
                    )}>
                      {getConversationTag(conversation)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
