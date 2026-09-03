import assert from "node:assert/strict";
import test from "node:test";

import { createSkill } from "./skills";

function createSkillClient(options: { versionFails?: boolean; cleanupFails?: boolean } = {}) {
  const state = {
    skills: [] as Array<Record<string, unknown>>,
    versions: [] as Array<Record<string, unknown>>,
  };

  const client = {
    from(table: string) {
      if (table === "rewrite_skills") {
        return {
          insert(payload: Record<string, unknown>) {
            return {
              select: () => ({
                single: async () => {
                  const row = {
                    id: "skill-1",
                    created_at: "2026-09-03T00:00:00.000Z",
                    updated_at: "2026-09-03T00:00:00.000Z",
                    ...payload,
                  };
                  state.skills.push(row);
                  return { data: row, error: null };
                },
              }),
            };
          },
          delete() {
            return {
              eq: async (_column: string, id: string) => {
                if (options.cleanupFails) return { error: { message: "cleanup failed" } };
                state.skills = state.skills.filter((skill) => skill.id !== id);
                return { error: null };
              },
            };
          },
        };
      }

      if (table === "rewrite_skill_versions") {
        return {
          insert(payload: Record<string, unknown>) {
            return {
              select: () => ({
                single: async () => {
                  if (options.versionFails) {
                    return { data: null, error: { message: "version failed" } };
                  }
                  const row = {
                    id: "version-1",
                    created_at: "2026-09-03T00:00:00.000Z",
                    meta: null,
                    ...payload,
                  };
                  state.versions.push(row);
                  return { data: row, error: null };
                },
              }),
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { client, state };
}

test("createSkill 创建版本失败时删除已创建的 skill，避免无版本孤儿", async () => {
  const { client, state } = createSkillClient({ versionFails: true });

  await assert.rejects(
    () => createSkill(client, {
      scope: "private",
      ownerId: "user-1",
      key: "review",
      name: "复盘",
      systemPrompt: "prompt",
    }),
    /version failed/,
  );

  assert.equal(state.skills.length, 0);
  assert.equal(state.versions.length, 0);
});

test("createSkill 创建版本失败且补偿失败时返回可见补偿错误", async () => {
  const { client, state } = createSkillClient({ versionFails: true, cleanupFails: true });

  await assert.rejects(
    () => createSkill(client, {
      scope: "private",
      ownerId: "user-1",
      key: "review",
      name: "复盘",
      systemPrompt: "prompt",
    }),
    /创建 skill version 失败；补偿删除 skill 失败：cleanup failed/,
  );

  assert.equal(state.skills.length, 1);
  assert.equal(state.versions.length, 0);
});

test("createSkill 成功时返回 skill 和首个版本", async () => {
  const { client, state } = createSkillClient();

  const result = await createSkill(client, {
    scope: "private",
    ownerId: "user-1",
    key: "review",
    name: "复盘",
    systemPrompt: "prompt",
  });

  assert.equal(result.skill.id, "skill-1");
  assert.equal(result.version.id, "version-1");
  assert.equal(state.skills.length, 1);
  assert.equal(state.versions.length, 1);
});
