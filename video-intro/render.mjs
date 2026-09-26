import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, arr) =>
    a.startsWith('--') ? [a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? true : arr[i + 1]] : []
  ).filter(x => x.length)
);
const seconds = parseFloat(args.seconds || '0'); // 0 = 按场景总时长
const fps = parseInt(args.fps || '30', 10);
const out = args.out || 'video-intro/out/dydata-intro-45s.mp4';

const outAbs = path.isAbsolute(out) ? out : path.join(process.cwd(), out);
const framesDir = path.join(path.dirname(outAbs), '.frames-' + Date.now());
fs.mkdirSync(framesDir, { recursive: true });
fs.mkdirSync(path.dirname(outAbs), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file://' + path.join(__dirname, 'player.html'));

const total = seconds > 0 ? seconds : await page.evaluate(() => window.totalDurationSec());
const n = Math.max(1, Math.round(total * fps));
console.log(`render ${n} frames, ${total.toFixed(2)}s @ ${fps}fps`);

for (let i = 0; i < n; i++) {
  const t = i / fps;
  await page.evaluate((tt) => window.renderAt(tt), t);
  await page.locator('#c').screenshot({ path: path.join(framesDir, `frame-${String(i).padStart(4, '0')}.png`) });
}
await browser.close();

execSync(
  `ffmpeg -y -loglevel error -framerate ${fps} -i "${framesDir}/frame-%04d.png" -c:v libx264 -pix_fmt yuv420p "${outAbs}"`,
  { stdio: 'inherit' }
);
fs.rmSync(framesDir, { recursive: true, force: true });
console.log('done ->', outAbs, `(${n} frames)`);
