# DYData 文案助手后端重构 - Codex 施工提示词

## 背景

DYData 文案助手后端重构项目，Phase 1-3（基础设施 + 生成引擎 + API 路由）已完成，现需完成 Phase 4-6 的剩余任务。

**已完成内容总结**：
- Migration 048：三层渠道表（ai_providers/keys/models）、skill 系统、document 系统、generation_runs
- src/lib/rewrite/skills.ts：skill CRUD + 版本管理 + conversation 注入
- src/lib/rewrite/documents.ts：document/revision/paragraph CRUD + variant 管理
- src/lib/rewrite/generation.ts：生成引擎 + SSE 流式协议（当前使用 mock AI client）
- 13 个 API 路由：skills/conversation-skills/documents/generate 端点

**详细进度报告**：`/Users/mac/Projects/dydata/docs/rewrite-refactor-phase1-3-report.md`

## 待完成任务（全部交给你）

### Task #6: 段落锁定功能

**目标**：实现段落级锁定，locked 段落在 AI 生成时保持不变

**需要完成**：

1. **API 端点**
   - `PATCH /api/rewrite/paragraphs/[id]/lock`
     - Body: `{ isLocked: boolean }`
     - 调用 `updateParagraphLockStatus(service, revisionId, paragraphId, isLocked)`
     - 权限校验：requireConversationOwner（通过 paragraph → revision → document → conversation 查询）

2. **验证现有逻辑**
   - `generation.ts` 的 `buildGenerationContext` 已实现 `[LOCKED]` 标记逻辑（第 206 行）
   - 确认 AI 提示词中有说明 locked 段落不可修改
   - 如果缺失，在 systemPrompt 中补充："标记为 [LOCKED] 的段落为用户锁定内容，生成时必须保持不变"

3. **段落修补逻辑检查**
   - `createParagraphPatchRevision` 应过滤掉 locked 段落（当前实现第 406 行过滤了 targetParagraphIds，需确认不会修改 locked）

### Task #7: 三层渠道系统适配

**目标**：从 ai_channels 迁移到 ai_providers → ai_provider_keys → ai_provider_key_models 三层架构，接入真实 AI client

**需要完成**：

