// 抽帧核查工具（开发用）：node video-intro/_probe.mjs 1.2 6.5 20 ...
// 输出单帧 PNG + 一张拼版 sheet.png，便于人眼/AI 逐帧看构图
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const times = process.argv.slice(2).filter(a => !a.startsWith('--')).map(Number);
const cols = Number((process.argv.find(a => a.startsWith('--cols=')) || '--cols=3').split('=')[1]);
const dir = path.join(__dirname, 'out', 'probe');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('file://' + path.join(__dirname, 'player.html'));

for (let i = 0; i < times.length; i++) {
  const info = await page.evaluate(tt => window.renderAt(tt), times[i]);
  await page.locator('#c').screenshot({
    path: path.join(dir, `${String(i).padStart(2, '0')}-t${times[i].toFixed(2)}.png`)
  });
  console.log(`t=${times[i].toFixed(2)}s -> scene ${info.scene} @ ${info.tLocal.toFixed(2)}s`);
}
await browser.close();
if (errs.length) { console.log('\n!! 页面报错:'); errs.forEach(e => console.log('  ', e)); }

const rows = Math.ceil(times.length / cols);
execSync(`ffmpeg -y -loglevel error -pattern_type glob -i "${dir}/*.png" ` +
  `-filter_complex "scale=620:349,tile=${cols}x${rows}:padding=6:color=0x555555" ` +
  `-frames:v 1 "${dir}/sheet.png"`, { stdio: 'inherit' });
console.log('sheet ->', path.join(dir, 'sheet.png'));
