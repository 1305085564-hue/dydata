import test from "node:test";
import assert from "node:assert/strict";

import { buildMemberAiSuggestionResponse } from "./route";

function buildAdminClient(profile: { id: string; name: string; role: string; team_id: string | null }) {
  return {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async single() {
          return {
            data: profile,
            error: null,
          };
        },
      };
    },
  } as never;
}

test("member-ai-suggestion 返回结构化建议", async () => {
  const response = await buildMemberAiSuggestionResponse(
    { memberId: "member-1" },
    {
      requireAdminActor: async () => ({
        supabase: {} as never,
        actor: {
          userId: "owner-1",
          role: "owner",
          businessRole: "owner",
          permissions: { use_ai_management: true, view_all_data: true },
          name: "阿禅",
        },
      }),
      createAdminClient: () =>
        buildAdminClient({
          id: "member-1",
          name: "张三",
          role: "member",
          team_id: "team-1",
        }),
      buildDataAccessScope: async () => ({
        userId: "owner-1",
        role: "owner",
        businessRole: "owner",
        permissions: { use_ai_management: true, view_all_data: true },
        accessLevel: 4,
        teamId: null,
        groupId: null,
        kind: "all",
        visibleUserIds: ["member-1"],
      }),
      getUserInfo: async () => ({
        success: true,
        data: {
          user: { id: "member-1", name: "张三", role: "member" },
          recentMetrics: [{ report_date: "2026-05-14", play_count: 1200 }],
          exemptions: [],
        },
      }),
      getAnomalousData: async (params) => ({
        success: true,
        data: {
          anomalies:
            params.type === "no_submission"
              ? [{ userId: "member-1", issue: "连续未填报", severity: "critical" }]
              : [],
        },
      }),
      callAiJson: async () => ({
        content: JSON.stringify({
          status: "critical",
          summary: "该成员连续缺报，需要先处理填报问题。",
          suggestions: [
            {
              label: "查看成员信息",
              description: "先确认近期状态和豁免记录。",
              action: {
                type: "execute_tool",
                toolName: "getUserInfo",
                toolArgs: { userId: "member-1" },
              },
            },
          ],
        }),
        model: "test-model",
        channelName: "test-channel",
        elapsedMs: 1,
      }),
      now: () => new Date("2026-05-14T09:30:00.000Z"),
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "critical");
  assert.equal(payload.suggestions[0].action.toolName, "getUserInfo");
});
