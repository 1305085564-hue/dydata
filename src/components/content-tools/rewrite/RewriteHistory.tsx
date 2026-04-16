import React from 'react';
import { Plus, MessageSquare } from 'lucide-react';
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
      <div className="border-b border-slate-100 p-4">
        <h1 className="text-[15px] font-bold tracking-tight text-slate-900">{featureLabel}</h1>
        <p className="mt-1 text-[11px] text-slate-500">固定套餐更稳，自定义更自由</p>
        
        <button
          onClick={onNewConversation}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          新建文案
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-slate-300">
              <MessageSquare className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-slate-600">暂无历史记录</p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
              改写过的文案会保存在这里
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conversation) => {
              const active = currentConversationId === conversation.id;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => onSelectConversation(conversation)}
                  className={cn(
                    'w-full rounded-xl px-3 py-3 text-left transition-colors',
                    active
                      ? 'bg-slate-100'
                      : 'hover:bg-slate-50'
                  )}
                >
                  <div className="flex flex-col gap-1.5">
                    <p className={cn(
                      'truncate text-[13px] font-medium',
                      active ? 'text-slate-900' : 'text-slate-700'
                    )}>
                      {conversation.title || '新文案改写'}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400">
                        {new Date(conversation.updatedAt).toLocaleString('zh-CN', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200">
                        {getConversationTag(conversation)}
                      </span>
                    </div>
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
