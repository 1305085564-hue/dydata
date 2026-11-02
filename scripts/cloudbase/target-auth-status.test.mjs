import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {splitPostgresDump,packSqlBatches} from './sql-batches.mjs';

test('status writer is a separately batchable service-only deployment, not part of read-only Auth readers',async()=>{
  const sql=await readFile(new URL('./target-auth-status.sql',import.meta.url),'utf8');
  const statements=splitPostgresDump(sql);
  assert.equal(statements.length,3);
  assert.equal(packSqlBatches(statements,{maxBytes:256*1024,migrationId:'auth-status-test'}).length,1);
  assert.match(sql,/REVOKE ALL PRIVILEGES[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(sql,/GRANT EXECUTE[\s\S]*TO service_role/);
  assert.match(sql,/auth\.role\(\) IS DISTINCT FROM 'service_role'/);
  assert.match(sql,/SET search_path = ''/);
  assert.doesNotMatch(sql,/SET\s+(password|email|sub|email_verified)\s*=/i);
  assert.match(sql,/WHERE id = v_user\.id AND sub = p_subject AND project = p_project/);
});
