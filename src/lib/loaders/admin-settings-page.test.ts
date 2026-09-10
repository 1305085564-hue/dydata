import assert from "node:assert/strict";
import test from "node:test";

import { loadAdminSettingsPageData } from "./admin-settings-page";

test("系统设置三组首屏数据并行加载并规范化返回", async () => {
  const started = new Set<string>();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const waitForRelease = async (name: string) => {
    started.add(name);
    await gate;
  };

  const pending = loadAdminSettingsPageData({
    today: "2026-09-10",
    loadThresholds: async () => {
      await waitForRelease("thresholds");
      return {
        bounce_rate_2s: 30,
        completion_rate_5s: 50,
        avg_play_duration: 30,
        completion_rate: 5,
        play_count: 1000,
      };
    },
    loadCurrentQuota: async (today) => {
      assert.equal(today, "2026-09-10");
      await waitForRelease("quota");
      return 6;
    },
    loadRules: async () => {
      await waitForRelease("rules");
      return [{
        id: "rule-1",
        effective_date: "2026-09-01",
        daily_target: 6,
        created_by: "owner-1",
        note: null,
        created_at: "2026-09-01T00:00:00.000Z",
        profiles: [{ name: "负责人" }],
      }];
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  try {
    assert.deepEqual([...started].sort(), ["quota", "rules", "thresholds"]);
  } finally {
    release();
  }

  assert.deepEqual(await pending, {
    thresholds: {
      bounce_rate_2s: 30,
      completion_rate_5s: 50,
      avg_play_duration: 30,
      completion_rate: 5,
      play_count: 1000,
    },
    currentDailyTarget: 6,
    rules: [{
      id: "rule-1",
      effective_date: "2026-09-01",
      daily_target: 6,
      created_by: "owner-1",
      note: null,
      created_at: "2026-09-01T00:00:00.000Z",
      profiles: { name: "负责人" },
    }],
  });
});
