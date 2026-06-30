import assert from "node:assert/strict";
import test from "node:test";

import {
  createSkill,
  deleteSkill,
  updateSkillMetadata,
  updateSkillPrompt,
} from "./skills";
import {
  createParagraphs,
  getDocumentHistoryState,
  createRevision,
  getDocumentByConversationId,
  moveDocumentHistoryPointer,
  setCurrentRevision,
  splitIntoParagraphs,
} from "./documents";
import { resolveGenerationProviderKeyModelId, sanitizeCanvasOutput, streamGeneration } from "./generation";

type Row = Record<string, unknown>;
type FakeDb = Record<string, Row[]>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function nextIso(counter: { value: number }) {
  const time = Date.UTC(2026, 5, 28, 10, 0, counter.value);
  counter.value += 1;
  return new Date(time).toISOString();
}

class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private filters: Array<(row: Row) => boolean> = [];
  private orders: Array<{ field: string; ascending: boolean }> = [];
  private limitCount: number | null = null;
  private singleMode: "many" | "single" | "maybeSingle" = "many";
  private insertPayload: Row[] = [];
  private updatePayload: Row | null = null;
  private returning = false;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
    private readonly counter: { value: number },
  ) {}

  select(...args: unknown[]) {
    void args;
    this.returning = true;
    return this;
  }

  insert(payload: Row | Row[]) {
    this.op = "insert";
    this.insertPayload = (Array.isArray(payload) ? payload : [payload]).map((row) => clone(row));
    return this;
  }

  update(payload: Row) {
    this.op = "update";
    this.updatePayload = clone(payload);
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  in(field: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[field]));
    return this;
  }

  or() {
    return this;
  }

  not(field: string, operator: string, value: unknown) {
    if (operator === "is" && value === null) {
      this.filters.push((row) => row[field] != null);
    }
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orders.push({ field, ascending: options?.ascending ?? true });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    this.singleMode = "maybeSingle";
    return this;
  }

  single() {
    this.singleMode = "single";
    return this;
  }

  then<TResult1 = { data: unknown; error: { message: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    if (this.op === "insert") return this.executeInsert();
    if (this.op === "update") return this.executeUpdate();
    if (this.op === "delete") return this.executeDelete();
    return this.executeSelect();
  }

  private executeSelect() {
    let rows = this.getRows().filter((row) => this.filters.every((filter) => filter(row)));
    rows = this.applyOrderAndLimit(rows);
    return this.formatResult(rows);
  }

  private executeInsert() {
    const rows = this.db[this.table] ?? (this.db[this.table] = []);
    const inserted = this.insertPayload.map((row) => this.prepareInsertRow(row));
    rows.push(...inserted);
    return this.returning ? this.formatResult(inserted) : { data: null, error: null };
  }

  private executeUpdate() {
    const rows = (this.db[this.table] ?? []).filter((row) => this.filters.every((filter) => filter(row)));
    for (const row of rows) {
      Object.assign(row, clone(this.updatePayload ?? {}));
    }
    return { data: null, error: null };
  }

  private executeDelete() {
    const rows = this.db[this.table] ?? [];
    this.db[this.table] = rows.filter((row) => !this.filters.every((filter) => filter(row)));
    return { data: null, error: null };
  }

  private getRows() {
    const rows = (this.db[this.table] ?? []).map((row) => clone(row));
    if (this.table !== "rewrite_conversation_skills") return rows;

    return rows.map((row) => ({
      ...row,
      skill: (this.db.rewrite_skills ?? []).find((skill) => skill.id === row.skill_id) ?? null,
      version: (this.db.rewrite_skill_versions ?? []).find((version) => version.id === row.skill_version_id) ?? null,
    }));
  }

  private applyOrderAndLimit(rows: Row[]) {
    const ordered = [...rows];
    for (let index = this.orders.length - 1; index >= 0; index -= 1) {
      const order = this.orders[index];
      ordered.sort((left, right) => {
        const a = left[order.field];
        const b = right[order.field];
        if (a === b) return 0;
        if (a == null) return order.ascending ? -1 : 1;
        if (b == null) return order.ascending ? 1 : -1;
        return a < b ? (order.ascending ? -1 : 1) : order.ascending ? 1 : -1;
      });
    }
    return this.limitCount === null ? ordered : ordered.slice(0, this.limitCount);
  }

  private formatResult(rows: Row[]) {
    if (this.singleMode === "maybeSingle") {
      return { data: rows[0] ?? null, error: null };
    }
    if (this.singleMode === "single") {
      return rows[0]
        ? { data: rows[0], error: null }
        : { data: null, error: { message: "未找到记录" } };
    }
    return { data: rows, error: null };
  }

  private prepareInsertRow(row: Row) {
    const now = nextIso(this.counter);
    const idPrefix: Record<string, string> = {
      rewrite_skills: "skill",
      rewrite_skill_versions: "skill-version",
      rewrite_documents: "doc",
      rewrite_document_revisions: "rev",
      rewrite_document_paragraphs: "para-row",
      rewrite_generation_runs: "run",
    };
    const next = {
      id: row.id ?? `${idPrefix[this.table] ?? "row"}-${this.counter.value}`,
      created_at: row.created_at ?? now,
      ...row,
    };

    if (this.table === "rewrite_skills") {
      return {
        updated_at: now,
        owner_id: null,
        description: null,
        icon: null,
        default_model_view_id: null,
        sort_order: 100,
        is_enabled: true,
        ...next,
      };
    }

    if (this.table === "rewrite_skill_versions") {
      return {
        meta: null,
        published_at: null,
        ...next,
      };
    }

    if (this.table === "rewrite_documents") {
      return {
        title: "未命名文档",
        current_revision_id: null,
        updated_at: now,
        ...next,
      };
    }

    if (this.table === "rewrite_document_revisions") {
      return {
        parent_revision_id: null,
        status: "pending",
        generation_run_id: null,
        full_content: null,
        message_id: null,
        meta: null,
        ...next,
      };
    }

    if (this.table === "rewrite_document_paragraphs") {
      return {
        is_locked: false,
        source_type: "ai",
        ...next,
      };
    }

    if (this.table === "rewrite_generation_runs") {
      return {
        actual_model: null,
        provider_name: null,
        provider_key_model_id: null,
        skill_version_ids: [],
        input_snapshot: null,
        output_snapshot: null,
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
        estimated_cost_usd: null,
        elapsed_ms: null,
        error_message: null,
        started_at: now,
        completed_at: null,
        ...next,
      };
    }

    return next;
  }
}

