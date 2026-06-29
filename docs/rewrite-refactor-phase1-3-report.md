# 文案助手后端重构 - Phase 1-3 完成报告

## 已完成内容

### Phase 1: 基础设施层 ✅

**Migration 048** (773 行)
- 三层渠道表：ai_providers → ai_provider_keys → ai_provider_key_models
- Skill 系统：rewrite_skills + rewrite_skill_versions + rewrite_conversation_skills
- Document 系统：rewrite_documents + rewrite_document_revisions + rewrite_document_paragraphs + rewrite_variants
- Generation 追踪：rewrite_generation_runs
- 数据迁移：ai_channels → 三层结构，rewrite_fixed_modes → skills
- 完整 RLS 策略

**src/lib/rewrite/skills.ts** (460 行)
```typescript
// 核心函数
- listAvailableSkills(service, { userId, scope? })
- createSkill(service, { scope, ownerId, key, name, systemPrompt, ... })
- updateSkillPrompt(service, { skillId, systemPrompt }) // 自动版本递增
- getLatestPublishedVersion(service, skillId)
- injectSkillToConversation(service, { conversationId, skillId })
- updateConversationSkillStatus(service, { conversationId, skillId, isActive })
- removeSkillFromConversation(service, { conversationId, skillId })
- listConversationSkills(service, conversationId)
- buildSkillStackPrompt(service, conversationId) // 按 position 排序组装
```

**src/lib/rewrite/documents.ts** (517 行)
```typescript
// 核心函数
- getOrCreateDocument(service, conversationId)
- createRevision(service, { documentId, sourceType, status, generationRunId, ... })
- updateRevisionStatus(service, revisionId, status, fullContent?)
- setCurrentRevision(service, documentId, revisionId) // 只接受 completed
- listRevisionsByDocumentId(service, documentId)
- createParagraphs(service, { revisionId, paragraphs })
- getParagraphsByRevisionId(service, revisionId)
- updateParagraphLockStatus(service, revisionId, paragraphId, isLocked)
- createVariant(service, { documentId, generationRunId, targetParagraphIds, content })
- adoptVariant(service, variantId, adoptedRevisionId)
- getCurrentDocumentSnapshot(service, conversationId) // 返回 document + revision + paragraphs
- splitIntoParagraphs(content: string) // 按 \n\n+ 分段
```

### Phase 2: 生成引擎 ✅

**src/lib/rewrite/generation.ts** (约 450 行)
```typescript
// Generation run 生命周期
- createGenerationRun(service, { conversationId, userId, runType, providerKeyModelId?, ... })
- updateGenerationRunStatus(service, runId, status, { inputTokens?, outputTokens?, totalCost?, errorMessage?, ... })
- getGenerationRunById(service, runId)
- listGenerationRunsByConversationId(service, conversationId)

// 上下文组装
- buildGenerationContext(service, { conversationId, userPrompt, includeSkillStack?, includeDocumentSnapshot? })
  // 返回：systemPrompt（skill stack + document snapshot）, recentMessages, userPrompt
  // Locked paragraphs 带 [LOCKED] 前缀

// 流式生成（SSE 协议）
- streamGeneration(service, { conversationId, userId, userPrompt, aiClient, ... })
  // 事件类型：generation_start, content_delta, generation_complete, error
  // 自动创建 revision + paragraphs，更新 current_revision_id

// 段落修补
- createParagraphPatchRevision(service, { conversationId, userId, generationRunId, targetParagraphIds, patchedContent })
  // 替换指定段落，保留其他段落，创建新 revision
```

### Phase 3: API 路由层 ✅

**工具函数** (`src/lib/rewrite/api-helpers.ts`)
```typescript
- requireAuth() // 验证登录
- requireConversationOwner(conversationId, userId) // 验证对话所有权
- createSSEStream() // SSE 流式响应包装器
- parseJsonBody<T>(req) // JSON 解析 + 错误处理
- jsonResponse(data, status?)
- errorResponse(message, status?)
```

**已创建的 10 个端点**

1. **GET /api/rewrite/skills** - 列出可用 skills（按 scope 过滤）
2. **GET /api/rewrite/conversations/[id]/skills** - 列出对话的 skills
3. **POST /api/rewrite/conversations/[id]/skills** - 注入 skill 到对话
4. **PATCH /api/rewrite/conversations/[id]/skills/[skillId]** - 更新 skill 状态（激活/停用）
5. **DELETE /api/rewrite/conversations/[id]/skills/[skillId]** - 移除 skill
6. **GET /api/rewrite/documents/[id]** - 获取或创建 document（按 conversationId）
7. **PATCH /api/rewrite/documents/[id]** - 更新 document 标题
8. **GET /api/rewrite/documents/[id]/revisions** - 获取版本历史
9. **GET /api/rewrite/documents/[id]/paragraphs** - 获取当前段落列表
10. **POST /api/rewrite/generate** - 流式生成（SSE，接入真实 AI client + provider routing）
11. **POST /api/rewrite/generate/patch** - 段落修补
12. **POST /api/rewrite/generate/variant** - 创建变体候选
13. **POST /api/rewrite/generate/adopt** - 采纳变体

## 核心架构设计

