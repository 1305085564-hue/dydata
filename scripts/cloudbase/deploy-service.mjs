#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

export function injectPublicBuildArgs(dockerfile, env) {
  if (env.DYDATA_BACKEND !== 'cloudbase' || env.NEXT_PUBLIC_DYDATA_BACKEND !== 'cloudbase') {
    throw new Error('云托管两个后端变量必须都是 cloudbase');
  }
  return dockerfile.replace(/^ARG (NEXT_PUBLIC_[A-Z_]+)$/gm, (_, key) => {
    const value = env[key];
    if (value === undefined || value === 'undefined' || /[\r\n]/.test(value)) {
      throw new Error(`构建参数缺失或无效：${key}`);
    }
    return `ARG ${key}=${JSON.stringify(value)}`;
  });
}

export function prepareDeployment(repo, env) {
  const git = (...args) => execFileSync('git', args, { cwd: repo, maxBuffer: 100 * 1024 * 1024 });
  if (git('status', '--porcelain').length) throw new Error('先提交本轮改动，再从干净 main 发版');
  if (git('branch', '--show-current').toString().trim() !== 'main') throw new Error('只发布 main');
  const commit = git('rev-parse', 'HEAD').toString().trim();
  if (commit !== git('rev-parse', 'origin/main').toString().trim()) throw new Error('HEAD 必须等于 origin/main');
  const gatePassPath = path.resolve(repo, git('rev-parse', '--git-path', 'dydata-gate-pass').toString().trim());
  if (!existsSync(gatePassPath) || readFileSync(gatePassPath, 'utf8').trim() !== commit) {
    throw new Error('先正常 git push（不带 --no-verify）让门禁跑完');
  }
  const directory = mkdtempSync(path.join(tmpdir(), 'dydata-release-'));
  const archive = path.join(directory, 'source.zip');
  const source = path.join(directory, 'source');
  execFileSync('mkdir', ['-p', source]);
  execFileSync('tar', ['-xf', '-', '-C', source], { input: git('archive', '--format=tar', 'HEAD'), maxBuffer: 100 * 1024 * 1024 });
  const dockerfile = path.join(source, 'Dockerfile');
  writeFileSync(dockerfile, injectPublicBuildArgs(readFileSync(dockerfile, 'utf8'), env));
  writeFileSync(path.join(source, 'public/deployment.json'), JSON.stringify({ commit, backend: 'cloudbase' }) + '\n');
  // git archive --format=zip 把中文路径转成 #Uxxxx；系统 zip 保留 UTF-8 文件名。
  execFileSync('zip', ['-qr', archive, '.'], { cwd: source });
  return { directory, archive, commit };
}

async function main() {
  process.umask(0o077);
  const modulePath = process.env.CLOUDBASE_MCP_MODULE;
  if (!modulePath) throw new Error('请设置已安装的 @cloudbase/cloudbase-mcp 模块路径 CLOUDBASE_MCP_MODULE');
  const { envId } = JSON.parse(readFileSync(path.join(root, 'cloudbaserc.json'), 'utf8'));
  const keyPath = path.join(homedir(), '.local/share/dydata/keys/腾讯云CloudBase.txt');
  if (statSync(keyPath).mode & 0o077) throw new Error('凭据文件权限必须为 600');
  process.env.CLOUDBASE_API_KEY = readFileSync(keyPath, 'utf8').trim();
  process.env.CLOUDBASE_ENV_ID = envId;
  const sdk = await import(pathToFileURL(modulePath).href);
  const manager = await sdk.getCloudBaseManager({ cloudBaseOptions: { envId, region: 'ap-shanghai' } });
  const service = manager.environmentManager.currentEnv.cloudRunService;
  const detail = await service.detail({ serverName: 'dydata' });
  const env = JSON.parse(detail.ServerConfig.EnvParams);
  const prepared = prepareDeployment(root, env);
  try {
    const build = await service.tcbService.request('DescribeCloudBaseBuildService', { EnvId: envId, ServiceName: 'dydata' });
    const zip = readFileSync(prepared.archive);
    const headers = Object.fromEntries((build.UploadHeaders || []).map(item => [item.Key, item.Value]));
    const upload = await fetch(build.UploadUrl, { method: 'PUT', headers, body: zip });
    if (!upload.ok) throw new Error(`上传失败 HTTP ${upload.status}`);
    const result = await service.tcbrService.request('UpdateCloudRunServer', {
      EnvId: envId, ServerName: 'dydata',
      DeployInfo: { DeployType: 'package', PackageName: build.PackageName, PackageVersion: build.PackageVersion, ReleaseType: 'FULL' },
      Items: [{ Key: 'EnvParam', Value: JSON.stringify(env) }],
    });
    console.log(JSON.stringify({ commit: prepared.commit, packageVersion: build.PackageVersion, zipSha256: createHash('sha256').update(zip).digest('hex'), requestId: result.RequestId }));
  } finally {
    rmSync(prepared.directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