function createFakeService(db: FakeDb) {
  const counter = { value: 1 };
  return {
    from(table: string) {
      return new FakeQuery(db, table, counter);
    },
  };
}

function providerKeyModelRow(input: {
  id: string;
  modelId: string;
  keyPriority?: number;
  providerPriority?: number;
  unhealthyUntil?: string | null;
  consecutiveFailures?: number;
}) {
  return {
    id: input.id,
    model_id: input.modelId,
    is_enabled: true,
    key: {
      id: `key-${input.id}`,
      api_key: `secret-${input.id}`,
      is_enabled: true,
      priority: input.keyPriority ?? 10,
      consecutive_failures: input.consecutiveFailures ?? 0,
      unhealthy_until: input.unhealthyUntil ?? null,
      provider: {
        id: `provider-${input.id}`,
        name: `provider-${input.id}`,
        base_url: `https://provider-${input.id}.test`,
        priority: input.providerPriority ?? 10,
        is_enabled: true,
      },
    },
  };
}

test("generation provider selection prefers explicit model view over skill default", async () => {
  const db: FakeDb = {
    rewrite_model_routes: [
      {
        id: "route-skill",
        model_view_id: "model-skill",
        provider_key_model_id: null,
        actual_model: "skill-model",
        priority: 10,
        weight: 100,
        is_enabled: true,
        created_at: "2026-06-28T00:00:00.000Z",
      },
      {
        id: "route-manual",
        model_view_id: "model-manual",
        provider_key_model_id: null,
        actual_model: "manual-model",
        priority: 10,
        weight: 100,
        is_enabled: true,
        created_at: "2026-06-28T00:00:00.000Z",
      },
    ],
    ai_provider_key_models: [
      providerKeyModelRow({ id: "pkm-skill", modelId: "skill-model" }),
      providerKeyModelRow({ id: "pkm-manual", modelId: "manual-model" }),
    ],
    rewrite_skills: [
      {
        id: "skill-1",
        scope: "platform",
        owner_id: null,
        key: "skill-1",
        name: "平台技能",
        description: null,
        icon: null,
        default_model_view_id: "model-skill",
        sort_order: 1,
        is_enabled: true,
        created_at: "2026-06-28T00:00:00.000Z",
        updated_at: "2026-06-28T00:00:00.000Z",
      },
    ],
    rewrite_skill_versions: [
      {
        id: "skill-version-1",
        skill_id: "skill-1",
        version: 1,
        system_prompt: "技能提示词",
        meta: null,
        published_at: "2026-06-28T00:00:00.000Z",
        created_at: "2026-06-28T00:00:00.000Z",
      },
    ],
    rewrite_conversation_skills: [
      {
        id: "conv-skill-1",
        conversation_id: "conv-1",
        skill_id: "skill-1",
        skill_version_id: "skill-version-1",
        position: 1,
        is_active: true,
        injected_at: "2026-06-28T00:00:00.000Z",
      },
    ],
  };

  const selected = await resolveGenerationProviderKeyModelId(createFakeService(db) as never, {
    conversationId: "conv-1",
    modelViewId: "model-manual",
  });

  assert.equal(selected, "pkm-manual");
});

