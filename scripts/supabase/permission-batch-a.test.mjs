import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewedSource } from './batch-a-reviewed-source.mjs';
import { targets, guards, buildApply, buildRollback } from './permission-batch-a.mjs';
test('batch A keeps the live leaderboard session permission and exact approved counts',()=>{
 assert.equal(targets.length,31);
 assert.deepEqual(targets.reduce((r,t)=>(r[t.access]=(r[t.access]||0)+1,r),{}),{S:15,R:11,O:5});
 assert.equal(targets.find(t=>t.signature==='public.get_leaderboard_rows(date)').access,'R');
});
test('incomplete snapshots cannot produce an executable transaction',()=>{
 assert.throws(()=>buildApply({functions:[]}),/Incomplete snapshot/);
});
test('four guarded replacements use existing fixed-role helpers and first-join-only rule',()=>{
 assert.equal((guards.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,4);
 assert.match(guards,/v_applicant\.team_id is not null/);
 assert.match(guards,/public\.has_permission\('review_violations'\)/);
 assert.doesNotMatch(guards,/permissions\s*->>/);
 assert.doesNotMatch(guards,/UPDATE\s+auth\./i);
});

test('generator rejects reviewed-source drift rather than silently rebasing it',()=>{
 const functions=reviewedSource.map(f=>({...f,definition:'test-only nonexecuted input',acl:'test-only nonempty ACL'}));
 const original={functions,dependencies:'test-only dependency fingerprint'};
 const changed=structuredClone(original);changed.functions[0].md5='changed';
 assert.throws(()=>buildApply(changed),/Unreviewed source drift/);
 const changedOwner=structuredClone(original);changedOwner.functions[0].owner='service_role';
 assert.throws(()=>buildApply(changedOwner),/Unreviewed metadata/);
 const applied=structuredClone(original);applied.functions.pop();
 assert.throws(()=>buildRollback(original,applied),/Incomplete snapshot/);
});
