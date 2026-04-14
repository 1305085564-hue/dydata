import assert from "node:assert/strict";
import test from "node:test";

import * as rewrite from "./shared";

type AiReply = {
  content: string;
  model: string;
  channelName: string;
  elapsedMs: number;
};

const aiQueue: Array<AiReply | Error> = [];

function popAiReply(): AiReply | Error {
  const next = aiQueue.shift();
  if (!next) {
    return new Error("缺少 AI mock 响应");
  }
  return next;
}

rewrite.__internal.setAiCallerForTests(async () => {
  const next = popAiReply();
  if (next instanceof Error) {
    throw next;
  }

  return next;
});

type Row = Record<string, unknown>;
type FakeDb = Record<string, Row[]>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function nextIso(counter: { value: number }) {
  const time = Date.UTC(2026, 3, 14, 12, 0, counter.value);
  counter.value += 1;
  return new Date(time).toISOString();
}

class FakeQuery implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private op: "select" | "insert" | "update" = "select";
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

  eq(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  in(field: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[field]));
    return this;
  }

  is(field: string, value: unknown) {
    this.filters.push((row) => (value === null ? row[field] == null : row[field] === value));
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
    if (this.op === "insert") {
      return this.executeInsert();
    }

    if (this.op === "update") {
      return this.executeUpdate();
    }

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

    if (this.table === "rewrite_messages") {
      for (const message of inserted) {
        const conversation = (this.db.rewrite_conversations ?? []).find(
          (row) => row.id === message["conversation_id"],
        );
        if (conversation) {
          conversation.last_message_at = message["created_at"];
          conversation.updated_at = message["created_at"];
        }
      }
    }

    return this.returning ? this.formatResult(inserted) : { data: null, error: null };
  }

  private executeUpdate() {
    const rows = (this.db[this.table] ?? []).filter((row) => this.filters.every((filter) => filter(row)));
    for (const row of rows) {
      Object.assign(row, clone(this.updatePayload ?? {}));
      if (!("updated_at" in (this.updatePayload ?? {}))) {
        row.updated_at = nextIso(this.counter);
      }
    }
    return { data: null, error: null };
  }

  private getRows() {
    const rows = (this.db[this.table] ?? []).map((row) => clone(row));
    if (this.table !== "rewrite_model_routes") {
      return rows;
    }

    return rows.map((row) => ({
      ...row,
      channel: (this.db.ai_channels ?? []).find((channel) => channel.id === row.channel_id) ?? null,
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

    if (this.table === "rewrite_conversations") {
      return {
        id: (row.id as string | undefined) ?? `conv-${this.counter.value}`,
        title: row.title ?? "新会话",
        auto_mode_enabled: row.auto_mode_enabled ?? true,
        selected_model_view_id: row.selected_model_view_id ?? null,
        selected_mode_id: row.selected_mode_id ?? null,
        selected_length_preset_id: row.selected_length_preset_id ?? null,
        last_message_at: row.last_message_at ?? now,
        created_at: row.created_at ?? now,
        updated_at: row.updated_at ?? now,
        ...row,
      };
    }

    if (this.table === "rewrite_messages") {
      return {
        id: (row.id as string | undefined) ?? `msg-${this.counter.value}`,
        created_at: row.created_at ?? now,
        ...row,
      };
    }

    return { ...row };
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

function buildBaseDb(): FakeDb {
  return {
    ai_feature_config: [
      {
        feature_key: "content_rewrite",
        label: "员工文案改写",
        system_prompt: "只改写，不编造。",
        is_enabled: true,
      },
    ],
    rewrite_model_views: [
      {
        id: "model-default",
        key: "default",
        label: "标准模型",
        description: "默认",
        sort_order: 1,
        is_enabled: true,
        is_default: true,
      },
      {
        id: "model-alt",
        key: "alt",
        label: "增强模型",
        description: "更强",
        sort_order: 2,
        is_enabled: true,
        is_default: false,
      },
    ],
    rewrite_modes: [
      {
        id: "mode-sharp",
        key: "sharp",
        name: "犀利",
        description: "更有攻击性",
        mode_prompt: "语气更利落。",
        sort_order: 1,
        is_enabled: true,
        is_default: false,
      },
    ],
    rewrite_length_presets: [
      {
        id: "length-default",
        key: "normal",
        name: "标准",
        description: "默认长度",
        length_prompt: "控制在 180 字左右。",
        sort_order: 1,
        is_enabled: true,
        is_default: true,
      },
      {
        id: "length-long",
        key: "long",
        name: "长版",
        description: "更完整",
        length_prompt: "控制在 260 字左右。",
        sort_order: 2,
        is_enabled: true,
        is_default: false,
      },
    ],
    rewrite_workflows: [
      {
        id: "workflow-auto",
        key: "auto",
        name: "自动双阶段",
        description: "先结构后润色",
        sort_order: 1,
        is_enabled: true,
        is_default: true,
      },
    ],
    rewrite_workflow_steps: [
      {
        id: "step-structure",
        workflow_id: "workflow-auto",
        model_view_id: null,
        step_key: "structure",
        name: "结构改写",
        description: "先稳结构",
        step_prompt: "先梳理结构。",
        sort_order: 1,
        is_enabled: true,
      },
      {
        id: "step-polish",
        workflow_id: "workflow-auto",
        model_view_id: null,
        step_key: "polish",
        name: "润色加强",
        description: "再提语感",
        step_prompt: "再做润色。",
        sort_order: 2,
        is_enabled: true,
      },
    ],
    rewrite_model_routes: [
      {
        id: "route-default",
        model_view_id: "model-default",
        workflow_step_id: null,
        channel_id: "channel-1",
        actual_model: "claude-sonnet-4-6",
        priority: 1,
        weight: 100,
        is_enabled: true,
      },
      {
        id: "route-alt",
        model_view_id: "model-alt",
        workflow_step_id: null,
        channel_id: "channel-1",
        actual_model: "claude-sonnet-4-6",
        priority: 1,
        weight: 100,
        is_enabled: true,
      },
    ],
    ai_channels: [
      {
        id: "channel-1",
        name: "主渠道",
        is_enabled: true,
      },
    ],
    rewrite_conversations: [],
    rewrite_messages: [],
  };
}

function pushAiSuccess(recommendedText: string, summary = "处理完成") {
  aiQueue.push({
    content: JSON.stringify({
      title: "改写结果",
      summary,
      versions: [
        { title: "版本A", content: recommendedText },
        { title: "版本B", content: `${recommendedText}（备选）` },
      ],
      notes: ["保留事实"],
      follow_up_suggestions: ["可以继续压缩标题"],
    }),
    model: "claude-sonnet-4-6",
    channelName: "主渠道",
    elapsedMs: 321,
  });
}

function buildActor() {
  return {
    userId: "user-1",
    name: "测试员",
    role: "member" as const,
  };
}

test("bootstrap 返回动态配置和默认值", async () => {
  const db = buildBaseDb();
  const service = createFakeService(db);

  const payload = await rewrite.getRewriteBootstrapPayload(service as never);

  assert.equal(payload.feature.enabled, true);
  assert.equal(payload.defaults.modelViewId, "model-default");
  assert.equal(payload.defaults.lengthPresetId, "length-default");
  assert.equal(payload.defaults.workflowId, "workflow-auto");
  assert.deepEqual(
    payload.workflow?.steps.map((step) => step.key),
    ["structure", "polish"],
  );
});

test("bootstrap 在功能关闭时仍返回配置，但 enabled=false 供前端阻断", async () => {
  const db = buildBaseDb();
  db.ai_feature_config[0]!.is_enabled = false;
  const service = createFakeService(db);

  const payload = await rewrite.getRewriteBootstrapPayload(service as never);

  assert.equal(payload.feature.enabled, false);
  assert.equal(payload.modelViews.length, 2);
});

test("conversations 只返回当前用户自己的会话，且 selected 结构统一", async () => {
  const db = buildBaseDb();
  db.rewrite_conversations.push(
    {
      id: "conv-1",
      user_id: "user-1",
      title: "我的会话",
      auto_mode_enabled: true,
      selected_model_view_id: "model-default",
      selected_mode_id: "mode-sharp",
      selected_length_preset_id: "length-default",
      last_message_at: "2026-04-14T12:00:00.000Z",
      created_at: "2026-04-14T11:00:00.000Z",
      updated_at: "2026-04-14T12:00:00.000Z",
    },
    {
      id: "conv-2",
      user_id: "user-2",
      title: "别人的会话",
      auto_mode_enabled: false,
      selected_model_view_id: "model-alt",
      selected_mode_id: null,
      selected_length_preset_id: "length-long",
      last_message_at: "2026-04-14T13:00:00.000Z",
      created_at: "2026-04-14T10:00:00.000Z",
      updated_at: "2026-04-14T13:00:00.000Z",
    },
  );
  const service = createFakeService(db);

  const conversations = await rewrite.listUserConversations(service as never, {
    userId: "user-1",
    limit: 30,
  });

  assert.equal(conversations.length, 1);
  assert.equal(conversations[0]?.id, "conv-1");
  assert.equal(conversations[0]?.selected.autoModeEnabled, true);
  assert.equal(conversations[0]?.selected.modelViewId, "model-default");
  assert.equal(conversations[0]?.selected.modelView?.label, "标准模型");
});

test("messages 只返回当前用户自己的消息，并统一 assistant structuredResult", async () => {
  const db = buildBaseDb();
  db.rewrite_conversations.push({
    id: "conv-1",
    user_id: "user-1",
    title: "我的会话",
    auto_mode_enabled: false,
    selected_model_view_id: "model-alt",
    selected_mode_id: "mode-sharp",
    selected_length_preset_id: "length-long",
    last_message_at: "2026-04-14T12:00:00.000Z",
    created_at: "2026-04-14T11:00:00.000Z",
    updated_at: "2026-04-14T12:00:00.000Z",
  });
  db.rewrite_messages.push(
    {
      id: "msg-1",
      conversation_id: "conv-1",
      user_id: "user-1",
      role: "assistant",
      generation_mode: "single",
      message_status: "success",
      content: "版本A：旧文案",
      structured_result: {
        final: {
          versions: [{ title: "版本A", content: "旧文案" }],
          recommendedText: "旧文案",
        },
        steps: [{ key: "single", status: "success", content: "旧文案" }],
      },
      request_snapshot: {
        autoModeEnabled: false,
        modelViewId: "model-alt",
        modeId: "mode-sharp",
        lengthPresetId: "length-long",
        workflowId: null,
      },
      error_message: null,
      created_at: "2026-04-14T12:00:00.000Z",
    },
    {
      id: "msg-2",
      conversation_id: "conv-1",
      user_id: "user-2",
      role: "assistant",
      generation_mode: "single",
      message_status: "success",
      content: "别人的消息",
      structured_result: null,
      request_snapshot: null,
      error_message: null,
      created_at: "2026-04-14T12:01:00.000Z",
    },
  );
  const service = createFakeService(db);

  const payload = await rewrite.listConversationMessages(service as never, {
    userId: "user-1",
    conversationId: "conv-1",
  });

  assert.equal(payload.messages.length, 1);
  assert.equal(payload.messages[0]?.conversationId, "conv-1");
  assert.equal(payload.messages[0]?.structuredResult?.generationMode, "single");
  assert.equal(payload.messages[0]?.structuredResult?.selected.modelViewId, "model-alt");
  assert.equal(payload.messages[0]?.structuredResult?.final.versions[0]?.content, "旧文案");
  assert.equal(payload.messages[0]?.structuredResult?.steps[0]?.stepKey, "single");
});

test("chat 在 auto 模式下返回 structuredResult，第二步失败会回退第一步并标记 partial_success", async () => {
  const db = buildBaseDb();
  const service = createFakeService(db);
  pushAiSuccess("先稳住结构版", "第一步完成");
  aiQueue.push(new Error("第二步渠道超时"));

  const payload = await rewrite.handleRewriteChat({
    service: service as never,
    actor: buildActor(),
    message: "把这段财经文案改顺一点",
    autoModeEnabled: true,
    modelViewId: "model-default",
    modeId: "mode-sharp",
    lengthPresetId: "length-default",
  });

  assert.equal(payload.conversation.selected.autoModeEnabled, true);
  assert.equal(payload.message.structuredResult?.generationMode, "auto");
  assert.equal(payload.message.structuredResult?.status, "partial_success");
  assert.equal(payload.message.structuredResult?.steps.length, 2);
  assert.equal(payload.message.structuredResult?.steps[1]?.status, "failed");
  assert.equal(payload.message.structuredResult?.final.recommendedText, "先稳住结构版");
});

test("chat 在 single 模式下返回 structuredResult", async () => {
  const db = buildBaseDb();
  const service = createFakeService(db);
  pushAiSuccess("单步直出版本", "单步完成");

  const payload = await rewrite.handleRewriteChat({
    service: service as never,
    actor: buildActor(),
    message: "直接给我一版能发的",
    autoModeEnabled: false,
    modelViewId: "model-alt",
    modeId: null,
    lengthPresetId: "length-long",
  });

  assert.equal(payload.conversation.selected.autoModeEnabled, false);
  assert.equal(payload.message.generationMode, "single");
  assert.equal(payload.message.structuredResult?.generationMode, "single");
  assert.equal(payload.message.structuredResult?.status, "success");
  assert.equal(payload.message.structuredResult?.steps.length, 1);
  assert.equal(payload.message.requestSnapshot?.modeId, null);
});

test("messages 查询不存在会话时返回会话不存在", async () => {
  const db = buildBaseDb();
  const service = createFakeService(db);

  await assert.rejects(
    () =>
      rewrite.listConversationMessages(service as never, {
        userId: "user-1",
        conversationId: "conv-missing",
      }),
    /会话不存在/,
  );
});

test("chat 查询不存在会话时返回会话不存在", async () => {
  const db = buildBaseDb();
  const service = createFakeService(db);

  await assert.rejects(
    () =>
      rewrite.handleRewriteChat({
        service: service as never,
        actor: buildActor(),
        conversationId: "conv-missing",
        message: "继续改一版",
      }),
    /会话不存在/,
  );
});

test("chat 在功能关闭时直接阻断，不创建会话", async () => {
  const db = buildBaseDb();
  db.ai_feature_config[0]!.is_enabled = false;
  const service = createFakeService(db);

  await assert.rejects(
    () =>
      rewrite.handleRewriteChat({
        service: service as never,
        actor: buildActor(),
        message: "改得更顺一点",
      }),
    /文案改写功能已关闭/,
  );

  assert.equal(db.rewrite_conversations.length, 0);
  assert.equal(db.rewrite_messages.length, 0);
});

test("老会话继续聊天会继承已有选择，mode 清空后仍可用，auto/single 切换不串", async () => {
  const db = buildBaseDb();
  db.rewrite_conversations.push({
    id: "conv-keep",
    user_id: "user-1",
    title: "旧会话",
    auto_mode_enabled: true,
    selected_model_view_id: "model-alt",
    selected_mode_id: "mode-sharp",
    selected_length_preset_id: "length-long",
    last_message_at: "2026-04-14T11:59:00.000Z",
    created_at: "2026-04-14T11:00:00.000Z",
    updated_at: "2026-04-14T11:59:00.000Z",
  });
  const service = createFakeService(db);
  pushAiSuccess("继承旧配置后的单步结果", "切到 single");

  const payload = await rewrite.handleRewriteChat({
    service: service as never,
    actor: buildActor(),
    conversationId: "conv-keep",
    message: "继续改，但把附加模式清掉",
    autoModeEnabled: false,
    modeId: null,
  });

  assert.equal(payload.conversation.selected.autoModeEnabled, false);
  assert.equal(payload.conversation.selected.modelViewId, "model-alt");
  assert.equal(payload.conversation.selected.lengthPresetId, "length-long");
  assert.equal(payload.conversation.selected.modeId, null);
  assert.equal(payload.message.requestSnapshot?.modelViewId, "model-alt");
  assert.equal(payload.message.requestSnapshot?.lengthPresetId, "length-long");
  assert.equal(payload.message.requestSnapshot?.modeId, null);

  const savedConversation = db.rewrite_conversations.find((row) => row.id === "conv-keep");
  assert.equal(savedConversation?.auto_mode_enabled, false);
  assert.equal(savedConversation?.selected_model_view_id, "model-alt");
  assert.equal(savedConversation?.selected_length_preset_id, "length-long");
  assert.equal(savedConversation?.selected_mode_id, null);
});