test("generation provider selection uses latest active skill default when no model is selected", async () => {
  const db: FakeDb = {
    rewrite_model_routes: [
      {
        id: "route-a",
        model_view_id: "model-a",
        provider_key_model_id: null,
        actual_model: "model-a-actual",
        priority: 10,
        weight: 100,
        is_enabled: true,
        created_at: "2026-06-28T00:00:00.000Z",
      },
      {
        id: "route-b",
        model_view_id: "model-b",
        provider_key_model_id: "pkm-direct-b",
        actual_model: "model-b-actual",
        priority: 10,
        weight: 100,
        is_enabled: true,
        created_at: "2026-06-28T00:00:00.000Z",
      },
    ],
    ai_provider_key_models: [
      providerKeyModelRow({ id: "pkm-a", modelId: "model-a-actual" }),
      providerKeyModelRow({ id: "pkm-direct-b", modelId: "model-b-actual" }),
      providerKeyModelRow({ id: "pkm-fallback", modelId: "fallback-model" }),
    ],
    rewrite_skills: [
      {
        id: "skill-a",
        scope: "platform",
        owner_id: null,
        key: "skill-a",
        name: "平台技能",
        description: null,
        icon: null,
        default_model_view_id: "model-a",
        sort_order: 1,
        is_enabled: true,
        created_at: "2026-06-28T00:00:00.000Z",
        updated_at: "2026-06-28T00:00:00.000Z",
      },
      {
        id: "skill-b",
        scope: "private",
        owner_id: "user-1",
        key: "skill-b",
        name: "个人技能",
        description: null,
        icon: null,
        default_model_view_id: "model-b",
        sort_order: 2,
        is_enabled: true,
        created_at: "2026-06-28T00:00:01.000Z",
        updated_at: "2026-06-28T00:00:01.000Z",
      },
    ],
    rewrite_skill_versions: [
      {
        id: "skill-version-a",
        skill_id: "skill-a",
        version: 1,
        system_prompt: "A",
        meta: null,
        published_at: "2026-06-28T00:00:00.000Z",
        created_at: "2026-06-28T00:00:00.000Z",
      },
      {
        id: "skill-version-b",
        skill_id: "skill-b",
        version: 1,
        system_prompt: "B",
        meta: null,
        published_at: "2026-06-28T00:00:00.000Z",
        created_at: "2026-06-28T00:00:00.000Z",
      },
    ],
    rewrite_conversation_skills: [
      {
        id: "conv-skill-a",
        conversation_id: "conv-1",
        skill_id: "skill-a",
        skill_version_id: "skill-version-a",
        position: 1,
        is_active: true,
        injected_at: "2026-06-28T00:00:00.000Z",
      },
      {
        id: "conv-skill-b",
        conversation_id: "conv-1",
        skill_id: "skill-b",
        skill_version_id: "skill-version-b",
        position: 2,
        is_active: true,
        injected_at: "2026-06-28T00:00:00.000Z",
      },
    ],
  };

  const selected = await resolveGenerationProviderKeyModelId(createFakeService(db) as never, {
    conversationId: "conv-1",
  });

  assert.equal(selected, "pkm-direct-b");
});

