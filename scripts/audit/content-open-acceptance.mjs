// Real local acceptance. Mutations are limited to a synthetic fixture in a disposable clone.
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = new URL(process.env.CONTENT_PERF_APP_URL || 'http://localhost:3217');
const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
const db = new URL(process.env.SUPABASE_DB_URL);
for (const url of [base, api, db]) assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
assert.match(db.pathname, /^\/content_perf_[a-z0-9_]+$/);
assert.equal(api.port,'54330','Use the dedicated clone REST proxy, never the shared local API');
const accountId = '7b550000-0000-4000-8000-000000000001';
const params = new URLSearchParams({accountId, pageSize:'100', scope:'company'});
const listPath = (extra={}) => `/api/admin/content/list?${new URLSearchParams({...Object.fromEntries(params), ...extra})}`;
const client = createClient(api.href, process.env.SUPABASE_SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const browser = await chromium.launch({headless:true});
const checks = [];
let stage = 'login', failed = null, restoreVideo;
const pass = (name, evidence={}) => checks.push({name, passed:true, ...evidence});
const context = await browser.newContext();
const page = await context.newPage();
try {
 await page.goto(new URL('/login',base).href);
 await page.getByRole('textbox',{name:'邮箱',exact:true}).fill(process.env.DYDATA_E2E_EMAIL);
 await page.getByRole('textbox',{name:'密码',exact:true}).fill(process.env.DYDATA_E2E_PASSWORD);
 await Promise.all([page.waitForURL('**/dashboard'),page.locator('button[type="submit"]').click()]);
 const read = async (extra={}) => {
  const r = await context.request.get(new URL(listPath(extra),base).href);
  assert.equal(r.status(),200);
  return {body:await r.json(),headers:r.headers()};
 };
 stage='pagination-and-filters';
 for (const size of [50,100,500]) {
  const result=await read({pageSize:String(size),fresh:'1'});
  assert.equal(result.body.videos.length,size);
  assert.equal(result.body.summary.totalVideos,569);
  pass(`page-size-${size}`,{returned:size,total:569});
 }
 const complex=await read({keyword:'fixture',playBucket:'custom',playMin:'35000',playMax:'40000',onlyAnomaly:'1',fresh:'1'});
 assert.ok(complex.body.videos.length>0);
 for(const video of complex.body.videos) {
  assert.ok(video.video_title.includes('fixture'));
  assert.equal(video.anomaly_status,'限流');
  const play=complex.body.snapshots.find(row=>row.video_id===video.id)?.play_count;
  assert.ok(play>=35000 && play<40000);
 }
 pass('complex-filter',{returned:complex.body.videos.length});
 const empty=await read({startDate:'2099-01-01',endDate:'2099-01-01',fresh:'1'});
 assert.equal(empty.body.videos.length,0);pass('empty-date');
 stage='cache-control-and-access';
 const fresh=await read({fresh:'1'});assert.equal(fresh.headers['cache-control'],'no-store');
 const repeat=await read();assert.equal(repeat.headers['cache-control'],'private, max-age=60');
 pass('fresh-and-repeat',{freshServerTiming:fresh.headers['server-timing'],repeatServerTiming:repeat.headers['server-timing']});
 const anonymous=await browser.newContext();
 const denied=await anonymous.request.get(new URL(listPath(),base).href);
 assert.equal(denied.status(),401);await anonymous.close();pass('anonymous-after-cache-warm',{status:401});
 const outside=await read({userId:'7b550000-0000-4000-8000-000000000099',fresh:'1'});
 assert.equal(outside.body.videos.length,0);pass('unrelated-user-filter-is-empty');
 stage='real-page-and-failure';
 await context.addInitScript(()=>localStorage.setItem('content-review-onboarding-seen','true'));
 for(const size of [50,100,500]) {
  await page.goto(new URL(`/admin/content?accountId=${accountId}&pageSize=${size}`,base).href);
  await page.locator('#content-review-list[data-content-ready="true"]').waitFor();
  await page.getByRole('button',{name:/^查看作品详情：/}).first().waitFor();
  assert.equal(await page.getByRole('button',{name:/^查看作品详情：/}).count(),size);
  pass(`real-page-${size}`);
 }
 const firstId=await page.locator('#content-review-list').getAttribute('data-content-first-id');
 await page.route('**/api/admin/content/list?**',route=>route.abort());
 await page.getByRole('button',{name:'前一天',exact:true}).click();
 await page.getByText('列表没能刷新，当前显示的仍是上次的数据',{exact:true}).waitFor();
 assert.equal(await page.locator('#content-review-list').getAttribute('data-content-first-id'),firstId);
 await page.unroute('**/api/admin/content/list?**');pass('failed-refresh-is-visible');
 stage='isolated-write-refresh';
 const row=fresh.body.videos[0];assert.ok(row.id.startsWith('7b550000-'));
 const original=await client.from('videos').select('id,account_id,video_title,content,lifecycle_state,trashed_at,purged_at').eq('id',row.id).single();
 assert.equal(original.error,null);assert.equal(original.data.account_id,accountId);
 restoreVideo=async()=>{const {id,account_id,...fields}=original.data;void id;void account_id;const result=await client.from('videos').update(fields).eq('id',row.id);assert.equal(result.error,null);};
 const marker='content-perf-write-acceptance';
 const update=await client.from('videos').update({video_title:marker,content:null}).eq('id',row.id);assert.equal(update.error,null);
 const updated=await read({keyword:marker,fresh:'1'});
 assert.equal(updated.body.videos.length,1);assert.equal(updated.body.videos[0].video_title,marker);assert.equal(updated.body.videos[0].has_content,false);
 pass('video-write-first-fresh-read');
 const snapshot=await client.from('video_metrics_snapshots').select('id,play_count').eq('video_id',row.id).eq('snapshot_type','24h').order('captured_at',{ascending:false}).limit(1).single();
 assert.equal(snapshot.error,null);
 try {
  assert.equal((await client.from('video_metrics_snapshots').update({play_count:987654}).eq('id',snapshot.data.id)).error,null);
  const latest=await read({keyword:marker,fresh:'1'});
  assert.equal(latest.body.snapshots[0].play_count,987654);pass('snapshot-write-first-fresh-read');
 } finally { assert.equal((await client.from('video_metrics_snapshots').update({play_count:snapshot.data.play_count}).eq('id',snapshot.data.id)).error,null); }
 stage='associated-data-refresh';
 const tag=await client.from('video_tags').select('id,tag_value').eq('video_id',row.id).eq('tag_dimension','话题').single();assert.equal(tag.error,null);
 try {
  assert.equal((await client.from('video_tags').update({tag_value:'干货'}).eq('id',tag.data.id)).error,null);
  assert.equal((await read({keyword:marker,fresh:'1'})).body.videos[0].topic_tag,'干货');pass('topic-tag-first-fresh-read');
 } finally {assert.equal((await client.from('video_tags').update({tag_value:tag.data.tag_value}).eq('id',tag.data.id)).error,null);}
 const segment=await client.from('video_content_segments').insert({video_id:row.id,segment_type:'开头钩子',segment_text:'acceptance fixture',segment_order:99,estimated_start_sec:0,estimated_end_sec:1}).select('id').single();assert.equal(segment.error,null);
 try {
  assert.equal((await read({keyword:marker,fresh:'1'})).body.videos[0].has_segments,true);pass('segment-first-fresh-read');
 } finally {assert.equal((await client.from('video_content_segments').delete().eq('id',segment.data.id)).error,null);}
 stage='eligible-library-refresh';
 const sub=await client.from('sub_topics').insert({title:'acceptance fixture',hook:'fixture',created_by:row.user_id,source_video_id:row.id,library_status:'in_library'}).select('id').single();assert.equal(sub.error,null);
 try {
  // Entry requires a useful-content tag and >=30k plays; a review tag remains excluded.
  assert.equal((await client.from('video_tags').update({tag_value:'干货'}).eq('id',tag.data.id)).error,null);
  assert.equal((await read({keyword:marker,topicStatus:'in_library',fresh:'1'})).body.videos.length,1);
  assert.equal((await client.from('sub_topics').update({library_status:'removed'}).eq('id',sub.data.id)).error,null);
  assert.equal((await read({keyword:marker,topicStatus:'removed',fresh:'1'})).body.videos.length,1);pass('library-status-first-fresh-read');
 } finally {
  assert.equal((await client.from('sub_topics').delete().eq('id',sub.data.id)).error,null);
  assert.equal((await client.from('video_tags').update({tag_value:tag.data.tag_value}).eq('id',tag.data.id)).error,null);
 }
 const account=await client.from('accounts').select('name').eq('id',accountId).single();assert.equal(account.error,null);
 try {
  assert.equal((await client.from('accounts').update({name:marker}).eq('id',accountId)).error,null);
  const result=await read({keyword:marker,fresh:'1'});
  assert.equal(result.body.videos[0].accounts.name,marker);assert.equal(result.body.accountOptions.find(v=>v.id===accountId).name,marker);pass('account-name-first-fresh-read');
 } finally {assert.equal((await client.from('accounts').update({name:account.data.name}).eq('id',accountId)).error,null);}
 const profile=await client.from('profiles').select('name').eq('id',row.user_id).single();assert.equal(profile.error,null);
 try {
  assert.equal((await client.from('profiles').update({name:marker}).eq('id',row.user_id)).error,null);
  const result=await read({keyword:marker,fresh:'1'});
  assert.equal(result.body.videos[0].profiles.name,marker);assert.equal(result.body.profiles.find(v=>v.id===row.user_id).name,marker);pass('profile-name-first-fresh-read');
 } finally {assert.equal((await client.from('profiles').update({name:profile.data.name}).eq('id',row.user_id)).error,null);}
 await restoreVideo();
 stage='application-lifecycle-write';
 for (const action of ['trash','restore']) {
  const response=await context.request.patch(new URL(`/api/admin/videos/${row.id}/lifecycle`,base).href,{data:{action}});
  assert.equal(response.status(),200);
  // This is the same fresh-read contract used by the page after its successful mutation.
  const result=await read({fresh:'1'});
  assert.equal(result.body.summary.totalVideos,action==='trash'?568:569);
  pass(`application-${action}-then-refresh`);
 }
 await restoreVideo();
 const restored=await read({fresh:'1'});assert.equal(restored.body.summary.totalVideos,569);assert.equal(restored.body.videos[0].video_title,original.data.video_title);
 pass('fixture-restored');restoreVideo=null;
} catch {failed=stage;process.exitCode=1;}
finally {
 if(restoreVideo)try{await restoreVideo();}catch{failed='fixture-restore';process.exitCode=1;}
 await browser.close();await mkdir('output',{recursive:true});
 const report={at:new Date().toISOString(),environment:'local-production-disposable-clone',failed,checks,notCovered:['company_owner/leader/member/cross-team real sessions unavailable','cross-instance cache (not added)','all dependency write entrypoints and production behavior']};
 await writeFile('output/content-open-acceptance.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}
