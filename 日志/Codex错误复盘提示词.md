# Codex 对话错误全量审计 · 执行提示词

## 你的任务

逐个读取 Codex 的全部约 590 份会话日志（2026-03 至 2026-07），提取其中所有犯过的错误、失败、用户纠正、回滚事件，全量列举，不遗漏。

---

## 数据源

### 主要日志（JSONL 格式，每行一个 JSON 对对象）

| 路径 | 说明 | 数量 |
|------|------|------|
| `~/.codex/sessions/**/*.jsonl` | 最近正式会话 | 30 个 |
| `~/.codex/archived_sessions/*.jsonl` | 最近归档会话 | 4 个 |
| `~/.cc-switch/backups/codex-official-history-unify-restore-v1/20260719_081802/jsonl/**/*.jsonl` | **完整历史备份（最主要数据源）** | 351 个 |
| `~/.cc-switch/backups/codex-official-history-unify-v1/20260718_182505/jsonl/**/*.jsonl` | 历史备份（另一份快照） | 351 个 |

> **注意**：多个备份快照可能包含重复文件。以 `basename`（文件名）去重后约 385 个唯一 JSONL 文件。优先读 `20260719_081802` 快照（最新最全），再用 `~/.codex/sessions/` 补充 7 月 19 日之后的新会话。

### 辅助元数据

| 路径 | 说明 |
|------|------|
| `~/.cc-switch/backups/.../20260719_081802/state/state_5.sqlite` → `threads` 表 | **完整历史元数据（590 个线程）** |
| `~/.codex/state_5.sqlite` → `threads` 表 | 最近会话元数据（34 个） |
| `~/.codex/session_index.jsonl` | 最近会话索引 |

### 会话时间分布

| 月份 | 会话数 |
|------|--------|
| 2026-03 | 1 |
| 2026-04 | 176 |
| 2026-05 | 162 |
| 2026-06 | 100 |
| 2026-07 | 151 |
| **合计** | **590** |

---

## JSONL 格式说明

每行是一个 JSON 对象，结构：

```json
{
  "timestamp": "2026-07-29T11:09:06Z",
  "type": "event_msg",
  "payload": {
    "type": "user_message",
    "message": "首页数据上传页面选择发布时间以后无法上传"
  }
}
```

### 关键 type/payload.type 组合

| type | payload.type | 含义 |
|------|-------------|------|
| `session_meta` | — | 会话元数据（session_id、cwd、model、source） |
| `event_msg` | `user_message` | 用户输入（payload.message） |
| `event_msg` | `agent_message` | AI 回复（payload.message） |
| `event_msg` | `agent_reasoning` | AI 推理过程 |
| `event_msg` | `thread_rolled_back` | **回滚事件**（payload.num_turns = 回滚了几轮） |
| `event_msg` | `turn_aborted` | **中断事件**（payload.reason = "interrupted"） |
| `event_msg` | `patch_apply_end` | 代码补丁应用结果 |
| `event_msg` | `task_complete` | 任务完成 |
| `event_msg` | `task_started` | 任务开始 |
| `response_item` | `message/assistant` | 助手消息（payload.content[].text） |
| `response_item` | `message/user` | 用户消息 |
| `response_item` | `custom_tool_call` | 工具调用（payload.name = 工具名） |
| `response_item` | `custom_tool_call_output` | 工具输出 |
| `response_item` | `function_call` | 函数调用 |
| `response_item` | `function_call_output` | 函数输出 |
| `response_item` | `reasoning` | 推理块 |

---

## 执行步骤

### 第一步：读取会话列表

```bash
# 从完整历史备份获取全部会话元数据（590 个）
sqlite3 ~/.cc-switch/backups/codex-official-history-unify-restore-v1/20260719_081802/state/state_5.sqlite \
  "SELECT id, title, model, datetime(created_at_ms/1000,'unixepoch') as created, archived \
   FROM threads ORDER BY created_at_ms DESC"

# 补充最近会话（7月19日之后的）
sqlite3 ~/.codex/state_5.sqlite \
  "SELECT id, title, model, datetime(created_at_ms/1000,'unixepoch') as created, archived \
   FROM threads WHERE created_at_ms > 1784420177000 ORDER BY created_at_ms DESC"
```

### 第二步：逐个读取 JSONL 日志

对以下目录下的每个 `rollout-*.jsonl` 文件（按 basename 去重）：
1. `~/.cc-switch/backups/codex-official-history-unify-restore-v1/20260719_081802/jsonl/`（351 个）
2. `~/.codex/sessions/`（30 个）
3. `~/.codex/archived_sessions/`（4 个）

1. **读取 session_meta**：获取 session_id、cwd、model
2. **提取 user_message**：所有 `event_msg` + `payload.type == "user_message"` 的 `payload.message`
3. **提取 agent_message**：所有 `event_msg` + `payload.type == "agent_message"` 的 `payload.message`
4. **标记特殊事件**：
   - `thread_rolled_back` → 直接标记为「回滚」
   - `turn_aborted` → 直接标记为「中断」
   - `patch_apply_end` → 检查是否失败