test("generation provider selection skips unhealthy direct model route and uses next route", async () => {
  const db: FakeDb = {
    rewrite_model_routes: [
      {
        id: "route-unhealthy",
        model_view_id: "model-default",
        provider_key_model_id: "pkm-unhealthy",
        actual_model: "model-unhealthy",
        priority: 1,
        weight: 100,
        is_enabled: true,
        created_at: "2026-06-28T00:00:00.000Z",
      },
      {
        id: "route-healthy",
        model_view_id: "model-default",
        provider_key_model_id: "pkm-healthy",
        actual_model: "model-healthy",
        priority: 2,
        weight: 100,
        is_enabled: true,
        created_at: "2026-06-28T00:00:01.000Z",
      },
    ],
    ai_provider_key_models: [
      providerKeyModelRow({
        id: "pkm-unhealthy",
        modelId: "model-unhealthy",
        consecutiveFailures: 3,
        unhealthyUntil: "2099-01-01T00:00:00.000Z",
      }),
      providerKeyModelRow({ id: "pkm-healthy", modelId: "model-healthy" }),
    ],
    rewrite_skills: [],
    rewrite_skill_versions: [],
    rewrite_conversation_skills: [],
  };

  const selected = await resolveGenerationProviderKeyModelId(createFakeService(db) as never, {
    conversationId: "conv-1",
    modelViewId: "model-default",
  });

  assert.equal(selected, "pkm-healthy");
});

test("generation provider selection falls back by rewrite model view sort order before global provider priority", async () => {
  const db: FakeDb = {
    rewrite_model_views: [
      {
        id: "model-first",
        key: "first",
        label: "第一模型",
        description: null,
        sort_order: 1,
        is_enabled: true,
        is_default: false,
        created_at: "2026-06-28T00:00:00.000Z",
      },
      {
        id: "model-second",
        key: "second",
        label: "第二模型",
        description: null,
        sort_order: 2,
        is_enabled: true,
        is_default: false,
        created_at: "2026-06-28T00:00:01.000Z",
      },
    ],
    rewrite_model_routes: [
      {
        id: "route-first",
        model_view_id: "model-first",
        provider_key_model_id: "pkm-first-unhealthy",
        actual_model: "first-model",
        priority: 1,
        weight: 100,
        is_enabled: true,
        created_at: "2026-06-28T00:00:00.000Z",
      },
      {
        id: "route-second",
        model_view_id: "model-second",
        provider_key_model_id: "pkm-second",
        actual_model: "second-model",
        priority: 1,
        weight: 100,
        is_enabled: true,
        created_at: "2026-06-28T00:00:00.000Z",
      },
    ],
    ai_provider_key_models: [
      providerKeyModelRow({
        id: "pkm-first-unhealthy",
        modelId: "first-model",
        consecutiveFailures: 3,
        unhealthyUntil: "2099-01-01T00:00:00.000Z",
      }),
      providerKeyModelRow({ id: "pkm-second", modelId: "second-model", keyPriority: 50 }),
      providerKeyModelRow({ id: "pkm-global-priority", modelId: "global-model", keyPriority: 1 }),
    ],
    rewrite_skills: [],
    rewrite_skill_versions: [],
    rewrite_conversation_skills: [],
  };

  const selected = await resolveGenerationProviderKeyModelId(createFakeService(db) as never, {
    conversationId: "conv-1",
  });

  assert.equal(selected, "pkm-second");
});

test("skill prompt edits create a new immutable version", async () => {
  const db: FakeDb = {};
  const service = createFakeService(db);

  const created = await createSkill(service as never, {
    scope: "private",
    ownerId: "user-1",
    key: "tone-clean",
    name: "干净口播",
    systemPrompt: "第一版 prompt",
  });
  const nextVersion = await updateSkillPrompt(service as never, {
    skillId: created.skill.id,
    systemPrompt: "第二版 prompt",
  });

  assert.equal(created.version.version, 1);
  assert.equal(nextVersion.version, 2);
  assert.equal(db.rewrite_skill_versions.length, 2);
  assert.equal(db.rewrite_skill_versions[0]?.system_prompt, "第一版 prompt");
  assert.equal(db.rewrite_skill_versions[1]?.system_prompt, "第二版 prompt");
});

