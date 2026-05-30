import assert from "node:assert/strict";
import test from "node:test";

import {
  __internal,
  hydrateAdviceListItems,
  type AdviceDetailRow,
  type AdviceListItemRow,
} from "./admin-advice-page";

test("建议列表首屏查询只拿列表最小字段和两条轻关联", () => {
  assert.equal(__internal.ADVICE_LIST_SELECT.includes("*"), false);
  assert.match(__internal.ADVICE_LIST_SELECT, /id/);
  assert.match(__internal.ADVICE_LIST_SELECT, /advice_content/);
  assert.match(__internal.ADVICE_LIST_SELECT, /target_profile:profiles!advice_actions_target_user_id_fkey\(id, name\)/);
  assert.match(__internal.ADVICE_LIST_SELECT, /target_account:accounts!advice_actions_target_account_id_fkey\(id, name\)/);
  assert.equal(__internal.ADVICE_LIST_SELECT.includes("assigned_profile"), false);
  assert.equal(__internal.ADVICE_LIST_SELECT.includes("reviewed_profile"), false);
  assert.equal(__internal.ADVICE_LIST_SELECT.includes("related_video"), false);
});

test("建议详情查询补齐证据、复核人和关联视频", () => {
  assert.match(__internal.ADVICE_DETAIL_SELECT, /evidence/);
  assert.match(__internal.ADVICE_DETAIL_SELECT, /review_result/);
  assert.match(__internal.ADVICE_DETAIL_SELECT, /assigned_profile:profiles!advice_actions_assigned_by_fkey\(id, name\)/);
  assert.match(__internal.ADVICE_DETAIL_SELECT, /reviewed_profile:profiles!advice_actions_reviewed_by_fkey\(id, name\)/);
  assert.match(__internal.ADVICE_DETAIL_SELECT, /related_video:videos!advice_actions_executed_video_id_fkey\(id, video_title, video_url, published_at\)/);
});

test("建议列表 hydration 会保留已加载详情并应用新的行状态", () => {
  const rows: AdviceListItemRow[] = [
    {
      id: "advice-1",
      target_user_id: "user-1",
      target_account_id: "account-1",
      advice_content: "这是一个很长很长的建议内容",
      advice_source: "ai",
      status: "待查看",
      created_at: "2026-05-31T00:00:00.000Z",
      target_profile: { id: "user-1", name: "成员甲" },
      target_account: { id: "account-1", name: "账号甲" },
    },
  ];
  const details: Record<string, AdviceDetailRow> = {
    "advice-1": {
      id: "advice-1",
      target_user_id: "user-1",
      target_account_id: "account-1",
      advice_content: "这是一个很长很长的建议内容",
      evidence: "证据A",
      advice_source: "ai",
      status: "待执行",
      assigned_by: "admin-1",
      executed_video_id: "video-1",
      review_result: "有效",
      reviewed_by: "admin-2",
      created_at: "2026-05-31T00:00:00.000Z",
      updated_at: "2026-05-31T01:00:00.000Z",
      target_profile: { id: "user-1", name: "成员甲" },
      target_account: { id: "account-1", name: "账号甲" },
      assigned_profile: { id: "admin-1", name: "管理员甲" },
      reviewed_profile: { id: "admin-2", name: "管理员乙" },
      related_video: {
        id: "video-1",
        video_title: "视频A",
        video_url: "https://example.com/video",
        published_at: "2026-05-30T00:00:00.000Z",
      },
    },
  };

  const hydrated = hydrateAdviceListItems(rows, details) as AdviceDetailRow[];

  assert.equal(hydrated[0]?.status, "待执行");
  assert.equal(hydrated[0]?.evidence, "证据A");
  assert.equal((hydrated[0]?.related_video as { id: string } | null)?.id, "video-1");
  assert.equal((hydrated[0]?.assigned_profile as { name: string } | null)?.name, "管理员甲");
});
