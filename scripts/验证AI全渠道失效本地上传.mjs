import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { chromium, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { deleteSubmissionScreenshots, downloadSubmissionScreenshotBytes } from '../src/lib/screenshot-storage.ts';

const baseUrl = process.env.AI_GOVERNANCE_PAGE_URL;
const dbUrl = process.env.AI_GOVERNANCE_TEST_URL;
for (const url of [baseUrl, dbUrl]) assert.match(url ?? '', /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/);
assert.ok(process.env.AI_GOVERNANCE_SCREENSHOT, '请指定用于本地上传验收的 PNG/JPEG 截图');
const env = parse(readFileSync('.env.ai-test.local'));
for (const name of Object.keys(process.env)) if (name.startsWith('COS_')) delete process.env[name];
Object.assign(process.env, { DYDATA_BACKEND: 'supabase', NEXT_PUBLIC_DYDATA_BACKEND: 'supabase', SCREENSHOT_STORAGE: 'supabase', NEXT_PUBLIC_SUPABASE_URL: dbUrl, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY });
const db = createClient(dbUrl, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const keys = await db.from('ai_provider_keys').select('id,is_enabled');
const binding = await db.from('ai_feature_bindings').select('channel_settings').eq('feature_key', 'ocr_screenshot').single();
assert.equal(keys.error, null); assert.equal(binding.error, null);
const browser = await chromium.launch({ headless: true });
const uploaded = [];
const ocr = [];
const responseTasks = [];
try {
  assert.equal((await db.from('ai_provider_keys').update({ is_enabled: false }).in('id', keys.data.map(row => row.id))).error, null);
  assert.equal((await db.from('ai_feature_bindings').update({ channel_settings: { ...binding.data.channel_settings, ocr_screenshot_channel: 'vision' } }).eq('feature_key', 'ocr_screenshot')).error, null);
  const page = await browser.newPage();
  page.on('response', response => {
    if (response.request().method() !== 'POST') return;
    if (response.url().endsWith('/api/submission-screenshots')) responseTasks.push(response.json().then(payload => { assert.equal(response.status(), 200); uploaded.push(payload.data); }));
    if (response.url().endsWith('/api/ocr-screenshot')) responseTasks.push(response.json().then(payload => ocr.push({ status: response.status(), code: payload.error_code })));
  });
  await page.goto(`${baseUrl}/login`);
  await page.getByLabel('邮箱', { exact: true }).fill(env.DYDATA_E2E_OWNER_EMAIL);
  await page.getByLabel('密码', { exact: true }).fill(env.DYDATA_E2E_OWNER_PASSWORD);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.waitForURL(url => !url.pathname.includes('/login'));
  await page.goto(`${baseUrl}/dashboard`);
  await page.waitForLoadState('networkidle');
  await page.locator('input[type=file][multiple]').waitFor({ state: 'attached' });
  await page.locator('input[type=file][multiple]').setInputFiles([process.env.AI_GOVERNANCE_SCREENSHOT, process.env.AI_GOVERNANCE_SCREENSHOT]);
  await expect.poll(() => ocr.length, { timeout: 30_000 }).toBe(2).catch(async error => { console.log('Upload state:', (await page.locator('body').innerText()).slice(-2400)); throw error; });
  await Promise.all(responseTasks);
  assert.equal(uploaded.length, 2);
  assert.ok(ocr.every(result => result.status >= 400 && result.code === 'AI_CHANNEL_UNAVAILABLE'));
  await expect(page.getByText(/截图已保留，可直接手动填写指标/).filter({ visible: true })).toHaveCount(2);
  for (const row of uploaded) assert.equal((await downloadSubmissionScreenshotBytes(row.path)).ok, true);
  const title = page.getByPlaceholder('输入视频标题').filter({ visible: true });
  await title.fill('本地全渠道失效验收（不提交）');
  await expect(title).toHaveValue('本地全渠道失效验收（不提交）');
  console.log('PASS: real owner page uploaded two files to local storage; both actual OCR requests returned AI_CHANNEL_UNAVAILABLE; both retained images readable from storage; manual entry remains editable. No work/report submitted.');
} finally {
  await Promise.allSettled(responseTasks);
  if (uploaded.length) {
    assert.equal((await deleteSubmissionScreenshots(uploaded.map(row => row.path))).failures, 0);
    for (const row of uploaded) assert.equal((await downloadSubmissionScreenshotBytes(row.path)).ok, false);
  }
  for (const key of keys.data) assert.equal((await db.from('ai_provider_keys').update({ is_enabled: key.is_enabled }).eq('id', key.id)).error, null);
  assert.equal((await db.from('ai_feature_bindings').update({ channel_settings: binding.data.channel_settings }).eq('feature_key', 'ocr_screenshot')).error, null);
  await browser.close();
  console.log('CLEANUP: uploaded objects removed; local channel enables and OCR binding restored.');
}
