import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildWriteLockSql } from './cutover-freeze.mjs';
import { assertLoopbackRehearsalUrl, parsePostgresUrl, findPostgresTool, ensurePrivateFile, ensurePrivateOutputDirectory, quoteLiteral, isAuthorizedSourceIdentity } from './cutover-core.mjs';

export function lockSourceIdentity(parsed) { return {host:parsed.host,port:parsed.env.PGPORT,user:parsed.env.PGUSER,database:parsed.database}; }

export function validateLockSource(connectionUrl, rehearsal) {
  if (rehearsal) return assertLoopbackRehearsalUrl(connectionUrl, { rehearsal: true });
  const source = parsePostgresUrl(connectionUrl);
  if (!isAuthorizedSourceIdentity(lockSourceIdentity(source))) throw Error('Authorized source project mismatch');
  return source;
}

// Separate process: no synchronous export/import runs in this event loop.
// Heartbeats reset the idle timeout and prove all 100 relation locks remain held.
export async function holdSourceWriteLock({ connectionUrl, tableNames, opensAt, closesAt, receiptPath, rehearsal = false }) {
  const source = validateLockSource(connectionUrl, rehearsal);
  const lockSql = buildWriteLockSql(tableNames);
  const opens = Date.parse(opensAt), closes = Date.parse(closesAt);
  if (!Number.isFinite(opens) || !Number.isFinite(closes) || closes <= opens || closes-opens > 4*3600_000 || Date.now()<opens || Date.now()>=closes) throw Error('Outside authorized lock window');
  ensurePrivateOutputDirectory(path.dirname(path.resolve(receiptPath)));
  const record = { lockId: randomUUID(), acquiredAt: null, state: 'STARTING', rehearsal, project: 'gcrhhxaopomtposmahsw', source:lockSourceIdentity(source), opensAt, closesAt, pid: null, lockCount: 0, heartbeatAt: null };
  writeFileSync(receiptPath, JSON.stringify(record, null, 2), { mode: 0o600, flag: 'wx' });
  const child = spawn(findPostgresTool('psql'), ['-X','-qAt','-w','-v','ON_ERROR_STOP=1'], { env: { ...process.env, ...source.env, PGCONNECT_TIMEOUT: '10' }, stdio: ['pipe','pipe','ignore'] });
  const tableOids = [...tableNames.map((name)=>'public."'+name.replaceAll('"','""')+'"'),'auth.users'].map((name)=>quoteLiteral(name)+'::regclass').join(',');
  const heartbeat = `SELECT jsonb_build_object('pid',pg_backend_pid(),'at',clock_timestamp(),'locks',(SELECT count(*) FROM pg_locks WHERE pid=pg_backend_pid() AND locktype='relation' AND mode='ShareLock' AND granted AND relation IN (${tableOids})))::text;\n`;
  const save = () => writeFileSync(receiptPath, JSON.stringify(record,null,2), { mode:0o600 });
  let stopped = false, buffer = '', lastReceiptMs = Date.now();
  const stop = (state) => { if(stopped)return;stopped=true;record.state=state;record.releaseReason=state;save();child.stdin.end('ROLLBACK;\n');setTimeout(()=>{if(child.exitCode===null)child.kill('SIGTERM');},3000).unref(); };
  const onSignal = () => stop('RELEASING');
  process.on('SIGINT',onSignal);process.on('SIGTERM',onSignal);
  child.stdout.setEncoding('utf8');
  child.stdout.on('data',(chunk)=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.startsWith('{'))continue;
    try {const value=JSON.parse(line);if(value.locks!==100 || !Number.isFinite(Date.parse(value.at)))throw Error('Lock lost');
      if(Date.parse(value.at)>=closes){stop('WINDOW_ENDED');return;}record.acquiredAt??=value.at;record.pid=value.pid;record.lockCount=value.locks;record.heartbeatAt=value.at;record.state='HELD';lastReceiptMs=Date.now();save();
    } catch {stop('FAILED');}
  }});
  child.stdin.on('error',()=>stop('FAILED'));
  child.stdin.write(`DO $window$ BEGIN IF clock_timestamp()<${quoteLiteral(new Date(opens).toISOString())}::timestamptz OR clock_timestamp()>=${quoteLiteral(new Date(closes).toISOString())}::timestamptz THEN RAISE EXCEPTION 'Outside authorized lock window'; END IF; END $window$;\n`+lockSql+heartbeat);
  const timer=setInterval(()=>{if(Date.now()>=closes)stop('WINDOW_ENDED');else if(Date.now()-lastReceiptMs>45_000)stop('FAILED');},1000);
  const pulse=setInterval(()=>{if(!stopped)child.stdin.write(heartbeat);},30_000);
  return new Promise((resolve,reject)=>{
    let settled=false;const finish=(failed)=>{if(settled)return;settled=true;clearInterval(timer);clearInterval(pulse);process.off('SIGINT',onSignal);process.off('SIGTERM',onSignal);
      record.state=failed?'FAILED':'RELEASED';record.releasedAt=new Date().toISOString();save();if(failed)reject(Error('Source lock lost or failed; re-export before continuing'));else resolve(record);};
    child.on('error',()=>finish(true));child.on('exit',(code)=>finish(code!==0 || record.state==='FAILED' || (!stopped && record.state!=='RELEASING')));
  });
}

async function main() {
  if(process.argv.includes('--help')) { console.log('Offline/local rehearsal: DYDATA_CUTOVER_SOURCE_URL=... node scripts/cloudbase/cutover-lock-keeper.mjs --rehearsal --inventory PRIVATE_JSON --receipt NEW_PRIVATE_FILE --opens ISO --closes ISO\nFuture production use requires --hold-authorized-source instead of --rehearsal plus the exact source project, an approved window and fresh 99-table inventory. No source connection occurs with --help.');return; }
  const argv=process.argv.slice(2), rehearsal=argv.includes('--rehearsal');
  if(!rehearsal&&!argv.includes('--hold-authorized-source'))throw Error('Explicit lock execution marker required');
  const get=(flag)=>{const i=argv.indexOf(flag);if(i<0||!argv[i+1])throw Error('Missing '+flag);return argv[i+1];};
  const inventory=get('--inventory');ensurePrivateFile(inventory);
  await holdSourceWriteLock({connectionUrl:process.env.DYDATA_CUTOVER_SOURCE_URL,tableNames:JSON.parse(readFileSync(inventory,'utf8')),receiptPath:get('--receipt'),opensAt:get('--opens'),closesAt:get('--closes'),rehearsal});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Cutover lock keeper failed; inspect private receipt. No credentials logged.');process.exitCode=1;});
