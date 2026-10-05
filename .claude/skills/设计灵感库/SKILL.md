# 设计灵感库

从知名产品提炼的 68 份 `DESIGN.md` 设计系统（来源：getdesign.md / VoltAgent/awesome-claude-design），每份包含配色、字体、组件、布局、响应式等 9 个标准章节，可直接作为前端视觉工作的设计基准。

## 使用场景

- 新页面/新组件需要确定视觉风格时，先来这里找气质相近的参考
- 需要具体某类产品的设计语言（如后台仪表盘、营销落地页、暗色开发者工具）

## 用法

1. 根据下方索引挑 1-3 个气质匹配的品牌，整读对应文件
2. 提取其 token（颜色、字体、间距、阴影）映射到项目的设计规范
3. 注意：本项目有自己的权威文档，冲突时以 `docs/Claude设计哲学.md` + `docs/Claude设计规范.md` 为准，本库仅作灵感参考，禁止照抄品牌视觉

## 文件索引

文件在 `设计文件/` 目录下，以品牌英文标识命名：

- **AI 与模型平台**：claude、cohere、elevenlabs、minimax、mistral.ai、ollama、opencode.ai、replicate、runwayml、together.ai、voltagent、x.ai
- **开发者工具**：cursor、expo、lovable、raycast、superhuman、vercel、warp
- **后端与数据库**：clickhouse、composio、hashicorp、mongodb、posthog、sanity、sentry、supabase
- **效率与 SaaS**：cal、intercom、linear.app、mintlify、notion、resend、zapier
- **设计与创作工具**：airtable、clay、figma、framer、miro、webflow
- **金融与加密**：binance、coinbase、kraken、mastercard、revolut、stripe、wise
- **电商与零售**：airbnb、meta、nike、shopify
- **媒体与消费科技**：apple、ibm、nvidia、pinterest、playstation、spacex、spotify、theverge、uber、vodafone、wired
- **汽车**：bmw、bugatti、ferrari、lamborghini、renault、tesla

各文件 frontmatter 的 `description` 一句话概括了该系统的气质（如「暗色电影感」「暖色极简」「终端风」），可先 grep 关键词快速筛选。
