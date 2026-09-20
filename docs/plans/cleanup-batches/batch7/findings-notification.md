# Batch 7 核查卡：notification

- 当前消息发送调用已集中到 `src/lib/飞书webhook.ts:sendFeishuWebhook`，已见调用方为 dashboard actions 与 admin first-screen monitor。
- `src/lib/topics/feishu-content.ts` 等属于文档/事件能力，不是消息出口，不迁移。

## 结论

D-NOT-1 销案为“已收口 + 能力归属文档待补”；不改事件订阅、文档读写和外部入口。