test("skill metadata can update independently and delete removes the skill row", async () => {
  const db: FakeDb = {};
  const service = createFakeService(db);

  const created = await createSkill(service as never, {
    scope: "private",
    ownerId: "user-1",
    key: "structure-clean",
    name: "结构整理",
    systemPrompt: "结构 prompt",
  });

  await updateSkillMetadata(service as never, {
    skillId: created.skill.id,
    name: "结构整理升级",
    description: "只改元信息",
    sortOrder: 12,
  });
  assert.equal(db.rewrite_skills[0]?.name, "结构整理升级");
  assert.equal(db.rewrite_skills[0]?.description, "只改元信息");
  assert.equal(db.rewrite_skills[0]?.sort_order, 12);
  assert.equal(db.rewrite_skill_versions.length, 1);

  await deleteSkill(service as never, created.skill.id);
  assert.equal(db.rewrite_skills.length, 0);
});

test("manual completed revision can become current, pending revision cannot", async () => {
  const db: FakeDb = {
    rewrite_documents: [
      {
        id: "doc-1",
        conversation_id: "conv-1",
        title: "画布",
        current_revision_id: null,
        created_at: "2026-06-28T00:00:00.000Z",
        updated_at: "2026-06-28T00:00:00.000Z",
      },
    ],
  };
  const service = createFakeService(db);

  const completed = await createRevision(service as never, {
    documentId: "doc-1",
    sourceType: "user_edit",
    status: "completed",
    fullContent: "第一段\n\n第二段",
  });
  await createParagraphs(service as never, {
    revisionId: completed.id,
    paragraphs: splitIntoParagraphs("第一段\n\n第二段").map((content, index) => ({
      paragraphId: `user-${index}`,
      position: index,
      content,
      sourceType: "user",
    })),
  });
  await setCurrentRevision(service as never, "doc-1", completed.id);

  const pending = await createRevision(service as never, {
    documentId: "doc-1",
    sourceType: "user_edit",
    status: "pending",
    fullContent: "未完成内容",
  });

  await assert.rejects(
    () => setCurrentRevision(service as never, "doc-1", pending.id),
    /只能将 completed 状态的 revision 设为 current/,
  );
  const document = await getDocumentByConversationId(service as never, "conv-1");
  assert.equal(document?.currentRevisionId, completed.id);
});

test("document history state supports undo and redo by moving current revision", async () => {
  const db: FakeDb = {
    rewrite_documents: [
      {
        id: "doc-1",
        conversation_id: "conv-1",
        title: "画布",
        current_revision_id: "rev-3",
        created_at: "2026-06-28T00:00:00.000Z",
        updated_at: "2026-06-28T00:00:00.000Z",
      },
    ],
    rewrite_document_revisions: [
      {
        id: "rev-1",
        document_id: "doc-1",
        parent_revision_id: null,
        source_type: "user_edit",
        status: "completed",
        generation_run_id: null,
        full_content: "第一版",
        message_id: null,
        meta: null,
        created_at: "2026-06-28T00:00:01.000Z",
      },
      {
        id: "rev-2",
        document_id: "doc-1",
        parent_revision_id: "rev-1",
        source_type: "user_edit",
        status: "completed",
        generation_run_id: null,
        full_content: "第二版",
        message_id: null,
        meta: null,
        created_at: "2026-06-28T00:00:02.000Z",
      },
      {
        id: "rev-3",
        document_id: "doc-1",
        parent_revision_id: "rev-2",
        source_type: "paragraph_patch",
        status: "completed",
        generation_run_id: null,
        full_content: "第三版",
        message_id: null,
        meta: null,
        created_at: "2026-06-28T00:00:03.000Z",
      },
    ],
    rewrite_document_paragraphs: [
      {
        id: "para-row-1",
        revision_id: "rev-1",
        paragraph_id: "p-1",
        position: 0,
        content: "第一版",
        is_locked: false,
        source_type: "user",
        created_at: "2026-06-28T00:00:01.000Z",
      },
      {
        id: "para-row-2",
        revision_id: "rev-2",
        paragraph_id: "p-1",
        position: 0,
        content: "第二版",
        is_locked: false,
        source_type: "user",
        created_at: "2026-06-28T00:00:02.000Z",
      },
      {
        id: "para-row-3",
        revision_id: "rev-3",
        paragraph_id: "p-1",
        position: 0,
        content: "第三版",
        is_locked: false,
        source_type: "ai",
        created_at: "2026-06-28T00:00:03.000Z",
      },
    ],
  };
  const service = createFakeService(db);

  const initial = await getDocumentHistoryState(service as never, "conv-1");
  assert.equal(initial?.saved, true);
  assert.equal(initial?.canUndo, true);
  assert.equal(initial?.canRedo, false);
  assert.equal(initial?.fullContent, "第三版");

  const afterUndo = await moveDocumentHistoryPointer(service as never, {
    conversationId: "conv-1",
    direction: "undo",
  });
  assert.equal(afterUndo.revision?.id, "rev-2");
  assert.equal(afterUndo.fullContent, "第二版");
  assert.equal(afterUndo.canUndo, true);
  assert.equal(afterUndo.canRedo, true);
  assert.equal(db.rewrite_documents[0]?.current_revision_id, "rev-2");

  const afterSecondUndo = await moveDocumentHistoryPointer(service as never, {
    conversationId: "conv-1",
    direction: "undo",
  });
  assert.equal(afterSecondUndo.revision?.id, "rev-1");
  assert.equal(afterSecondUndo.canUndo, false);
  assert.equal(afterSecondUndo.canRedo, true);

  const afterRedo = await moveDocumentHistoryPointer(service as never, {
    conversationId: "conv-1",
    direction: "redo",
  });
  assert.equal(afterRedo.revision?.id, "rev-2");
  assert.equal(afterRedo.fullContent, "第二版");
  assert.equal(db.rewrite_documents[0]?.current_revision_id, "rev-2");
});

