# AI 配置中心统一改造 — Codex 执行提示词

## 你的角色

你负责后端 + 数据库 + API 的全部实施。前端页面交给 Gemini，你只需要在最后列出"前端需要做什么"即可。

## 背景

DYData 项目现在有两套 AI 配置：
- **旧版**：`ai_channels` + `ai_feature_config`（扁平渠道表 + 功能绑定表）
- **新版**：`ai_providers` → `ai_provider_keys` → `ai_provider_key_models`（三层供应商/Key/模型）

文案助手 V2 已经在用新版三层，但其他 AI 功能（video_diagnose、growth_insight、content_tools 等 10+ 个 featureKey）仍走旧版。目标是统一成一套。

## 当前文件地图

| 文件 | 作用 |
|------|------|
| `src/lib/ai/client.ts` | 统一 AI 调用入口，callAi / callAiJson / callAiText，内部读 ai_channels + ai_feature_config 做选路 |
| `src/lib/ai/provider-routing.ts` | 新版三层选路：selectHealthyProviderKeyModel / getProviderKeyModelConfig |
| `src/lib/ai/load-feature-prompt.ts` | 从 ai_feature_config 读 system_prompt 给各功能用 |
| `src/lib/rewrite/shared.ts` | 文案改写 V1 配置加载 + 执行 + bootstrap |
| `src/lib/rewrite/generation.ts` | 文案改写 V2 生成逻辑，resolveGenerationProviderKeyModelId |
| `src/app/api/admin/ai-channels/route.ts` | 旧版渠道 CRUD API |
| `src/app/api/admin/ai-features/route.ts` | 旧版功能配置 CRUD API |
| `src/app/api/admin/ai-rewrite/route.ts` | 文案改写配置 CRUD API |
| `supabase/migrations/039_ai_channels.sql` | 旧表 schema |
| `supabase/migrations/040_ai_feature_config.sql` | 旧功能表 schema |
| `supabase/migrations/20260629000000_rewrite_skills_and_documents.sql` | 新三层表 schema |

## 任务一：默认模型逻辑修改

### 需求

文案助手员工端的默认模型不再用 `is_default` 字段，改为：**按 sort_order 排序，默认用第一个；如果第一个的路由不健康（熔断），自动跳到下一个。**

### 要改的地方

1. **`src/lib/rewrite/shared.ts`** 中的 `pickDefaultRow` 函数：
   - 现在逻辑：`rows.find(row => row.is_default) ?? rows[0]`
   - 改为：直接返回 `rows[0]`（因为 loadRewriteConfig 查询时已按 sort_order 排序）
   - 但加入健康检查：如果第一个 modelView 对应的路由全部不健康，跳到下一个

2. **`src/lib/rewrite/shared.ts`** 中的 `getRewriteBootstrapPayload`（约第 1298 行）：
   - `defaults.modelViewId` 现在调用 `pickDefaultRow(modelViews)`
   - 改为调用新函数 `pickFirstHealthyModelView(modelViews, modelRoutes)`
   - 该函数遍历 modelViews（已按 sort_order 排序），找到第一个有健康路由的 view

3. **V2 生成端 `src/lib/rewrite/generation.ts`** 中 `resolveGenerationProviderKeyModelId`：
   - 当没有 explicit 的 modelViewId 时（步骤 3-4），现有逻辑已经做了 fallback 到 selectHealthyProviderKeyModel
   - 需要额外加一步：在 skill 检查之后、最终 fallback 之前，按 rewrite_model_views 的 sort_order 逐个尝试 resolveProviderKeyModelByModelView，找到第一个健康的

4. **数据库**：`rewrite_model_views.is_default` 字段保留但不再使用（不删列，避免前端报错）

## 任务二：新增 ai_feature_bindings 表（替代 ai_feature_config 的路由部分）

### 新表 schema

```sql
CREATE TABLE ai_feature_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL UNIQUE,
  label text NOT NULL,
  provider_key_model_id uuid REFERENCES ai_provider_key_models(id) ON DELETE SET NULL,
  system_prompt text,
  output_token_limit int NOT NULL DEFAULT 3600 CHECK (output_token_limit BETWEEN 1200 AND 8000),
  context_message_limit int NOT NULL DEFAULT 30 CHECK (context_message_limit BETWEEN 1 AND 50),
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 自动 updated_at
CREATE TRIGGER set_ai_feature_bindings_updated_at
  BEFORE UPDATE ON ai_feature_bindings
  FOR EACH ROW EXECUTE FUNCTION set_rewrite_updated_at();

-- RLS：仅 owner 可管理
ALTER TABLE ai_feature_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_manage_feature_bindings" ON ai_feature_bindings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
  );
```

### 数据迁移

从 ai_feature_config 迁移现有数据：
```sql
INSERT INTO ai_feature_bindings (feature_key, label, system_prompt, output_token_limit, context_message_limit, is_enabled)
SELECT
  feature_key, label, system_prompt,
  COALESCE(output_token_limit, 3600),
  COALESCE(context_message_limit, 30),
  is_enabled
FROM ai_feature_config;
```