5. **交叉比对**：将 user_message 与前后 agent_message 配对，识别用户纠正模式

### 第三步：识别错误

用以下关键词和模式在 user_message 和 agent_message 中搜索：

#### 用户纠错信号（user_message 中出现）
- 直接否定：`不对`、`还是不行`、`没解决`、`又出问题了`、`还是同样的问题`、`还是这个问题`
- 问题报告：`报错`、`error`、`失败`、`崩溃`、`不能用`、`有问题`、`不生效`、`无法`、`不能`
- 指令回退：`回退`、`撤销`、`还原`、`不要改`、`撤回`、`别动`
- 方向纠正：`不是这样`、`我说的不是`、`你理解错了`、`我的意思是`、`我要的是`
- 重复要求：用户再次提出同一个需求（说明上一轮没做好）
- 手动修复：用户说`我自己改了`、`我手动修了`

#### AI 自报错误信号（agent_message 中出现）
- 承认失败：`failed`、`error`、`报错`、`失败`、`出错`、`不通过`
- 回滚操作：`revert`、`rollback`、`回退`、`撤销`、`undo`
- 修复行为：`fix`、`修复`、`修补`、`修正`、`hotfix`
- 测试失败：`test failed`、`测试失败`、`断言失败`、`assertion`
- 构建失败：`build failed`、`构建失败`、`编译错误`
- 逻辑修正：`发现...问题`、`原来...不对`、`之前...搞错了`

#### 系统级错误信号（JSONL 结构本身）
- `thread_rolled_back` 事件 → 必定是错误导致的回退
- `turn_aborted` 事件 → 用户主动中断，通常因为 AI 做错了或太慢
- `patch_apply_end` 中 status 非 success → 补丁应用失败

### 第四步：输出格式

对每个识别出的错误，输出一行：

| 字段 | 说明 |
|------|------|
| 对话 ID | 从 session_meta.session_id 取前 8 位 |
| 对话标题 | 从 session_index.jsonl 或 threads 表取 |
| 日期 | 从 session_meta.timestamp 取 |
| 错误类型 | 见下方分类 |
| 错误描述 | 一句话概括犯了什么错 |
| 用户原话 | 用户纠正时的原始输入（如有） |
| 根因分析 | 为什么会犯这个错 |
| 后果 | 造成了什么影响（回滚/中断/返工/白跑） |

### 错误类型分类

| 类型代号 | 名称 | 说明 |
|----------|------|------|
| A | 用户纠正 | 用户明确指出错误并要求修改 |
| B | 代码/执行失败 | 构建失败、测试失败、ESLint 报错、类型错误、补丁应用失败 |
| C | 方向/逻辑错误 | 理解偏差、方案选错、做了不需要的功能、遗漏需求 |
| D | 重复/返工 | 同一个问题反复修、白跑、做了又撤销 |
| E | 系统级错误 | API 连接失败、回滚、中断、超时 |

### 第五步：统计摘要

全部错误列举完毕后，输出：

1. **错误总数**：按类型 A/B/C/D/E 分别统计
2. **回滚/中断统计**：多少次 thread_rolled_back、多少次 turn_aborted
3. **高频错误模式**：Top 10 最常犯的错误
4. **最密集会话**：哪些对话错误最多（标题 + 数量）
5. **模型对比**：不同模型（gpt-5.5、gpt-5.6-sol、gpt-5.6-terra、gpt-5.6-luna）各自的错误率
6. **高频时段**：哪些时间段错误最密集
7. **自问自答**：哪些错误是 AI 自己发现并修复的（不算用户纠正）

---

## 重要说明

1. **去重扫描**：多个备份快照包含重复文件，按 `rollout-*.jsonl` 的 basename 去重后约 385 个唯一文件，加上 `~/.codex/` 的 34 个，总计约 419 个唯一会话日志
2. **优先级**：先读 `20260719_081802` 快照（最全），再用 `~/.codex/sessions/` 补充 7 月 19 日之后的新会话
3. **配对分析**：不能只看关键词，要把 user_message 和 agent_message 放在一起看上下文，才能判断是不是真的错误
4. **回滚 ≠ 错误**：有时回滚是用户改变了主意，不是 AI 犯错——要结合回滚前的对话内容判断
5. **中断 ≠ 错误**：有时中断是因为用户想换方向——要结合上下文判断
6. **JSONL 文件可能很大**：最大的有 22MB（`019f9c80` 那个），可能需要分段读取
7. **agent_reasoning 不是错误**：AI 的推理过程本身不算错误，只有最终结果出错才算
8. **Codex 特有模式**：Codex 会在 `agent_message` 中主动报告"测试失败"、"构建失败"等，这些是重要线索
9. **工具调用失败**：`custom_tool_call_output` 中如果包含 error/failed 也算执行错误
10. **590 个线程 vs 385 个 JSONL**：部分线程可能没有对应的 JSONL 文件（可能已被清理或从未生成），以实际存在的 JSONL 文件为准