test("paragraph patch generation replaces only selected unlocked paragraphs and records asset mentions", async () => {
  const db: FakeDb = {
    rewrite_messages: [],
    rewrite_conversation_skills: [],
    rewrite_documents: [
      {
        id: "doc-1",
        conversation_id: "conv-1",
        title: "画布",
        current_revision_id: "rev-current",
        created_at: "2026-06-28T00:00:00.000Z",
        updated_at: "2026-06-28T00:00:00.000Z",
      },
    ],
    rewrite_document_revisions: [
      {
        id: "rev-current",
        document_id: "doc-1",
        parent_revision_id: null,
        source_type: "user_edit",
        status: "completed",
        generation_run_id: null,
        full_content: "第一段\n\n第二段\n\n第三段",
        message_id: null,
        meta: null,
        created_at: "2026-06-28T00:00:00.000Z",
      },
    ],
    rewrite_document_paragraphs: [
      {
        id: "para-row-1",
        revision_id: "rev-current",
        paragraph_id: "p-1",
        position: 0,
        content: "第一段",
        is_locked: false,
        source_type: "user",
        created_at: "2026-06-28T00:00:00.000Z",
      },
      {
        id: "para-row-2",
        revision_id: "rev-current",
        paragraph_id: "p-2",
        position: 1,
        content: "第二段",
        is_locked: false,
        source_type: "user",
        created_at: "2026-06-28T00:00:00.000Z",
      },
      {
        id: "para-row-3",
        revision_id: "rev-current",
        paragraph_id: "p-3",
        position: 2,
        content: "第三段",
        is_locked: false,
        source_type: "user",
        created_at: "2026-06-28T00:00:00.000Z",
      },
    ],
  };
  const service = createFakeService(db);

  for await (const event of streamGeneration(service as never, {
    conversationId: "conv-1",
    userId: "user-1",
    userPrompt: "只把第二段改口语化",
    targetParagraphIds: ["p-2"],
    assetMentions: [{ id: "asset-1", name: "2026产品参数" }],
    aiClient: {
      streamChat: async function* () {
        yield { delta: "新的第二段" };
      },
    },
  })) {
    assert.ok(event.type);
  }

  const run = db.rewrite_generation_runs[0];
  const inputSnapshot = run?.input_snapshot as { targetParagraphIds?: string[]; assetMentions?: Array<{ name: string }> };
  const outputSnapshot = run?.output_snapshot as { fullContent?: string };
  assert.deepEqual(inputSnapshot.targetParagraphIds, ["p-2"]);
  assert.equal(inputSnapshot.assetMentions?.[0]?.name, "2026产品参数");
  assert.equal(outputSnapshot.fullContent, "第一段\n\n新的第二段\n\n第三段");
  assert.equal(db.rewrite_document_revisions.at(-1)?.source_type, "paragraph_patch");
  assert.equal(db.rewrite_document_revisions.at(-1)?.full_content, "第一段\n\n新的第二段\n\n第三段");
});