1. **创建 src/lib/ai/provider-routing.ts**
```typescript
// 核心函数
export async function getProviderKeyModelConfig(
  service: MinimalClient,
  providerKeyModelId: string
): Promise<{
  baseUrl: string;
  apiKey: string;
  modelId: string;
  providerName: string;
} | null>

// 从三层表查询：
// 1. ai_provider_key_models WHERE id = providerKeyModelId
// 2. JOIN ai_provider_keys (get api_key, provider_id, consecutive_failures, unhealthy_until)
// 3. JOIN ai_providers (get base_url, name)
// 4. 熔断检查：consecutive_failures >= 3 && unhealthy_until > now() 返回 null
// 5. 返回 { baseUrl, apiKey, modelId, providerName }

export async function selectHealthyProviderKeyModel(
  service: MinimalClient,
  modelIdPreference?: string // 例如 "claude-sonnet-4-6"
): Promise<{ providerKeyModelId: string; config: {...} } | null>

// 查询逻辑：
// 1. 从 ai_provider_key_models 查询支持 modelIdPreference 的所有记录
// 2. JOIN ai_provider_keys，过滤掉熔断状态（consecutive_failures < 3 或 unhealthy_until < now()）
// 3. 按 priority DESC 排序
// 4. 返回第一个可用的 providerKeyModelId + config

export async function bumpProviderKeyFailure(
  service: MinimalClient,
  providerKeyId: string
): Promise<void>

// RPC 调用（需要在 migration 048 补充）：
CREATE OR REPLACE FUNCTION bump_provider_key_failure(key_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE ai_provider_keys
  SET
    consecutive_failures = consecutive_failures + 1,
    unhealthy_until = CASE
      WHEN consecutive_failures + 1 >= 3
      THEN now() + interval '5 minutes'
      ELSE unhealthy_until
    END,
    last_error_at = now()
  WHERE id = key_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

2. **修改 src/lib/ai/client.ts**
   - 在 `callAi` 函数中新增参数：`providerKeyModelId?: string`
   - 优先级逻辑：
     ```typescript
     if (providerKeyModelId) {
       const config = await getProviderKeyModelConfig(service, providerKeyModelId);
       if (config) {
         // 使用新渠道调用 AI
         try {
           const result = await actualAiCall(config.baseUrl, config.apiKey, config.modelId, ...);
           return result;
         } catch (error) {
           // 失败后 bump 熔断计数
           await bumpProviderKeyFailure(service, providerKeyId);
           // fallback 到旧 ai_channels
         }
       }
     }
     // 旧逻辑（ai_channels failover）保持不变
     ```

3. **修改 generation.ts 中的 mock AI client**
   - `streamGeneration` 函数第 337 行的 `mockAiClient` 替换为真实调用
   - 从 `callAi` 获取流式响应（参考 `src/lib/rewrite/shared.ts` 的 `streamRewriteChat`）
   - 使用 `providerKeyModelId` 参数（如果传入）

4. **补充 migration 048**
   - 在 Section 7（RPC Functions）后添加 `bump_provider_key_failure` 函数
   - 添加 index：`CREATE INDEX idx_provider_keys_health ON ai_provider_keys(consecutive_failures, unhealthy_until);`

### Task #8: 前端迁移与启动

**目标**：实现 schema_version 分流，v2 对话使用新架构，v1 对话保持旧逻辑

**需要完成**：

1. **Bootstrap 函数**
   - 创建 `src/lib/rewrite/bootstrap.ts`
   ```typescript
   export async function createV2Conversation(
     service: MinimalClient,
     userId: string,
     title?: string
   ): Promise<{ conversationId: string; documentId: string }>
   
   // 逻辑：
   // 1. 插入 rewrite_conversations (user_id, title, schema_version=2)
   // 2. 调用 getOrCreateDocument(service, conversationId)
   // 3. 返回 conversationId + documentId
   ```

2. **前端检测与路由**
   - 修改 `src/components/content-tools/rewrite/RewriteWorkbench.tsx`
   - 在加载 conversation 后检测 `schema_version`
   ```typescript
   const schemaVersion = conversation.schema_version ?? 1;
   
   if (schemaVersion === 2) {
     // 使用新组件
     return (
       <>
         <InstructionFeed /> {/* 已存在 */}
         <PolishedDocumentCanvas /> {/* 已存在 */}
       </>
     );
   } else {
     // 旧逻辑（现有代码）
     return <OldWorkflowUI />;
   }
   ```

3. **禁用旧 UI 元素**
   - v2 对话不显示：mode selector, length preset selector, workflow selector
   - 在 RewriteWorkbench 中根据 `schemaVersion` 条件渲染

4. **InstructionFeed 与 PolishedDocumentCanvas 集成**
   - InstructionFeed（对话输入）：
     - 发送消息时调用 `POST /api/rewrite/generate`（SSE）
     - 监听 `content_delta` 事件，实时更新 PolishedDocumentCanvas
   - PolishedDocumentCanvas（文档画布）：
     - 加载时调用 `GET /api/rewrite/documents/[conversationId]/paragraphs`
     - 显示 paragraph 列表，支持锁定/解锁交互
     - 右键菜单：Lock/Unlock Paragraph → `PATCH /api/rewrite/paragraphs/[id]/lock`

5. **创建测试入口**
   - 在 RewriteWorkbench 或 admin 页面添加"新建 v2 对话"按钮
   - 调用 bootstrap.ts 的 `createV2Conversation`

### Task #9: 完整测试与验收

**需要完成**：

1. **单元测试**（可选，时间紧可跳过）
   - skills.ts 核心函数
   - documents.ts 核心函数
   - generation.ts 核心函数

2. **集成测试（必做）**
   - 执行 migration 048（本地 Supabase）
   - 验证数据迁移：
     - `ai_channels` 数据是否正确迁移到三层表
     - `rewrite_fixed_modes` 是否迁移到 `rewrite_skills`
   - 测试完整流程：
     a. 创建 v2 conversation
     b. 注入 skill（`POST /api/rewrite/conversations/[id]/skills`）
     c. 发送生成请求（`POST /api/rewrite/generate`，SSE 流式）
     d. 验证 revision + paragraphs 创建成功
     e. 锁定一个段落（`PATCH /api/rewrite/paragraphs/[id]/lock`）
     f. 再次生成，验证 locked 段落未被修改
     g. 创建 variant（`POST /api/rewrite/generate/variant`）
     h. 采纳 variant（`POST /api/rewrite/generate/adopt`）

3. **错误场景测试**
   - 未登录访问 API → 401
   - 非 owner 访问对话 → 403
   - AI 调用失败 → 熔断机制触发，fallback 到其他 key
   - Revision status=pending 尝试 setCurrentRevision → 拒绝

4. **性能测试**
   - 大文档（50+ paragraphs）的加载速度
   - SSE 流式生成的延迟
   - 版本历史（50+ revisions）的查询速度

5. **浏览器测试**
   - 在真实浏览器中打开文案助手
   - 创建 v2 对话，完整走一遍生成流程
   - 验证 UI 交互（锁定段落、右键菜单等）

## 技术约束与规范

### 项目规则（必须遵守）
- Git 仓库：`git@github.com:1305085564-hue/dydata.git`
- Git user.email：`1305085564@qq.com`
- 不修改旧 migration，只能新增
- 服务端用 `SUPABASE_SERVICE_ROLE_KEY`，不用 anon key
- 代码风格：中文组件名内部用英文 PascalCase，导出时用中文别名
- 提交前必读：`/Users/mac/Projects/dydata/AGENTS.md`

### Migration 规范
- 文件命名：`049_xxx.sql`（048 已占用）
- Section 结构：Tables → Indexes → RLS → Grants → Data Migration → RPC Functions
- RLS 模式：owner (user_id = auth.uid()) + service_role

### API 规范
- 所有端点需 `requireAuth()`
- 对话相关端点需 `requireConversationOwner()`
- 错误响应格式：`{ error: string }`
- 成功响应格式：`{ data: T }` 或直接返回对象

### 前端规范
- Next.js App Router
- Supabase client：anon client（权限校验）+ service client（实际操作）
- SSE 消费：使用 `EventSource` 或 `fetch` 的 `ReadableStream`

## 交付物清单

**必须交付**：
1. `src/lib/ai/provider-routing.ts`（新建）
2. `src/lib/ai/client.ts`（修改，支持 providerKeyModelId）
3. `src/lib/rewrite/generation.ts`（修改，替换 mock AI client）
4. `src/lib/rewrite/bootstrap.ts`（新建）
5. `src/app/api/rewrite/paragraphs/[id]/lock/route.ts`（新建）
6. `src/components/content-tools/rewrite/RewriteWorkbench.tsx`（修改，schema_version 分流）
7. `supabase/migrations/049_provider_key_rpc.sql`（新建，补充 bump_provider_key_failure RPC）
8. 集成测试脚本或测试报告（Markdown 格式）

**可选交付**：
- 单元测试文件
- 前端组件优化（锁定图标、右键菜单样式等）

## 验收标准

**硬性要求**：
1. Migration 049 在本地 Supabase 执行成功，无语法错误
2. 所有 API 端点能正常响应（200/201）
3. SSE 流式生成能实时返回 content_delta 事件
4. 段落锁定后，再次生成时该段落保持不变
5. 三层渠道系统能正确路由到 base_url + api_key + model
6. 熔断机制生效（key 失败 3 次后跳过 5 分钟）
7. v1 对话保持旧逻辑不受影响
8. v2 对话使用新组件（InstructionFeed + PolishedDocumentCanvas）

**软性要求**：
- 代码风格统一（遵循项目现有风格）
- 错误处理完善（try-catch + 有意义的错误信息）
- 日志记录（关键步骤 console.log 或写入日志表）

## 注意事项

1. **AI client 集成**：参考 `src/lib/rewrite/shared.ts` 的 `streamRewriteChat` 实现，使用项目现有的 AI 调用封装
2. **RLS 测试**：新 API 端点的 RLS 策略需要在真实用户登录状态下测试，确保非 owner 无法访问
3. **旧数据迁移**：migration 048 的数据迁移逻辑已实现，但需验证迁移后数据完整性（特别是 ai_channels → 三层表）
4. **Token 计费**：generation.ts 第 318 行硬编码了 Claude Sonnet 4 价格，如果实际使用其他模型需调整
5. **Paragraph ID 生成**：当前用 `p-${timestamp}-${index}`，生产环境可能需要更稳定的 ID 生成策略（UUID）
6. **前端 SSE 处理**：需要处理连接中断、重连、超时等边缘情况
7. **浏览器兼容性**：确保 InstructionFeed 和 PolishedDocumentCanvas 在主流浏览器（Chrome/Edge/Safari）正常显示

## 推荐施工顺序

1. **Phase 5（Task #7）**：三层渠道适配（解除 mock 依赖，系统可用）
2. **Phase 6（Task #8）**：前端启动（用户可见，完整流程）
3. **Phase 4（Task #6）**：段落锁定（交互增强）
4. **Phase 7（Task #9）**：完整测试（验收）

原因：先让系统跑起来（接入真实 AI），再暴露给用户（前端组件），最后完善细节（段落锁定）和全面测试。

## 参考文件

**必读**：
- `/Users/mac/Projects/dydata/docs/rewrite-refactor-phase1-3-report.md`（已完成内容总结）
- `/Users/mac/Projects/dydata/AGENTS.md`（项目规则）
- `/Users/mac/Projects/dydata/supabase/migrations/048_rewrite_skills_and_documents.sql`（数据库 schema）

**参考**：
- `/Users/mac/Projects/dydata/src/lib/rewrite/shared.ts`（旧系统实现，可参考 AI client 调用）
- `/Users/mac/Projects/dydata/src/lib/ai/client.ts`（现有 AI client 封装）
- `/Users/mac/Projects/dydata/src/components/content-tools/rewrite/RewriteWorkbench.tsx`（前端入口）
- `/Users/mac/Projects/dydata/src/components/content-tools/rewrite/InstructionFeed.tsx`（对话输入组件）
- `/Users/mac/Projects/dydata/src/components/content-tools/rewrite/PolishedDocumentCanvas.tsx`（文档画布组件）

## 如何开始

1. 读取并理解 Phase 1-3 完成报告
2. 读取 AGENTS.md 了解项目规则
3. 读取 migration 048 了解数据库 schema
4. 按推荐顺序开始施工（Task #7 → #8 → #6 → #9）
5. 每完成一个 Task，自测后再进入下一个
6. 所有任务完成后，执行完整集成测试
7. 提交代码前检查：git user.email、migration 不修改旧文件、RLS 策略完整

---

**预计工作量**：8-12 小时（包含测试）
**优先级**：高（文案助手核心功能重构）
**截止日期**：无硬性要求，但建议 2 天内完成

开始吧！有任何疑问可以问我。
