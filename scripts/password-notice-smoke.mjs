import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const scenarioNames = [
  'login-form', 'forgot-entry', 'return-login', 'reset-direct', 'reset-code',
  'reset-fragment', 'external-next', 'backslash-next', 'control-next',
];

export function summarizeEvidence({ baseURL, scenarios, requests, errors }) {
  const origin = new URL(baseURL).origin;
  const external = requests.filter((request) => new URL(request.url).origin !== origin);
  const reset = requests.filter((request) => /\/auth\/v1\/|\/api\/auth\/|\/recover|\/token/.test(new URL(request.url).pathname));
  const posts = requests.filter((request) => request.method === 'POST');
  const forbidden = requests.filter((request) => external.includes(request) || reset.includes(request) || posts.includes(request));
  const allScenariosPassed = scenarios.length === scenarioNames.length
    && scenarioNames.every((name) => scenarios.filter((scenario) => scenario.name === name && scenario.passed).length === 1);
  return {
    passed: allScenariosPassed && forbidden.length === 0 && errors.length === 0,
    scenarios: scenarios.length,
    scenarioResults: scenarios,
    requestCount: requests.length,
    resetRequests: reset.length,
    externalRequests: external.length,
    postRequests: posts.length,
    pageErrors: errors.length,
    requests, forbidden, errors,
  };
}

export async function runSmoke(baseURL, outputDirectory) {
  const target = new URL(baseURL);
  assert.equal(target.protocol, 'http:');
  assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), '只允许本机站点');
  assert.equal(target.pathname, '/');
  assert.equal(target.search + target.hash + target.username + target.password, '');
  const output = resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const requests = [];
  const errors = [];
  const scenarios = [];
  const measurements = [];
  // Intercept external destinations before any connection, but still count attempts.
  await context.route('**/*', (route) => new URL(route.request().url()).origin === target.origin ? route.continue() : route.abort());
  const page = await context.newPage();
  page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
  page.on('pageerror', (error) => errors.push(error.message));
  async function scenario(name, check) {
    try { await check(); scenarios.push({ name, passed: true }); }
    catch (error) { scenarios.push({ name, passed: false, error: String(error) }); throw error; }
  }
  async function notice(title) {
    await page.getByText('修改密码渠道暂时还没启用，请联系管理员为你重置密码。', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), title);
    assert.ok((await page.title()).includes(title));
    assert.equal(await page.locator('form,input,button[type="submit"]').count(), 0);
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('h1').parentElement.parentElement.parentElement).opacity) >= 0.99);
    const contrast = await page.getByRole('alert').filter({ hasText: '修改密码渠道暂时还没启用，请联系管理员为你重置密码。' }).evaluate((element) => {
      // Let Chromium convert CSS Color 4 (color(srgb ...)) and rgba alike.
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const rgba = (value) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
        return [r, g, b, a / 255];
      };
      const blend = (front, back) => front.slice(0, 3).map((value, i) => value * (front[3] ?? 1) + back[i] * (1 - (front[3] ?? 1)));
      const layers = [];
      for (let current = element; current; current = current.parentElement) layers.push(rgba(getComputedStyle(current).backgroundColor));
      const background = layers.reverse().reduce((back, front) => blend(front, back), [255, 255, 255]);
      const foreground = blend(rgba(getComputedStyle(element).color), background);
      const luminance = (rgb) => rgb.map((v) => v / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      const levels = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return { foreground, background, ratio: (levels[0] + 0.05) / (levels[1] + 0.05) };
    });
    measurements.push({ path: new URL(page.url()).pathname, contrast });
    assert.ok(contrast.ratio >= 4.5, `提示文字对比度不足：${contrast.ratio}`);
  }
  try {
    await scenario('login-form', async () => {
      await page.goto(new URL('/login?next=%2Fdashboard', target).href);
      await page.getByRole('button', { name: '登录', exact: true }).waitFor();
      assert.equal(await page.locator('input[name="email"]').count(), 1);
      assert.equal(await page.locator('input[name="password"]').count(), 1);
      await page.locator('input[name="email"]').fill('synthetic@example.invalid');
      await page.locator('input[name="password"]').fill('synthetic-not-submitted');
      assert.equal(await page.getByRole('button', { name: '登录', exact: true }).isEnabled(), true);
    });
    await scenario('forgot-entry', async () => {
      await page.getByRole('link', { name: '忘记密码' }).click();
      await notice('找回密码');
      assert.equal(new URL(page.url()).pathname, '/forgot-password');
      assert.equal(await page.getByRole('link', { name: '返回登录' }).getAttribute('href'), '/login?next=%2Fdashboard');
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('h1').parentElement.parentElement.parentElement).opacity) >= 0.99);
      await page.screenshot({ path: resolve(output, 'forgot.png') });
    });
    await scenario('return-login', async () => {
      await page.getByRole('link', { name: '返回登录' }).click();
      await page.getByRole('button', { name: '登录', exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, '/login');
    });
    const paths = [
      ['reset-direct', '/reset-password', '重置密码'],
      ['reset-code', '/reset-password?code=synthetic-invalid', '重置密码'],
      ['reset-fragment', '/reset-password#access_token=synthetic-invalid&type=recovery', '重置密码'],
      ['external-next', '/forgot-password?next=https%3A%2F%2Freview-example.invalid', '找回密码'],
      ['backslash-next', '/forgot-password?next=%2F%5Creview-example.invalid', '找回密码'],
      ['control-next', '/forgot-password?next=%2F%09%2Freview-example.invalid', '找回密码'],
    ];
    for (const [name, path, title] of paths) await scenario(name, async () => {
      await page.goto(new URL(path, target).href);
      await notice(title);
      assert.equal(await page.getByRole('link', { name: '返回登录' }).getAttribute('href'), '/login');
    });
  } finally {
    await browser.close();
    const evidence = { ...summarizeEvidence({ baseURL, scenarios, requests, errors }), measurements };
    await writeFile(resolve(output, 'browser.json'), JSON.stringify(evidence, null, 2));
    const summary = { ...evidence };
    delete summary.requests;
    delete summary.scenarioResults;
    console.log(JSON.stringify(summary));
  }
  const summary = summarizeEvidence({ baseURL, scenarios, requests, errors });
  assert.equal(summary.passed, true, JSON.stringify(summary));
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runSmoke(process.argv[2] ?? 'http://127.0.0.1:3418/', process.argv[3] ?? '/tmp/dydata-password-notice-smoke').catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