test("canvas generation strips conversational wrappers before saving", async () => {
  assert.equal(sanitizeCanvasOutput("修改后：新的第二段"), "新的第二段");
  assert.equal(
    sanitizeCanvasOutput("以下是优化后的文案：\n\n润色后：\n新的第一段\n\n新的第二段"),
    "新的第一段\n\n新的第二段",
  );
});

test("single paragraph patch keeps one paragraph unless user asks to split", async () => {
  const createDb = (): FakeDb => ({
    rewrite_messages: [],
    rewrite_conversation_skills: [],
    rewrite_documents: [
      {
        id: "doc-1",
        conversation_id: "conv-1",
        title: "画布",
        current_revision_id: "rev-current",
        created_at: "2026-06-28T00:00:00.000Z",
        updated_at: "2026-06-28T00:00:00.000Z",
      },
    ],
    rewrite_document_revisions: [
      {
        id: "rev-current",
        document_id: "doc-1",
        parent_revision_id: null,
        source_type: "user_edit",
        status: "completed",
        generation_run_id: null,
        full_content: "第一段\n\n第二段\n\n第三段",
        message_id: null,
        meta: null,
        created_at: "2026-06-28T00:00:00.000Z",
      },
    ],
    rewrite_document_paragraphs: [
      {
        id: "para-row-1",
        revision_id: "rev-current",
        paragraph_id: "p-1",
        position: 0,
        content: "第一段",
        is_locked: false,
        source_type: "user",
        created_at: "2026-06-28T00:00:00.000Z",
      },
      {
        id: "para-row-2",
        revision_id: "rev-current",
        paragraph_id: "p-2",
        position: 1,
        content: "第二段",
        is_locked: false,
        source_type: "user",
        created_at: "2026-06-28T00:00:00.000Z",
      },
      {
        id: "para-row-3",
        revision_id: "rev-current",
        paragraph_id: "p-3",
        position: 2,
        content: "第三段",
        is_locked: false,
        source_type: "user",
        created_at: "2026-06-28T00:00:00.000Z",
      },
    ],
  });

  const db = createDb();
  const service = createFakeService(db);
  for await (const event of streamGeneration(service as never, {
    conversationId: "conv-1",
    userId: "user-1",
    userPrompt: "第二段更口语",
    targetParagraphIds: ["p-2"],
    aiClient: {
      streamChat: async function* () {
        yield { delta: "修改后：第一句\n\n第二句" };
      },
    },
  })) {
    assert.ok(event.type);
  }

  assert.equal(db.rewrite_document_revisions.at(-1)?.full_content, "第一段\n\n第一句\n第二句\n\n第三段");
  assert.equal(
    db.rewrite_document_paragraphs.filter((row) => row.revision_id === db.rewrite_document_revisions.at(-1)?.id).length,
    3,
  );

  const splitDb = createDb();
  const splitService = createFakeService(splitDb);
  for await (const event of streamGeneration(splitService as never, {
    conversationId: "conv-1",
    userId: "user-1",
    userPrompt: "把第二段拆成两段",
    targetParagraphIds: ["p-2"],
    aiClient: {
      streamChat: async function* () {
        yield { delta: "第一句\n\n第二句" };
      },
    },
  })) {
    assert.ok(event.type);
  }

  assert.equal(splitDb.rewrite_document_revisions.at(-1)?.full_content, "第一段\n\n第一句\n\n第二句\n\n第三段");
});

