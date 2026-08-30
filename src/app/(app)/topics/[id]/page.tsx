import { redirect } from "next/navigation";

/**
 * 旧版选题详情页已下线（2026-08-30）：详情、参与动态、作品翻页排序、编辑/移出
 * 均已并入 /topics 选题库抽屉。本页仅保留 URL 兼容，深链重定向后由抽屉自动打开。
 */
export default async function SubTopicDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/topics?topic_id=${encodeURIComponent(id)}`);
}
