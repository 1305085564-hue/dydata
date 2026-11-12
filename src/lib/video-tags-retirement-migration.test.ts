import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261112065847_retire_ai_video_tags_and_lock_manual_source.sql", import.meta.url),
  "utf8",
);

test("AI 视频标签迁移先备份再删除，并把公开来源收紧为手动", () => {
  assert.match(migration, /private\.video_tags_ai_archive_20261112/);
  assert.match(migration, /insert into private\.video_tags_ai_archive_20261112/i);
  assert.match(migration, /delete from public\.video_tags/i);
  assert.match(migration, /source_manual_check/i);
  assert.match(migration, /alter column source set not null/i);
  assert.match(migration, /check \(source = 'manual'\)/i);
  assert.match(migration, /delete from public\.ai_feature_bindings where feature_key = 'video_tag'/i);
  assert.doesNotMatch(migration, /'video_tag',\s*'content_segment'/i);
});
