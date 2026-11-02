import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadVerifiedSourceBundle } from './cutover-prepare.mjs';

test('source bundle rejects a corrupted archive or Auth snapshot from another instant', () => {
  const directory=mkdtempSync(path.join(tmpdir(),'dydata-cutover-bundle-'));
  const hash=(value)=>createHash('sha256').update(value).digest('hex');
  const put=(name,value)=>writeFileSync(path.join(directory,name),value,{mode:0o600});
  const capturedAt='2026-11-02T00:00:00.123456Z';
  const contents={database:'full database',public:'public archive',auth:JSON.stringify({capturedAt,sourceUsers:[]})};
  const manifest={format:'dydata-cutover-source-manifest-v1',consistentReadOnlySnapshot:true,capturedAt};
  for(const key of Object.keys(contents)){const file=key+'.private';put(file,contents[key]);manifest[key]={file,sha256:hash(contents[key])};}
  const save=()=>put('manifest.json',JSON.stringify(manifest));
  try {
    save();assert.equal(loadVerifiedSourceBundle(directory).auth.sourceUsers.length,0);
    put('database.private','tampered database');assert.throws(()=>loadVerifiedSourceBundle(directory),/SHA256/);put('database.private',contents.database);
    put('public.private','tampered public');assert.throws(()=>loadVerifiedSourceBundle(directory),/SHA256/);put('public.private',contents.public);
    put('auth.private',contents.auth+' ');assert.throws(()=>loadVerifiedSourceBundle(directory),/SHA256/);
    const mismatched=JSON.stringify({capturedAt:'2026-11-01T00:00:00Z'});put('auth.private',mismatched);manifest.auth.sha256=hash(mismatched);save();assert.throws(()=>loadVerifiedSourceBundle(directory),/snapshots differ/);
    manifest.auth.file='../elsewhere';save();assert.throws(()=>loadVerifiedSourceBundle(directory),/filename/);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