test("generation run records skill/input/output snapshots and preserves locked paragraphs", async () => {
  const db: FakeDb = {
    rewrite_messages: [
      {
        id: "msg-1",
        conversation_id: "conv-1",
        role: "user",
        content: "上一轮原始需求",
        created_at: "2026-06-28T00:00:00.000Z",
      },
    ],
    rewrite_skills: [
      {
        id: "skill-1",
        scope: "private",
        owner_id: "user-1",
        key: "skill-tone",
        name: "强语感",
        description: null,
        icon: null,
        default_model_view_id: null,
        sort_order: 1,
        is_enabled: true,
        created_at: "2026-06-28T00:00:00.000Z",
        updated_at: "2026-06-28T00:00:00.000Z",
      },
    ],
    rewrite_skill_versions: [
      {
        id: "skill-version-1",
        skill_id: "skill-1",
        version: 3,
        system_prompt: "保持口播自然",
        meta: null,
        published_at: "2026-06-28T00:00:00.000Z",
        created_at: "2026-06-28T00:00:00.000Z",
      },
    ],
    rewrite_conversation_skills: [
      {
        id: "conv-skill-1",
        conversation_id: "conv-1",
        skill_id: "skill-1",
        skill_version_id: "skill-version-1",
        position: 1,
        is_active: true,
        injected_at: "2026-06-28T00:00:00.000Z",
      },
    ],
    rewrite_documents: [
      {
        id: "doc-1",
        conversation_id: "conv-1",
        title: "画布",
        current_revision_id: "rev-current",
        created_at: "2026-06-28T00:00:00.000Z",
        updated_at: "2026-06-28T00:00:00.000Z",
      },
    ],
    rewrite_document_revisions: [
      {
        id: "rev-current",
        document_id: "doc-1",
        parent_revision_id: null,
        source_type: "user_edit",
        status: "completed",
        generation_run_id: null,
        full_content: "锁定原文\n\n旧第二段",
        message_id: null,
        meta: null,
        created_at: "2026-06-28T00:00:00.000Z",
      },
    ],
    rewrite_document_paragraphs: [
      {
        id: "para-row-1",
        revision_id: "rev-current",
        paragraph_id: "p-locked",
        position: 0,
        content: "锁定原文",
        is_locked: true,
        source_type: "user",
        created_at: "2026-06-28T00:00:00.000Z",
      },
      {
        id: "para-row-2",
        revision_id: "rev-current",
        paragraph_id: "p-open",
        position: 1,
        content: "旧第二段",
        is_locked: false,
        source_type: "user",
        created_at: "2026-06-28T00:00:00.000Z",
      },
    ],
  };
  const service = createFakeService(db);

  const events = [];
  for await (const event of streamGeneration(service as never, {
    conversationId: "conv-1",
    userId: "user-1",
    userPrompt: "重写未锁定段落",
    providerKeyModelId: "pkm-1",
    aiClient: {
      streamChat: async function* () {
        yield { delta: "模型误改锁定段" };
        yield { delta: "\n\n新第二段" };
        yield {
          usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
          response: {
            model: "claude-sonnet-4-6",
            channelName: "主供应商",
            providerKeyModelId: "pkm-1",
            elapsedMs: 1234,
          },
        };
      },
    },
  })) {
    events.push(event);
  }

  const run = db.rewrite_generation_runs[0];
  assert.deepEqual(run?.skill_version_ids, ["skill-version-1"]);
  assert.equal(run?.status, "completed");
  assert.equal(run?.actual_model, "claude-sonnet-4-6");
  assert.equal(run?.provider_name, "主供应商");
  assert.equal(run?.provider_key_model_id, "pkm-1");
  assert.equal(run?.prompt_tokens, 11);
  assert.equal(run?.completion_tokens, 7);
  assert.equal(run?.total_tokens, 18);
  assert.equal(run?.elapsed_ms, 1234);

  const inputSnapshot = run?.input_snapshot as { userPrompt?: string; skillStack?: Array<{ skillVersionId: string }>; documentSnapshot?: string };
  assert.equal(inputSnapshot.userPrompt, "重写未锁定段落");
  assert.equal(inputSnapshot.skillStack?.[0]?.skillVersionId, "skill-version-1");
  assert.match(inputSnapshot.documentSnapshot ?? "", /\[LOCKED\] 锁定原文/);

  const outputSnapshot = run?.output_snapshot as { fullContent?: string; lockedParagraphIds?: string[] };
  assert.equal(outputSnapshot.fullContent, "锁定原文\n\n新第二段");
  assert.deepEqual(outputSnapshot.lockedParagraphIds, ["p-locked"]);
  assert.equal(db.rewrite_document_revisions.at(-1)?.full_content, "锁定原文\n\n新第二段");
  assert.equal(events.at(-1)?.type, "generation_complete");
});
