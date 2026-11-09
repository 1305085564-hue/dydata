# 移交给 Codex：修复 DeepSeek 模型在模型视角不显示的问题

## 背景

阿禅新接入了 DeepSeek 渠道和模型，遇到两个问题：
1. ✅ **已解决**：ds 渠道在渠道视角显示了所有模型（已清理，现在只显示 DeepSeek 模型）
2. ❌ **待解决**：DeepSeek 模型在模型视角不显示

## 当前状态

### 数据层面（已确认）
- ds 渠道（ID: `a26c53b9-6fd3-4991-ada6-1de4c81d437d`）挂载了 2 个 DeepSeek 模型：
  - `deepseek-flash`: `is_enabled=true`, `global_is_enabled=null`
  - `deepseek-v4-pro`: `is_enabled=false`, `global_is_enabled=null`
- 诊断脚本 [scripts/diagnose-deepseek.ts](scripts/diagnose-deepseek.ts) 确认：`deepseek-flash` 有渠道启用，按修复逻辑应该显示

### 代码层面（已修改但可能未生效）
- 提交 `0d4a4867` 修改了 [src/lib/ai-config/availability.ts:187-202](src/lib/ai-config/availability.ts:187-202)
- 修改内容：当 `global_is_enabled=null` 时，回退到"有任何渠道启用就显示"的逻辑
- **问题**：修改后推送到生产，但模型视角仍不显示 DeepSeek Flash

## 你的任务

### 主任务：确保 DeepSeek Flash 在模型视角显示

**验收标准**：
1. 打开 https://dydata.vercel.app/admin/ai-config
2. 切换到「模型视角」
3. 能看到 DeepSeek Flash 模型卡片
4. 显示渠道数（如 "1/1 渠道健康"）

### 调查方向

#### 方向 1：检查 Vercel 部署状态
```bash
# 检查线上运行的代码版本
curl https://dydata.vercel.app/api/health | jq -r '.release'
# 应该是 0d4a4867 或更新的提交
```

如果线上不是最新代码，等待部署完成或手动触发部署。

#### 方向 2：检查前端渲染逻辑
模型视角的渲染逻辑在：
- [src/app/(app)/admin/ai-config/components/compute-pool-panel.tsx:144-175](src/app/(app)/admin/ai-config/components/compute-pool-panel.tsx:144-175)
- 关键代码：`const activeGroups = useMemo(() => modelFamilyGroups.filter((g) => g.isShelved), [modelFamilyGroups]);`

检查：
1. `modelFamilyGroups` 是否包含 DeepSeek Flash？
2. `isShelved` 是否正确判断为 `true`？
3. `activeGroups` 是否包含 DeepSeek Flash？

#### 方向 3：验证 availability.ts 的聚合逻辑
```typescript
// src/lib/ai-config/availability.ts:187-202
// 当前逻辑：explicitState === null 时回退到"有渠道启用就显示"

// 验证点：
// 1. explicitGlobalStateByModelId.get('deepseek-flash') 返回什么？
// 2. globalStateByModelId.get('deepseek-flash') 最终是 true 还是 false？
// 3. shelvedModelIds.has('deepseek-flash') 是否为 true？
```

可以添加 console.log 或创建测试脚本验证。

#### 方向 4：检查是否有其他过滤逻辑
搜索代码中是否有其他地方过滤了 DeepSeek 模型：
```bash
grep -r "deepseek" src/app/(app)/admin/ai-config/ --include="*.ts" --include="*.tsx"
grep -r "filter.*model" src/app/(app)/admin/ai-config/components/compute-pool-panel.tsx
```

### 修复方案参考

如果确认是聚合逻辑问题，可以考虑：

**方案 A：强制显示有任何渠道启用的模型**
```typescript
// src/lib/ai-config/availability.ts
const globalStateByModelId = new Map<string, boolean | null>();
for (const model of models) {
  const modelId = model.model_id;
  
  // 只要有任何渠道启用了这个模型，就标记为全局启用
  const hasEnabledChannel = models.some(
    m => m.model_id === modelId && m.is_enabled
  );
  
  if (hasEnabledChannel) {
    globalStateByModelId.set(modelId, true);
  } else if (explicitGlobalStateByModelId.has(modelId)) {
    globalStateByModelId.set(modelId, explicitGlobalStateByModelId.get(modelId) ?? null);
  } else {
    globalStateByModelId.set(modelId, null);
  }
}
```

**方案 B：直接在前端渲染时放宽过滤条件**
```typescript
// src/app/(app)/admin/ai-config/components/compute-pool-panel.tsx
const globalEnabled = m.global_is_enabled === undefined 
  ? m.is_enabled  // 如果没有 global_is_enabled，用渠道级 is_enabled
  : m.global_is_enabled === true;
```

### 诊断脚本

已创建的诊断工具：
- [scripts/diagnose-deepseek.ts](scripts/diagnose-deepseek.ts) — 查看数据库状态
- [scripts/cleanup-ds-direct.ts](scripts/cleanup-ds-direct.ts) — 数据清理（已执行）

你可以修改或创建新的诊断脚本。

## 验收流程

1. 修复代码
2. 本地 `npm run build` 验证无错误
3. 提交并推送到 main
4. 等待 Vercel 部署完成（1-2 分钟）
5. 打开 https://dydata.vercel.app/admin/ai-config
6. 硬刷新（Cmd+Shift+R）
7. 切换到模型视角，确认看到 DeepSeek Flash
8. 截图验证并回复阿禅

## 相关文件

- [src/lib/ai-config/availability.ts](src/lib/ai-config/availability.ts) — 聚合逻辑（已修改但可能不够）
- [src/app/(app)/admin/ai-config/components/compute-pool-panel.tsx](src/app/(app)/admin/ai-config/components/compute-pool-panel.tsx) — 模型视角渲染
- [日志/2026-10-10.md](日志/2026-10-10.md) — 今天的完整操作日志

## 注意事项

1. **不要改动数据库** — 数据层面已确认正确，问题在代码逻辑或部署
2. **验证 Vercel 部署** — 确保线上运行的是最新代码
3. **硬刷新浏览器** — 修复后让阿禅硬刷新（Cmd+Shift+R）清除缓存
4. **记录日志** — 修复完成后更新 [日志/2026-10-10.md](日志/2026-10-10.md)

---

**优先级：高** — 阿禅需要 DeepSeek 模型立即可用  
**预计时间：30-60 分钟**  
**交付标准：模型视角显示 DeepSeek Flash + 截图验证**

---

## 补充（10-10 深夜，[QW]）：本任务的一次性工具已回收

上文提到的 `scripts/diagnose-deepseek.ts`、`scripts/cleanup-ds-direct.ts`、`scripts/cleanup-deepseek-channel.sql`、`scripts/cleanup-ds-channel.js` 与接口 `/api/admin/ai-config/cleanup-channel` 已随本任务收口删除（一次性临时件，且该接口只判登录不判管理员、按渠道名猜品牌会误删聚合渠道的在用模型，详见技术债台账同一条）。诊断与清理结论以本文件与日志为准，不要再去找这些脚本。
