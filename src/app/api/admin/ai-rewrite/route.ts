import { NextRequest, NextResponse } from "next/server";

import {
  requireOwnerActor,
  toBoolean,
  toNullableString,
  toPriority,
  toTrimmedString,
} from "../ai-channels/_shared";

type RewriteEntity =
  | "feature_config"
  | "fixed_mode"
  | "model_view"
  | "model_route"
  | "mode"
  | "length_preset"
  | "workflow"
  | "workflow_step";

type JoinedValue<T> = T | T[] | null;

type ModelViewJoin = {
  id: string;
  key: string;
  label: string;
};

type LengthPresetJoin = {
  id: string;
  key: string;
  name: string;
};

type WorkflowJoin = {
  id: string;
  key: string;
  name: string;
};

type WorkflowStepJoin = {
  id: string;
  workflow_id: string;
  step_key: string;
  name: string;
};

type ChannelJoin = {
  id: string;
  name: string;
  model: string | null;
  is_enabled: boolean;
};

type FeatureConfigRow = {
  id: string;
  feature_key: string;
  label: string;
  system_prompt: string | null;
  is_enabled: boolean;
  output_token_limit: number | null;
  context_message_limit: number | null;
};

const DEFAULTABLE_TABLES = new Map<
  Exclude<RewriteEntity, "model_route" | "workflow_step">,
  string
>([
  ["model_view", "rewrite_model_views"],
  ["mode", "rewrite_modes"],
  ["length_preset", "rewrite_length_presets"],
  ["workflow", "rewrite_workflows"],
]);

function normalizeJoined<T>(value: JoinedValue<T>) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function parseEntity(value: unknown): RewriteEntity | null {
  const entity = toTrimmedString(value);

  if (
    entity === "feature_config" ||
    entity === "model_view" ||
    entity === "fixed_mode" ||
    entity === "model_route" ||
    entity === "mode" ||
    entity === "length_preset" ||
    entity === "workflow" ||
    entity === "workflow_step"
  ) {
    return entity;
  }

  return null;
}

async function applySingleDefault(
  supabase: Awaited<ReturnType<typeof requireOwnerActor>> extends infer T
    ? T extends { supabase: infer S }
      ? S
      : never
    : never,
  entity: Exclude<RewriteEntity, "model_route" | "workflow_step">,
  currentId: string,
) {
  const table = DEFAULTABLE_TABLES.get(entity);
  if (!table) return;

  const { error } = await supabase
    .from(table)
    .update({ is_default: false })
    .neq("id", currentId)
    .eq("is_default", true);

  if (error) {
    throw new Error(error.message);
  }
}

