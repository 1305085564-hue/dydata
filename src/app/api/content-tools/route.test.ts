import test from "node:test";
import assert from "node:assert/strict";

test("isContentToolsAction recognizes supported actions", async () => {
  const mod = await import(new URL("./helpers.ts", import.meta.url).href);
  const { isContentToolsAction } = mod;
  assert.equal(isContentToolsAction("topic_suggest"), true);
  assert.equal(isContentToolsAction("template_library"), true);
  assert.equal(isContentToolsAction("publish_recommend"), true);
  assert.equal(isContentToolsAction("other"), false);
});

test("extractJsonString handles fenced JSON", async () => {
  const mod = await import(new URL("./helpers.ts", import.meta.url).href);
  const { extractJsonString } = mod;
  const content = '```json\n{"foo":1}\n```';
  assert.equal(extractJsonString(content), '{"foo":1}');
});

test("parseTopicSuggestions returns null for invalid payload", async () => {
  const mod = await import(new URL("./helpers.ts", import.meta.url).href);
  const { parseTopicSuggestions } = mod;
  assert.equal(parseTopicSuggestions("{}"), null);
});

test("parseTopicSuggestions parses valid suggestion list", async () => {
  const mod = await import(new URL("./helpers.ts", import.meta.url).href);
  const { parseTopicSuggestions } = mod;
  const content = JSON.stringify({
    suggestions: [
      {
        title: "券商分歧后谁接力",
        category: "券商",
        angle: "分歧转一致",
        expectedPerformance: "预计高于近7天账号中位播放 1.5-2 倍",
        evidence: "近14天券商标签视频 3 条进入爆款样本",
        referenceVideos: [
          {
            videoId: "video-1",
            title: "券商异动解读",
            accountName: "阿禅",
            playCount24h: 12000,
            breakoutCoefficient: 2.4,
          },
        ],
      },
    ],
  });

  const parsed = parseTopicSuggestions(content);
  assert.equal(parsed?.length, 1);
  assert.equal(parsed?.[0]?.title, "券商分歧后谁接力");
  assert.equal(parsed?.[0]?.referenceVideos[0]?.videoId, "video-1");
});
