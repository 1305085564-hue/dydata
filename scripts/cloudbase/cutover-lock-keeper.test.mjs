import assert from 'node:assert/strict';
import test from 'node:test';
import { validateLockSource } from './cutover-lock-keeper.mjs';
test('lock keeper rejects arbitrary remote projects and ambiguous local write targets',()=>{
  assert.throws(()=>validateLockSource('postgresql://postgres@cutover.invalid/db',false));
  assert.throws(()=>validateLockSource('postgresql://postgres.other@aws-1-ap-southeast-1.pooler.supabase.com/postgres',false));
  assert.throws(()=>validateLockSource('postgresql://postgres@localhost/postgres',true));
  assert.equal(validateLockSource('postgresql://postgres@127.0.0.1/cutover_rehearsal_lock',true).host,'127.0.0.1');
});
test('production lock source accepts only exact project endpoint, user, port and database pairs',()=>{
  for(const url of ['postgresql://postgres@db.gcrhhxaopomtposmahsw.supabase.co/postgres','postgresql://postgres.gcrhhxaopomtposmahsw@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'])assert.doesNotThrow(()=>validateLockSource(url,false));
  for(const url of ['postgresql://postgres.other@db.gcrhhxaopomtposmahsw.supabase.co/postgres','postgresql://postgres@db.other.supabase.co/postgres','postgresql://postgres@db.gcrhhxaopomtposmahsw.supabase.co:6543/postgres','postgresql://postgres@db.gcrhhxaopomtposmahsw.supabase.co/other','postgresql://postgres@aws-1-ap-southeast-1.pooler.supabase.com/postgres'])assert.throws(()=>validateLockSource(url,false));
});
