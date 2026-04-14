import RewriteWorkbench from '@/components/content-tools/RewriteWorkbench'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AI 文案改写 | 抖音数据平台',
  description: '输入原文，一键改写成爆款文案。',
}

export default function RewritePage() {
  return (
    <div className="h-[calc(100vh-64px)] w-full">
      <RewriteWorkbench />
    </div>
  )
}