注意：旧表的 channel_id + model 不直接迁移，因为新表用 provider_key_model_id。如果某功能原来绑了特定 channel + model，需要在 ai_provider_key_models 中找到对应行的 id 填入。找不到的就留 NULL（表示自动选择）。

## 任务三：修改 callAi 统一走新路径

### 修改 `src/lib/ai/client.ts`

核心改动：`getFeatureConfig` 函数现在读 ai_feature_config，改为优先读 ai_feature_bindings。

```
优先级：
1. ai_feature_bindings 存在该 feature_key → 用 provider_key_model_id 走新版选路
2. ai_feature_bindings 不存在 → fallback 到 ai_feature_config（兼容期）
```

具体：
- 新增 `getFeatureBinding(featureKey)` 函数，查 ai_feature_bindings
- 如果 binding 存在且 provider_key_model_id 不为 null → 调用 `getProviderKeyModelConfig` 获取完整配置，构造 channel 对象插入 channels 列表最前面
- 如果 binding 存在但 provider_key_model_id 为 null → 调用 `selectHealthyProviderKeyModel` 自动选择
- 如果 binding 不存在 → 走原来的 ai_feature_config + ai_channels 逻辑（不改）

### 修改 `src/lib/ai/load-feature-prompt.ts`

改为优先从 ai_feature_bindings 读 system_prompt，fallback 到 ai_feature_config。

## 任务四：新增统一 API 路由

新建 `src/app/api/admin/ai-config/route.ts`：

### GET /api/admin/ai-config
返回完整配置包：
```json
{
  "providers": [...],       // ai_providers 全量
  "keys": [...],            // ai_provider_keys 全量（api_key 脱敏只显示后4位）
  "models": [...],          // ai_provider_key_models 全量
  "featureBindings": [...], // ai_feature_bindings 全量
  "rewriteModelViews": [...], // rewrite_model_views
  "rewriteModelRoutes": [...] // rewrite_model_routes（含 provider_key_model_id）
}
```

### POST /api/admin/ai-config
统一 CRUD，body 格式：
```json
{ "action": "create|update|delete", "entity": "provider|key|model|feature_binding", "data": {...} }
```

### 权限
所有操作限 owner role。

## 任务五：清理桥接

把 `rewrite_model_routes` 中所有 `provider_key_model_id IS NULL` 的行补齐：
- 根据 route 的 `actual_model` 字段，在 ai_provider_key_models 中找到匹配的行
- 如果找不到匹配，创建一条新的 ai_provider_key_models 行（挂在最匹配的 key 下）

## 不要做的事

- × 删除 ai_channels 表或 ai_feature_config 表（保留做 fallback）
- × 改任何前端 .tsx 文件
- × 改 provider 的 baseUrl 格式（加 /v1 会炸）
- × 改 provider 的 api_key 字段格式
- × 动 rewrite_model_views / rewrite_model_routes 的表结构（只改数据和后端读取逻辑）

## 产出要求

1. 一个完整的 SQL migration 文件（放 `supabase/migrations/` 下，命名用时间戳格式）
2. 修改后的 TypeScript 文件（client.ts / provider-routing.ts / shared.ts / generation.ts / load-feature-prompt.ts）
3. 新增的 API route 文件
4. 一份简短的"前端需求清单"，告诉 Gemini 后台页面要做什么（只说数据结构和交互需求，不说 UI 细节）

## 前端需求清单模板（给 Gemini 看的）

Codex 完成后端后，在产出末尾附上类似这样的内容：

---

### 前端需求（交给 Gemini）

后台「AI 配置」页面改造，替代现有的"渠道配置"和"文案改写"两个 Tab。

**数据源**：`GET /api/admin/ai-config` 返回完整配置包

**页面结构**：
1. 供应商管理 — 树形展示 provider → key → model，支持增删改
2. 功能绑定 — 表格展示所有 featureKey，每行可选绑定模型、编辑 prompt
3. 文案改写配置 — 保留现有的 model_views + routes + skills 管理能力

**交互要求**：
- api_key 脱敏显示（只显示后 4 位），编辑时才能看完整
- provider_key 健康状态实时展示（绿/红/灰）
- feature_binding 的模型选择下拉来自 models 列表
- 保留文案改写的 sort_order 拖拽排序能力

---

## 验收标准

- [ ] `npm run build` 零错误
- [ ] 文案助手员工端默认模型按 sort_order 第一个，熔断自动切换
- [ ] `callAi({ featureKey: "growth_insight" })` 能走新版 ai_feature_bindings 路径
- [ ] `GET /api/admin/ai-config` 返回完整数据包
- [ ] 旧 API（ai-channels / ai-features）仍然可用（兼容期不删）
- [ ] migration 文件可重复执行不报错