async function loadBundle(
  supabase: Awaited<ReturnType<typeof requireOwnerActor>> extends infer T
    ? T extends { supabase: infer S }
      ? S
      : never
    : never,
) {
  const [
    featureConfigResult,
    modelViewsResult,
    fixedModesResult,
    modelRoutesResult,
    modesResult,
    lengthPresetsResult,
    workflowsResult,
    workflowStepsResult,
    channelsResult,
  ] = await Promise.all([
    supabase
      .from("ai_feature_config")
      .select(
        "id, feature_key, label, system_prompt, is_enabled, output_token_limit, context_message_limit",
      )
      .eq("feature_key", "content_rewrite")
      .maybeSingle(),
    supabase
      .from("rewrite_model_views")
      .select("id, key, label, description, sort_order, is_enabled, is_default, created_at, updated_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("rewrite_fixed_modes")
      .select(
        "id, key, name, description, fixed_prompt, model_view_id, length_preset_id, sort_order, is_enabled, created_at, updated_at, model_view:rewrite_model_views(id, key, label), length_preset:rewrite_length_presets(id, key, name)",
      )
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("rewrite_model_routes")
      .select(
        "id, model_view_id, workflow_step_id, channel_id, actual_model, priority, weight, is_enabled, created_at, updated_at, model_view:rewrite_model_views(id, key, label), workflow_step:rewrite_workflow_steps(id, workflow_id, step_key, name), channel:ai_channels(id, name, model, is_enabled)",
      )
      .order("priority", { ascending: true })
      .order("weight", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("rewrite_modes")
      .select("id, key, name, description, mode_prompt, sort_order, is_enabled, is_default, created_at, updated_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("rewrite_length_presets")
      .select(
        "id, key, name, description, length_prompt, sort_order, is_enabled, is_default, created_at, updated_at",
      )
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("rewrite_workflows")
      .select("id, key, name, description, sort_order, is_enabled, is_default, created_at, updated_at")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("rewrite_workflow_steps")
      .select(
        "id, workflow_id, model_view_id, step_key, name, description, step_prompt, sort_order, is_enabled, created_at, updated_at, workflow:rewrite_workflows(id, key, name), model_view:rewrite_model_views(id, key, label)",
      )
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("ai_channels")
      .select("id, name, model, is_enabled, priority")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (featureConfigResult.error) throw new Error(featureConfigResult.error.message);
  if (modelViewsResult.error) throw new Error(modelViewsResult.error.message);
  if (fixedModesResult.error) throw new Error(fixedModesResult.error.message);
  if (modelRoutesResult.error) throw new Error(modelRoutesResult.error.message);
  if (modesResult.error) throw new Error(modesResult.error.message);
  if (lengthPresetsResult.error) throw new Error(lengthPresetsResult.error.message);
  if (workflowsResult.error) throw new Error(workflowsResult.error.message);
  if (workflowStepsResult.error) throw new Error(workflowStepsResult.error.message);
  if (channelsResult.error) throw new Error(channelsResult.error.message);

  return {
    featureConfig: (featureConfigResult.data ?? null) as FeatureConfigRow | null,
    modelViews: (modelViewsResult.data ?? []) as Array<Record<string, unknown>>,
    fixedModes: ((fixedModesResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      model_view: normalizeJoined(row.model_view as JoinedValue<ModelViewJoin>),
      length_preset: normalizeJoined(row.length_preset as JoinedValue<LengthPresetJoin>),
    })),
    modelRoutes: ((modelRoutesResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      model_view: normalizeJoined(row.model_view as JoinedValue<ModelViewJoin>),
      workflow_step: normalizeJoined(row.workflow_step as JoinedValue<WorkflowStepJoin>),
      channel: normalizeJoined(row.channel as JoinedValue<ChannelJoin>),
    })),
    modes: (modesResult.data ?? []) as Array<Record<string, unknown>>,
    lengthPresets: (lengthPresetsResult.data ?? []) as Array<Record<string, unknown>>,
    workflows: (workflowsResult.data ?? []) as Array<Record<string, unknown>>,
    workflowSteps: ((workflowStepsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      workflow: normalizeJoined(row.workflow as JoinedValue<WorkflowJoin>),
      model_view: normalizeJoined(row.model_view as JoinedValue<ModelViewJoin>),
    })),
    channels: (channelsResult.data ?? []) as Array<Record<string, unknown>>,
  };
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function normalizeId(value: unknown) {
  return toTrimmedString(value) || null;
}

export async function GET() {
  const auth = await requireOwnerActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const bundle = await loadBundle(auth.supabase);
    return NextResponse.json(bundle);
  } catch (error) {
    const message = error instanceof Error ? error.message : "加载文案改写配置失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireOwnerActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("请求体格式不正确");
  }

  const entity = parseEntity(body.entity);
  if (!entity) {
    return badRequest("entity 不合法");
  }

  const { supabase } = auth;

  try {
    let createdId: string | null = null;

    if (entity === "model_view") {
      const key = toTrimmedString(body.key);
      const label = toTrimmedString(body.label);

      if (!key || !label) {
        return badRequest("展示模型缺少 key 或 label");
      }

      const { data, error } = await supabase
        .from("rewrite_model_views")
        .insert({
          key,
          label,
          description: toNullableString(body.description),
          sort_order: toPriority(body.sort_order, 100),
          is_default: toBoolean(body.is_default, false),
          is_enabled: toBoolean(body.is_enabled, true),
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "创建展示模型失败");
      }

      createdId = data.id;

      if (toBoolean(body.is_default, false)) {
        await applySingleDefault(supabase, "model_view", createdId!);
      }
    }

    if (entity === "fixed_mode") {
      const key = toTrimmedString(body.key);
      const name = toTrimmedString(body.name);
      const fixedPrompt = toTrimmedString(body.fixed_prompt);
      const modelViewId = normalizeId(body.model_view_id);

      if (!key || !name || !fixedPrompt || !modelViewId) {
        return badRequest("固定模式缺少 key、名称、绑定模型或固定提示词");
      }

      const { data, error } = await supabase
        .from("rewrite_fixed_modes")
        .insert({
          key,
          name,
          description: toNullableString(body.description),
          fixed_prompt: fixedPrompt,
          model_view_id: modelViewId,
          length_preset_id: normalizeId(body.length_preset_id),
          sort_order: toPriority(body.sort_order, 100),
          is_enabled: toBoolean(body.is_enabled, true),
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "创建固定模式失败");
      }

      createdId = data.id;
    }

    if (entity === "model_route") {
      const modelViewId = normalizeId(body.model_view_id);
      const channelId = normalizeId(body.channel_id);
      const actualModel = toTrimmedString(body.actual_model);

      if (!modelViewId || !channelId || !actualModel) {
        return badRequest("路由缺少展示模型、渠道或真实模型");
      }

      const { data, error } = await supabase
        .from("rewrite_model_routes")
        .insert({
          model_view_id: modelViewId,
          workflow_step_id: normalizeId(body.workflow_step_id),
          channel_id: channelId,
          actual_model: actualModel,
          priority: toPriority(body.priority, 100),
          weight: toPriority(body.weight, 100),
          is_enabled: toBoolean(body.is_enabled, true),
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "创建执行路线失败");
      }

      createdId = data.id;
    }

    if (entity === "mode") {
      const key = toTrimmedString(body.key);
      const name = toTrimmedString(body.name);
      const modePrompt = toTrimmedString(body.mode_prompt);

      if (!key || !name || !modePrompt) {
        return badRequest("模式缺少 key、名称或提示词");
      }

      const { data, error } = await supabase
        .from("rewrite_modes")
        .insert({
          key,
          name,
          description: toNullableString(body.description),
          mode_prompt: modePrompt,
          sort_order: toPriority(body.sort_order, 100),
          is_default: toBoolean(body.is_default, false),
          is_enabled: toBoolean(body.is_enabled, true),
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "创建模式失败");
      }

      createdId = data.id;

      if (toBoolean(body.is_default, false)) {
        await applySingleDefault(supabase, "mode", createdId!);
      }
    }

    if (entity === "length_preset") {
      const key = toTrimmedString(body.key);
      const name = toTrimmedString(body.name);
      const lengthPrompt = toTrimmedString(body.length_prompt);

      if (!key || !name || !lengthPrompt) {
        return badRequest("字数预设缺少 key、名称或提示词");
      }

      const { data, error } = await supabase
        .from("rewrite_length_presets")
        .insert({
          key,
          name,
          description: toNullableString(body.description),
          length_prompt: lengthPrompt,
          sort_order: toPriority(body.sort_order, 100),
          is_default: toBoolean(body.is_default, false),
          is_enabled: toBoolean(body.is_enabled, true),
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "创建字数预设失败");
      }

      createdId = data.id;

      if (toBoolean(body.is_default, false)) {
        await applySingleDefault(supabase, "length_preset", createdId!);
      }
    }

    if (entity === "workflow") {
      const key = toTrimmedString(body.key);
      const name = toTrimmedString(body.name);

      if (!key || !name) {
        return badRequest("流程缺少 key 或名称");
      }

      const { data, error } = await supabase
        .from("rewrite_workflows")
        .insert({
          key,
          name,
          description: toNullableString(body.description),
          sort_order: toPriority(body.sort_order, 100),
          is_default: toBoolean(body.is_default, false),
          is_enabled: toBoolean(body.is_enabled, true),
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "创建流程失败");
      }

      createdId = data.id;

      if (toBoolean(body.is_default, false)) {
        await applySingleDefault(supabase, "workflow", createdId!);
      }
    }

    if (entity === "workflow_step") {
      const workflowId = normalizeId(body.workflow_id);
      const stepKey = toTrimmedString(body.step_key);
      const name = toTrimmedString(body.name);
      const stepPrompt = toTrimmedString(body.step_prompt);

      if (!workflowId || !stepKey || !name || !stepPrompt) {
        return badRequest("流程步骤缺少 workflow_id、step_key、名称或提示词");
      }

      const { data, error } = await supabase
        .from("rewrite_workflow_steps")
        .insert({
          workflow_id: workflowId,
          model_view_id: normalizeId(body.model_view_id),
          step_key: stepKey,
          name,
          description: toNullableString(body.description),
          step_prompt: stepPrompt,
          sort_order: toPriority(body.sort_order, 100),
          is_enabled: toBoolean(body.is_enabled, true),
        })
        .select("id")
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? "创建流程步骤失败");
      }

      createdId = data.id;
    }

    if (!createdId) {
      throw new Error("未执行任何创建操作");
    }

    return NextResponse.json({
      ok: true,
      bundle: await loadBundle(supabase),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireOwnerActor();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return badRequest("请求体格式不正确");
  }

  const entity = parseEntity(body.entity);
  const id = normalizeId(body.id);

  if (!entity) {
    return badRequest("entity 不合法");
  }

  if (!id) {
    return badRequest("缺少 id");
  }

  const { supabase } = auth;

  try {
    if (entity === "feature_config") {
      const patch: Record<string, unknown> = {};

      if (body.is_enabled !== undefined) patch.is_enabled = toBoolean(body.is_enabled, true);
      if (body.output_token_limit !== undefined) patch.output_token_limit = toPriority(body.output_token_limit, 3600);
      if (body.context_message_limit !== undefined) {
        patch.context_message_limit = toPriority(body.context_message_limit, 30);
      }

      if (Object.keys(patch).length === 0) return badRequest("没有可更新字段");

      const { error } = await supabase.from("ai_feature_config").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    }

    if (entity === "model_view") {
      const patch: Record<string, unknown> = {};

      if (body.key !== undefined) {
        const key = toTrimmedString(body.key);
        if (!key) return badRequest("展示模型 key 不能为空");
        patch.key = key;
      }
      if (body.label !== undefined) {
        const label = toTrimmedString(body.label);
        if (!label) return badRequest("展示模型 label 不能为空");
        patch.label = label;
      }
      if (body.description !== undefined) patch.description = toNullableString(body.description);
      if (body.sort_order !== undefined) patch.sort_order = toPriority(body.sort_order, 100);
      if (body.is_enabled !== undefined) patch.is_enabled = toBoolean(body.is_enabled, true);
      if (body.is_default !== undefined) patch.is_default = toBoolean(body.is_default, false);

      if (Object.keys(patch).length === 0) return badRequest("没有可更新字段");

      const { error } = await supabase.from("rewrite_model_views").update(patch).eq("id", id);
      if (error) throw new Error(error.message);

      if (patch.is_default === true) {
        await applySingleDefault(supabase, "model_view", id);
      }
    }

    if (entity === "fixed_mode") {
      const patch: Record<string, unknown> = {};

      if (body.key !== undefined) {
        const key = toTrimmedString(body.key);
        if (!key) return badRequest("固定模式 key 不能为空");
        patch.key = key;
      }
      if (body.name !== undefined) {
        const name = toTrimmedString(body.name);
        if (!name) return badRequest("固定模式名称不能为空");
        patch.name = name;
      }
      if (body.description !== undefined) patch.description = toNullableString(body.description);
      if (body.fixed_prompt !== undefined) {
        const fixedPrompt = toTrimmedString(body.fixed_prompt);
        if (!fixedPrompt) return badRequest("固定提示词不能为空");
        patch.fixed_prompt = fixedPrompt;
      }
      if (body.model_view_id !== undefined) {
        const modelViewId = normalizeId(body.model_view_id);
        if (!modelViewId) return badRequest("绑定展示模型不能为空");
        patch.model_view_id = modelViewId;
      }
      if (body.length_preset_id !== undefined) patch.length_preset_id = normalizeId(body.length_preset_id);
      if (body.sort_order !== undefined) patch.sort_order = toPriority(body.sort_order, 100);
      if (body.is_enabled !== undefined) patch.is_enabled = toBoolean(body.is_enabled, true);

      if (Object.keys(patch).length === 0) return badRequest("没有可更新字段");

      const { error } = await supabase.from("rewrite_fixed_modes").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    }

    if (entity === "model_route") {
      const patch: Record<string, unknown> = {};

      if (body.model_view_id !== undefined) {
        const modelViewId = normalizeId(body.model_view_id);
        if (!modelViewId) return badRequest("展示模型不能为空");
        patch.model_view_id = modelViewId;
      }
      if (body.workflow_step_id !== undefined) patch.workflow_step_id = normalizeId(body.workflow_step_id);
      if (body.channel_id !== undefined) {
        const channelId = normalizeId(body.channel_id);
        if (!channelId) return badRequest("渠道不能为空");
        patch.channel_id = channelId;
      }
      if (body.actual_model !== undefined) {
        const actualModel = toTrimmedString(body.actual_model);
        if (!actualModel) return badRequest("真实模型不能为空");
        patch.actual_model = actualModel;
      }
      if (body.priority !== undefined) patch.priority = toPriority(body.priority, 100);
      if (body.weight !== undefined) patch.weight = toPriority(body.weight, 100);
      if (body.is_enabled !== undefined) patch.is_enabled = toBoolean(body.is_enabled, true);

      if (Object.keys(patch).length === 0) return badRequest("没有可更新字段");

      const { error } = await supabase.from("rewrite_model_routes").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    }

    if (entity === "mode") {
      const patch: Record<string, unknown> = {};

      if (body.key !== undefined) {
        const key = toTrimmedString(body.key);
        if (!key) return badRequest("模式 key 不能为空");
        patch.key = key;
      }
      if (body.name !== undefined) {
        const name = toTrimmedString(body.name);
        if (!name) return badRequest("模式名称不能为空");
        patch.name = name;
      }
      if (body.description !== undefined) patch.description = toNullableString(body.description);
      if (body.mode_prompt !== undefined) {
        const modePrompt = toTrimmedString(body.mode_prompt);
        if (!modePrompt) return badRequest("模式提示词不能为空");
        patch.mode_prompt = modePrompt;
      }
      if (body.sort_order !== undefined) patch.sort_order = toPriority(body.sort_order, 100);
      if (body.is_enabled !== undefined) patch.is_enabled = toBoolean(body.is_enabled, true);
      if (body.is_default !== undefined) patch.is_default = toBoolean(body.is_default, false);

      if (Object.keys(patch).length === 0) return badRequest("没有可更新字段");

      const { error } = await supabase.from("rewrite_modes").update(patch).eq("id", id);
      if (error) throw new Error(error.message);

      if (patch.is_default === true) {
        await applySingleDefault(supabase, "mode", id);
      }
    }

    if (entity === "length_preset") {
      const patch: Record<string, unknown> = {};

      if (body.key !== undefined) {
        const key = toTrimmedString(body.key);
        if (!key) return badRequest("字数预设 key 不能为空");
        patch.key = key;
      }
      if (body.name !== undefined) {
        const name = toTrimmedString(body.name);
        if (!name) return badRequest("字数预设名称不能为空");
        patch.name = name;
      }
      if (body.description !== undefined) patch.description = toNullableString(body.description);
      if (body.length_prompt !== undefined) {
        const lengthPrompt = toTrimmedString(body.length_prompt);
        if (!lengthPrompt) return badRequest("字数预设提示词不能为空");
        patch.length_prompt = lengthPrompt;
      }
      if (body.sort_order !== undefined) patch.sort_order = toPriority(body.sort_order, 100);
      if (body.is_enabled !== undefined) patch.is_enabled = toBoolean(body.is_enabled, true);
      if (body.is_default !== undefined) patch.is_default = toBoolean(body.is_default, false);

      if (Object.keys(patch).length === 0) return badRequest("没有可更新字段");

      const { error } = await supabase.from("rewrite_length_presets").update(patch).eq("id", id);
      if (error) throw new Error(error.message);

      if (patch.is_default === true) {
        await applySingleDefault(supabase, "length_preset", id);
      }
    }

    if (entity === "workflow") {
      const patch: Record<string, unknown> = {};

      if (body.key !== undefined) {
        const key = toTrimmedString(body.key);
        if (!key) return badRequest("流程 key 不能为空");
        patch.key = key;
      }
      if (body.name !== undefined) {
        const name = toTrimmedString(body.name);
        if (!name) return badRequest("流程名称不能为空");
        patch.name = name;
      }
      if (body.description !== undefined) patch.description = toNullableString(body.description);
      if (body.sort_order !== undefined) patch.sort_order = toPriority(body.sort_order, 100);
      if (body.is_enabled !== undefined) patch.is_enabled = toBoolean(body.is_enabled, true);
      if (body.is_default !== undefined) patch.is_default = toBoolean(body.is_default, false);

      if (Object.keys(patch).length === 0) return badRequest("没有可更新字段");

      const { error } = await supabase.from("rewrite_workflows").update(patch).eq("id", id);
      if (error) throw new Error(error.message);

      if (patch.is_default === true) {
        await applySingleDefault(supabase, "workflow", id);
      }
    }

    if (entity === "workflow_step") {
      const patch: Record<string, unknown> = {};

      if (body.workflow_id !== undefined) {
        const workflowId = normalizeId(body.workflow_id);
        if (!workflowId) return badRequest("流程不能为空");
        patch.workflow_id = workflowId;
      }
      if (body.model_view_id !== undefined) patch.model_view_id = normalizeId(body.model_view_id);
      if (body.step_key !== undefined) {
        const stepKey = toTrimmedString(body.step_key);
        if (!stepKey) return badRequest("step_key 不能为空");
        patch.step_key = stepKey;
      }
      if (body.name !== undefined) {
        const name = toTrimmedString(body.name);
        if (!name) return badRequest("步骤名称不能为空");
        patch.name = name;
      }
      if (body.description !== undefined) patch.description = toNullableString(body.description);
      if (body.step_prompt !== undefined) {
        const stepPrompt = toTrimmedString(body.step_prompt);
        if (!stepPrompt) return badRequest("步骤提示词不能为空");
        patch.step_prompt = stepPrompt;
      }
      if (body.sort_order !== undefined) patch.sort_order = toPriority(body.sort_order, 100);
      if (body.is_enabled !== undefined) patch.is_enabled = toBoolean(body.is_enabled, true);

      if (Object.keys(patch).length === 0) return badRequest("没有可更新字段");

      const { error } = await supabase.from("rewrite_workflow_steps").update(patch).eq("id", id);
      if (error) throw new Error(error.message);
    }

    return NextResponse.json({
      ok: true,
      bundle: await loadBundle(supabase),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
