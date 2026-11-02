import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWriteFixtures} from './write-fixtures.mjs';
import {validateWriteFixtures,insertSql} from './write-acceptance.mjs';
import {uuid} from './permission-fixtures.mjs';

test('B05 has 80 writable-table fixtures and explicit private/content support',()=>{
  const fixtures=validateWriteFixtures(buildWriteFixtures());
  assert.equal(fixtures.filter(f=>!f.support).length,80);
  assert.deepEqual(fixtures.filter(f=>f.support).map(f=>f.table).sort(),['content_item','sub_topic_claims']);
  assert.equal(fixtures.find(f=>f.table==='profiles').existing,true);
  assert.equal(fixtures.find(f=>f.table==='sub_topic_claims').key.id,uuid(26001));
});
test('B05 fixture validation rejects historical keys, unknown identifiers and duplicate rows',()=>{
  for(const mutate of [f=>{f[0].key.id='12345678-1111-2222-3333-123456789abc';f[0].insert.id=f[0].key.id;},f=>{f[0].table='videos;drop table videos';},f=>{f.push(f[0]);},f=>{f[0].insert.id=uuid(123);},f=>{f[0].patch=null;}]){
    const fixtures=buildWriteFixtures();mutate(fixtures);assert.throws(()=>validateWriteFixtures(fixtures));
  }
});
test('B05 identity seed is explicit while generated columns and secrets stay absent',()=>{
  const fixtures=buildWriteFixtures();
  assert.match(insertSql(fixtures.find(f=>f.table==='usage_events')),/OVERRIDING SYSTEM VALUE/);
  assert.ok(fixtures.filter(f=>!f.existing).every(f=>!Object.keys(f.insert).some(k=>/password|encrypted_password/.test(k))));
  for(const f of fixtures.filter(f=>f.table==='ai_channels'||f.table==='ai_providers'||f.table==='ai_provider_keys'||f.table.startsWith('rewrite_model'))){
    assert.equal(f.insert.is_enabled,false);
    if(f.insert.base_url)assert.equal(f.insert.base_url,'https://example.invalid');
  }
});
test('B05 all foreign identifiers are owned fixture keys or approved existing synthetic parents',()=>{
  const fixtures=buildWriteFixtures();
  const ids=new Set([uuid(6),uuid(101),uuid(401),uuid(21000),uuid(21001),...fixtures.flatMap(f=>Object.values(f.key))]);
  for(const f of fixtures)for(const [field,value]of Object.entries({...f.insert,...f.patch})){
    if(typeof value==='string' && /^[0-9a-f]{8}-/.test(value))assert.ok(ids.has(value),`${f.table}.${field} is not an owned reference`);
  }
});
