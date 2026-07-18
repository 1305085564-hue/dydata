import test, { afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  PUBLISH_DRAFT_SELECT,
  loadApprovedList,
  resetPublishDraftReadModelClientsForTest,
  setPublishDraftReadModelClientsForTest,
} from "./read-model";

test("稿件接口只查询固定响应字段", () => {
  assert.doesNotMatch(PUBLISH_DRAFT_SELECT, /\*/);
  assert.match(PUBLISH_DRAFT_SELECT, /\bsubmitted_by\b/);
  assert.match(PUBLISH_DRAFT_SELECT, /\bfeedback_history\b/);
});

afterEach(() => {
  resetPublishDraftReadModelClientsForTest();
});

test("approved list RPC 遇到 schema cache miss 时回退查表", async () => {
  let rpcCalls = 0;
  let fallbackQuerySeen = false;

  setPublishDraftReadModelClientsForTest({
    createAdminClient: () =>
      ({
        rpc() {
          rpcCalls += 1;
          return Promise.resolve({
            data: null,
            error: {
              message:
                "Could not find the function public.publish_drafts_approved_list(p_limit) in the schema cache",
            },
          });
        },
        from(table: string) {
          assert.equal(table, "publish_drafts");

          const rows = [
            {
              id: "draft-1",
              script_text: "已通过稿件",
              screenshot_paths: ["a.png"],
              account_id: "account-1",
              account_name_snapshot: "账号A",
              approved_at: "2026-06-01T10:00:00.000Z",
              submitted_by: "user-1",
              profiles: { name: "阿禅" },
            },
          ];

          const builder = {
            select(columns: string) {
              assert.match(columns, /profiles!publish_drafts_submitted_by_fkey\(name\)/);
              return builder;
            },
            eq(column: string, value: unknown) {
              if (column === "status" && value === "approved") fallbackQuerySeen = true;
              return builder;
            },
            order() {
              return builder;
            },
            limit() {
              return Promise.resolve({ data: rows, error: null });
            },
            ilike() {
              return builder;
            },
          };

          return builder;
        },
      }) as never,
  });

  const result = await loadApprovedList({ limit: 20, search: null, accountId: null });

  assert.equal(rpcCalls, 1);
  assert.equal(fallbackQuerySeen, true);
  assert.equal(result.errorMessage, undefined);
  assert.deepEqual(result.data, [
    {
      id: "draft-1",
      script_text: "已通过稿件",
      screenshot_paths: ["a.png"],
      account_id: "account-1",
      account_name_snapshot: "账号A",
      approved_at: "2026-06-01T10:00:00.000Z",
      submitted_by_name: "阿禅",
      submitted_by: "user-1",
    },
  ]);
});
