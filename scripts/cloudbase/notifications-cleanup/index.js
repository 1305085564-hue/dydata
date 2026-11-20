'use strict';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- 云函数 index.main 使用 CommonJS 入口。
const https = require('node:https');

function request(url, secret) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { Authorization: `Bearer ${secret}` }, timeout: 35000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('timeout', () => req.destroy(new Error('cleanup request timed out after 35s')));
    req.on('error', reject);
  });
}

exports.main = async function main() {
  const target = process.env.TARGET_URL;
  const secret = process.env.CRON_SECRET;
  if (!target || !secret) throw new Error('missing scheduler configuration');
  const result = await request(target, secret);
  console.log(JSON.stringify({ target, method: 'GET', status: result.status, body: result.body }));
  if (result.status < 200 || result.status >= 300) throw new Error(`cleanup returned HTTP ${result.status}`);
  return { statusCode: result.status, body: result.body };
};
