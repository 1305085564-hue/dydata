import assert from "node:assert/strict";
import test from "node:test";

import { createSkill, injectSkillToConversation, listAvailableSkills } from "./skills";

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

function createInjectionClient(input: {
  skill: Record<string, unknown>;
  version: Record<string, unknown>;
}) {
  return {
    from(table: string) {
      const source = table === "rewrite_skills"
        ? [input.skill]
        : table === "rewrite_skill_versions"
          ? [input.version]
          : [];
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];

      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return query;
        },
        not(column: string, operator: string, value: unknown) {
          if (operator === "is") {
            filters.push((row) => (value === null ? row[column] !== null : row[column] !== value));
          }
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        maybeSingle: async () => ({ data: source.find((row) => filters.every((filter) => filter(row))) ?? null, error: null }),
        then<TResult1 = { data: Record<string, unknown>[]; error: null }, TResult2 = never>(
          onfulfilled?: ((value: { data: Record<string, unknown>[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          return Promise.resolve({
            data: source.filter((row) => filters.every((filter) => filter(row))),
            error: null,
          }).then(onfulfilled, onrejected);
        },
      };

      return query;
    },
  };
}

test("injectSkillToConversation 拒绝注入其他用户的私有 skill", async () => {
  const client = createInjectionClient({
    skill: {
      id: "skill-private-other",
      scope: "private",
      owner_id: "user-2",
      is_enabled: true,
    },
    version: {
      id: "version-1",
      skill_id: "skill-private-other",
      published_at: "2026-09-03T00:00:00.000Z",
    },
  });

  await assert.rejects(
    () => injectSkillToConversation(client, {
      conversationId: "conversation-1",
      skillId: "skill-private-other",
      userId: "user-1",
      skillVersionId: "version-1",
    }),
    /无权使用此 skill/,
  );
});

test("injectSkillToConversation 拒绝不属于 skill 或未发布的版本", async () => {
  const client = createInjectionClient({
    skill: {
      id: "skill-own",
      scope: "private",
      owner_id: "user-1",
      is_enabled: true,
    },
    version: {
      id: "version-unpublished",
      skill_id: "skill-other",
      published_at: null,
    },
  });

  await assert.rejects(
    () => injectSkillToConversation(client, {
      conversationId: "conversation-1",
      skillId: "skill-own",
      userId: "user-1",
      skillVersionId: "version-unpublished",
    }),
    /skill 版本不存在或未发布/,
  );
});

test("listAvailableSkills 即使指定 private scope 也只返回当前用户的私有 skill", async () => {
  const rows = [
    { id: "private-own", scope: "private", owner_id: "user-1", is_enabled: true, sort_order: 1, created_at: "2026-09-03T00:00:00.000Z" },
    { id: "private-other", scope: "private", owner_id: "user-2", is_enabled: true, sort_order: 2, created_at: "2026-09-03T00:00:00.000Z" },
    { id: "platform", scope: "platform", owner_id: null, is_enabled: true, sort_order: 3, created_at: "2026-09-03T00:00:00.000Z" },
  ];
  const client = {
    from() {
      const filters: Array<(row: Record<string, unknown>) => boolean> = [];
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters.push((row) => row[column] === value);
          return query;
        },
        in(column: string, values: unknown[]) {
          filters.push((row) => values.includes(row[column]));
          return query;
        },
        or(filter: string) {
          const ownerId = filter.match(/owner_id\.eq\.([^,]+)/)?.[1];
          filters.push((row) => row.scope === "platform" || row.scope === "public_user" || row.owner_id === ownerId);
          return query;
        },
        order() {
          return query;
        },
        then<TResult1 = { data: typeof rows; error: null }, TResult2 = never>(
          onfulfilled?: ((value: { data: typeof rows; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) {
          return Promise.resolve({
            data: rows.filter((row) => filters.every((filter) => filter(row))),
            error: null,
          }).then(onfulfilled, onrejected);
        },
      };
      return query;
    },
  };

  const skills = await listAvailableSkills(client, { userId: "user-1", scope: ["private"] });
  assert.deepEqual(skills.map((skill) => skill.id), ["private-own"]);
});