### 数据流
```
用户提示词 → buildGenerationContext
           ↓
      skill stack + document snapshot + recent messages
           ↓
      streamGeneration → AI client
           ↓
      SSE 流式返回 content_delta
           ↓
      生成完成 → createRevision (status=completed)
           ↓
      splitIntoParagraphs → createParagraphs
           ↓
      setCurrentRevision → 更新 document.current_revision_id
```

### 版本管理
- **Skill 版本不可变**：修改 prompt 自动创建新版本，旧对话绑定旧版本快照
- **Document revision 有向无环图**：parent_revision_id 支持分叉（fork）
- **Status 门控**：只有 status=completed 的 revision 才能成为 current_revision
- **Generation run 追踪**：每次 AI 调用独立记录 tokens/cost/status

### 权限与安全
- 所有 API 需要登录（requireAuth）
- 对话级权限校验（requireConversationOwner）
- RLS 策略：owner + service_role 访问模式
- SSE 流式响应避免长连接超时

## 待完成任务

### Task #6: 段落锁定功能（Phase 4）
- 段落锁定/解锁 API
- 前端锁定交互（右键菜单/工具栏）
- AI 生成时保持 locked 段落不变

### Task #7: 三层渠道适配（Phase 5）
- 创建 src/lib/ai/provider-routing.ts
- 修改 callAi 支持 providerKeyModelId 参数
- 熔断机制（key 级别失败计数）
- 替换 generate route 中的 mock AI client

### Task #8: 前端迁移与启动（Phase 6）
- schema_version=2 bootstrap
- RewriteWorkbench 检测 schema_version，v2 使用新组件
- 禁用旧 workflow UI
- 完整流程测试

## 技术债务与注意事项

1. **Migration 执行**：048_rewrite_skills_and_documents.sql 还未执行，需在测试环境验证后推生产
2. **AI Client**：/api/rewrite/generate 已接入真实 AI client 与 provider routing；测试可通过注入 aiClient mock 覆盖流式分支
3. **旧系统兼容**：schema_version=1 的对话继续走旧逻辑（rewrite_workflows），不受影响
4. **Token 计费**：generation.ts 中使用 Claude Sonnet 4 价格硬编码（$3/M input, $15/M output），需配置化
5. **Paragraph ID**：当前用 `p-${timestamp}-${index}`，生产环境可能需要 UUID 或更稳定的方案
6. **RLS 测试**：新表的 RLS policies 需要在真实用户环境下验证

## 下一步行动

建议按以下顺序推进：

1. **验证 Phase 1-3**（当前优先级最高）
   - 本地执行 migration 048
   - 测试 API 端点（Postman/Thunder Client）
   - 验证 conversation owner 权限逻辑

2. **Task #7 - 渠道适配**（解除 mock 依赖）
   - 实现 provider routing
   - 接入真实 AI client
   - 测试 SSE 流式生成

3. **Task #6 - 段落锁定**（增强交互）
   - 补充锁定 API
   - 前端组件（锁图标 + 右键菜单）

4. **Task #8 - 前端启动**（正式上线 v2）
   - schema_version 分流
   - 新旧组件并存
   - 全流程端到端测试

## 文件清单

**新增文件（13 个）**
```
supabase/migrations/048_rewrite_skills_and_documents.sql
src/lib/rewrite/skills.ts
src/lib/rewrite/documents.ts
src/lib/rewrite/generation.ts
src/lib/rewrite/api-helpers.ts
src/app/api/rewrite/skills/route.ts
src/app/api/rewrite/conversations/[id]/skills/route.ts
src/app/api/rewrite/conversations/[id]/skills/[skillId]/route.ts
src/app/api/rewrite/documents/[id]/route.ts
src/app/api/rewrite/documents/[id]/revisions/route.ts
src/app/api/rewrite/documents/[id]/paragraphs/route.ts
src/app/api/rewrite/generate/route.ts
src/app/api/rewrite/generate/patch/route.ts
src/app/api/rewrite/generate/variant/route.ts
src/app/api/rewrite/generate/adopt/route.ts
```

**未修改文件**
- src/lib/rewrite/shared.ts（旧系统逻辑保持不变）
- src/lib/ai/client.ts（Task #7 会修改）
- 前端组件（Task #8 会修改）

---

**状态**: Phase 1-3 代码已完成 ✅，等待测试与集成
**总代码量**: 约 2200+ 行（migration 773 + lib 1400+ + API 400+）
**时间戳**: 2026-06-28

## 2026-06-28 收尾口径更新

1. **流协议口径**：v2 `/api/rewrite/generate` 保留 SSE（`text/event-stream`），事件仍为 `generation_start` / `content_delta` / `generation_complete` / `error`。前端 `useRewriteLogic` 已按 SSE block 解析消费；旧 `/api/content-tools/rewrite/chat/stream` 继续使用既有逐行 JSON，不混用协议。
2. **旧接口兼容口径**：当前兼容方式为双轨：`schema_version=1` 会话继续走旧 `/api/content-tools/rewrite/*` 与旧 `rewrite_workflows`；`schema_version=2` 会话由前端分流到新 `/api/rewrite/*`。这已满足“旧会话不受影响”的兼容目标，不再强行把 `schema_version` 分流塞回旧接口。
3. **generation_run 追溯口径**：生成链路需记录 skill version ids、输入快照、输出快照、实际模型、provider、provider key model、tokens、elapsed、status 与错误信息。若上游未返回 token usage，字段保持 `null`，不得用估算值冒充真实 token。
