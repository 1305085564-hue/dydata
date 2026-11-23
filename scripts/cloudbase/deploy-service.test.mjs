import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { injectPublicBuildArgs, prepareDeployment } from './deploy-service.mjs';

test('只把公开配置注入构建参数，私钥不会进入 Dockerfile', () => {
  const result = injectPublicBuildArgs('ARG NEXT_PUBLIC_CLOUDBASE_ENV_ID\nARG NEXT_PUBLIC_APP_URL\n', {
    NEXT_PUBLIC_CLOUDBASE_ENV_ID: 'dydata-env',
    NEXT_PUBLIC_APP_URL: 'https://dydata.cc',
    CRON_SECRET: 'private-test-secret',
  });
  assert.match(result, /ARG NEXT_PUBLIC_CLOUDBASE_ENV_ID="dydata-env"/);
  assert.doesNotMatch(result, /private-test-secret|CRON_SECRET/);
  assert.throws(() => injectPublicBuildArgs('ARG NEXT_PUBLIC_MISSING', { NEXT_PUBLIC_APP_URL: 'https://dydata.cc' }), /缺失/);
});

test('发布包保留中文文件名，提交号来自已推送的 main，发版前强制核对必填环境变量，忽略本机密钥文件', () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'dydata-package-test-'));
  let prepared;
  const git = (...args) => execFileSync('git', args, { cwd: repo });
  try {
    git('init', '-b', 'main');
    git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'test');
    mkdirSync(path.join(repo, 'public'));
    writeFileSync(path.join(repo, 'public/中文.txt'), '中文');
    writeFileSync(path.join(repo, 'public/large.txt'), 'x'.repeat(2 * 1024 * 1024));
    writeFileSync(path.join(repo, 'Dockerfile'), 'ARG NEXT_PUBLIC_CLOUDBASE_ENV_ID\n');
    writeFileSync(path.join(repo, '.env.example'), '# == [必填] ==\nCLOUDBASE_ENV_ID=x\nNEXT_PUBLIC_CLOUDBASE_ENV_ID=x\n');
    writeFileSync(path.join(repo, '.gitignore'), '.env.local\n');
    git('add', 'public/中文.txt', 'public/large.txt', 'Dockerfile', '.env.example', '.gitignore'); git('commit', '-m', 'fixture');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    writeFileSync(path.join(repo, '.env.local'), 'PRIVATE=not-for-upload');

    const env = { CLOUDBASE_ENV_ID: 'dydata-env', NEXT_PUBLIC_CLOUDBASE_ENV_ID: 'dydata-env' };
    const gatePassPath = path.resolve(repo, git('rev-parse', '--git-path', 'dydata-gate-pass').toString().trim());

    assert.throws(() => prepareDeployment(repo, env), /先正常 git push（不带 --no-verify）让门禁跑完/);

    writeFileSync(gatePassPath, '0000000000000000000000000000000000000000\n');
    assert.throws(() => prepareDeployment(repo, env), /先正常 git push（不带 --no-verify）让门禁跑完/);

    const headCommit = git('rev-parse', 'HEAD').toString().trim();
    writeFileSync(gatePassPath, `${headCommit}\n`);

    assert.throws(
      () => prepareDeployment(repo, { NEXT_PUBLIC_CLOUDBASE_ENV_ID: 'dydata-env' }),
      /缺少代码必填环境变量：CLOUDBASE_ENV_ID/,
    );

    prepared = prepareDeployment(repo, env);
    assert.equal(execFileSync('unzip', ['-p', prepared.archive, 'public/中文.txt']).toString(), '中文');
    assert.equal(execFileSync('unzip', ['-p', prepared.archive, 'public/large.txt'], { maxBuffer: 3 * 1024 * 1024 }).length, 2 * 1024 * 1024);
    assert.equal(JSON.parse(execFileSync('unzip', ['-p', prepared.archive, 'public/deployment.json'])).commit, headCommit);
    assert.doesNotMatch(execFileSync('unzip', ['-Z1', prepared.archive]).toString(), /\.env\.local/);
    assert.match(readFileSync(path.join(prepared.directory, 'source/Dockerfile'), 'utf8'), /"dydata-env"/);
  } finally {
    if (prepared) rmSync(prepared.directory, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});
