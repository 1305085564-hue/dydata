#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createCloudBaseReadOnlyExecutor, parseSingleJsonResult } from './db-backup-core.mjs';

// 只提取精确签名作为目录查询的数据。迁移原文绝不传给数据库。
function readSignatures(path, expected) {
  const migration = readFileSync(new URL(path, import.meta.url), 'utf8');
  const signatures = [...migration.matchAll(/^drop function if exists (public\.\w+\([a-z, [\]]*\));$/gmi)]
    .map((match) => match[1]);
  if (new Set(signatures).size !== expected) throw new Error('签名清单与迁移不符');
  return signatures;
}

const groups = readSignatures('../../supabase/migrations/20261016090000_remove_group_mode.sql', 16);
const legacy = readSignatures('../../supabase/deferred-migrations/20261128110000_drop_zero_ref_legacy_functions.sql', 13);
const settlementFields = ['settlement_excluded', 'settlement_excluded_reason', 'settlement_excluded_at', 'settlement_excluded_by'];
const sqlValues = (list) => list.map((item) => "('" + item.replaceAll("'", "''") + "')").join(', ');

const columns = `
  with expected(name) as (values ${sqlValues(settlementFields)})
  select t.name as relation, e.name as field, format_type(a.atttypid,a.atttypmod) as type,
    a.attnotnull as required, pg_get_expr(d.adbin,d.adrelid) as default_value
  from (values ('videos'),('daily_reports')) t(name) cross join expected e
  left join pg_attribute a on a.attrelid = to_regclass('public.'||t.name)
    and a.attname = e.name and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  order by t.name,e.name`;

const ownership = `
  select count(*) as post_reviews,
    count(*) filter (where v.id is null or r.id is null or a.user_id is null or a.account_id is null
      or (v.user_id,v.account_id) is distinct from (a.user_id,a.account_id)
      or (r.user_id,r.account_id,r.video_id) is distinct from (a.user_id,a.account_id,a.video_id)) as invalid
  from public.fulfillment_appeals a
  left join public.videos v on v.id=a.video_id
  left join public.daily_reports r on r.id=a.daily_report_id
  where a.review_mode='post_submit'`;

// pg_depend 精确识别签名和列；字符串形式的 SQL / PL/pgSQL 正文需补扫。
// 同名重载会产生正文候选，不能把名字命中换算成精确依赖。
const dependencies = `
  with funcs(batch,signature) as (
    select '集团',s from (values ${sqlValues(groups)}) f(s)
    union all select 'C8',s from (values ${sqlValues(legacy)}) f(s)
  ), tables(name,rel) as (
    select name,to_regclass('public.'||name) from (values ('group_permission_qualifications'),('group_mode_sessions')) t(name)
  ), targets(batch,label,cls,obj,sub,token) as (
    select batch,signature,'pg_proc'::regclass,to_regprocedure(signature)::oid,0,
      split_part(split_part(signature,'(',1),'.',2) from funcs
    union all select '集团',name,'pg_class'::regclass,rel,0,name from tables
    union all select '集团',name||'.'||a.attname,'pg_class'::regclass,rel,a.attnum,null
      from tables join pg_attribute a on a.attrelid=rel and a.attnum>0 and not a.attisdropped
    union all select '集团','profiles.data_scope','pg_class'::regclass,to_regclass('public.profiles'),
      (select attnum from pg_attribute where attrelid=to_regclass('public.profiles') and attname='data_scope' and not attisdropped),'data_scope'
    union all select '集团','profiles_data_scope_check','pg_constraint'::regclass,
      (select oid from pg_constraint where conrelid=to_regclass('public.profiles') and conname='profiles_data_scope_check'),0,null
  )
  select batch, label, obj is not null and sub is not null as present,
    cardinality(exact_hits) as catalog_count, array_to_string(exact_hits, E'\n') as catalog_objects,
    cardinality(body_hits) as body_candidates, array_to_string(body_hits, E'\n') as review_bodies
  from targets t
  cross join lateral (select array(
    select distinct pg_describe_object(d.classid,d.objid,d.objsubid)
    from pg_depend d where d.refclassid=t.cls and d.refobjid=t.obj and d.refobjsubid=t.sub
    order by 1) as exact_hits) d
  cross join lateral (select array(
    select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname !~ '^pg_' and n.nspname<>'information_schema' and p.prokind in ('f','p')
      and not (t.cls='pg_proc'::regclass and p.oid is not distinct from t.obj)
      and p.prosrc ~* ('\\m'||t.token||'\\M') order by 1) as body_hits) b
  order by batch,label`;

// CASCADE 的间接影响：表的复合类型、数组、视图的 _RETURN 规则及下游视图。
// 内部对象需要连回其拥有者（例如 _RETURN -> 视图），UNION 以对象地址去重。
const groupCascade = `
  with recursive affected(root,cls,obj,sub) as (
    select c.relname,'pg_class'::regclass::oid,c.oid,0 from pg_class c
    where c.oid in (to_regclass('public.group_mode_sessions'),to_regclass('public.group_permission_qualifications'))
    union
    select a.root,edge.cls,edge.obj,edge.sub from affected a
    cross join lateral (
      select d.classid,d.objid,d.objsubid from pg_depend d
      where d.refclassid=a.cls and d.refobjid=a.obj and (a.sub=0 or d.refobjsubid=a.sub)
      union all
      select d.refclassid,d.refobjid,d.refobjsubid from pg_depend d
      where d.classid=a.cls and d.objid=a.obj and d.objsubid=a.sub and d.deptype='i'
    ) edge(cls,obj,sub)
  )
  select root, cls::regclass::text as catalog,pg_describe_object(cls,obj,sub) as affected_object
  from affected order by 1,2,3`;

const context = `
  select current_setting('transaction_read_only') as read_only,
    (select pg_get_function_result(to_regprocedure('auth.uid()'))) as uid_type,
    exists (select 1 from pg_policy policy join pg_depend dep
      on dep.classid='pg_policy'::regclass and dep.objid=policy.oid
      where policy.polrelid=to_regclass('public.exemption_request_date')
        and policy.polname='成员或管理员读取申请日期明细'
        and dep.refclassid='pg_proc'::regclass
        and dep.refobjid=to_regprocedure('public.exemption_target_in_active_scope(uuid,uuid)')) as date_policy_uses_two_args,
    exists (select 1 from pg_extension where extname='btree_gist') as btree_gist,
    (select count(*) from pg_constraint where conrelid=to_regclass('public.exemption_request') and contype='x') as exclusion_constraints,
    not exists (select 1 from (values
      ('fulfillment_appeals','review_mode'),('fulfillment_appeals','video_id'),('fulfillment_appeals','daily_report_id'),
      ('fulfillment_appeals','user_id'),('fulfillment_appeals','account_id'),('videos','id'),('videos','user_id'),
      ('videos','account_id'),('daily_reports','id'),('daily_reports','video_id'),('daily_reports','user_id'),('daily_reports','account_id')
    ) f(tab,col) where not exists (select 1 from pg_attribute where attrelid=to_regclass('public.'||tab)
      and attname=col and attnum>0 and not attisdropped)) as has_review_schema,
    exists (select 1 from pg_class where oid in (to_regclass('public.fulfillment_appeals'),
      to_regclass('public.videos'),to_regclass('public.daily_reports')) and row_security_active(oid)) as limited_visibility`;

async function main() {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length && args[0] !== '--local')) throw new Error('参数错误');
  const local = args[0] === '--local';
  console.log(local ? '本机 dydata_replay 只读预检' : 'CloudBase 只读预检');
  const cloud = local ? null : await createCloudBaseReadOnlyExecutor();
  async function report(title, query, details = []) {
    console.log(title);
    const select = `select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)::text from (${query}) r;`;
    const rows = local
      ? JSON.parse(execFileSync('psql', ['-XqAtw', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1',
          '-p', '54322', '-U', 'postgres', '-d', 'dydata_replay'], {
          input: 'BEGIN READ ONLY;\n' + select + '\nCOMMIT;', encoding: 'utf8',
          env: { ...process.env, PGPASSWORD: 'postgres' }, stdio: ['pipe','pipe','pipe'],
        }))
      : parseSingleJsonResult(await cloud.executeReadOnly(select));
    console.table(rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !details.includes(key)))));
    for (const row of rows) {
      for (const key of details) {
        if (row[key]) console.log(row.label, key, row[key]);
      }
    }
    return rows;
  }
  const [ctx] = await report('身份类型、读取范围、保留对象', context);
  if (ctx.read_only !== 'on') throw new Error('事务只读状态异常');
  const fields = await report('结算列（缺失显示 null）', columns);
  if (!['text','uuid'].includes(ctx.uid_type) || fields.some(row => !row.type)) {
    console.log('⚠️ BLOCKED 身份类型或结算列前置条件未满足。');
    process.exitCode = 2;
  }
  if (ctx.has_review_schema && !ctx.limited_visibility) {
    const [counts] = await report('事后单归属', ownership);
    if (Number(counts.invalid)) process.exitCode = 2;
  } else {
    console.log('⚠️ BLOCKED 事后单归属不可判定：前置列缺失或当前角色受行级过滤。');
    process.exitCode = 2;
  }
  await report('集团迁移与 C8 直接依赖（含视图规则、策略和函数）及正文候选', dependencies, ['catalog_objects','review_bodies']);
  await report('两张旧集团表的级联影响（含行类型、数组与下游视图）', groupCascade);
}

main().catch(() => {
  // SDK 错误可能回显请求，输出阶段名即可定位，绝不转储凭据或底层异常。
  console.error('预检中止。请核对上方阶段、参数、连接权限与迁移文件。');
  process.exitCode = 1;
});
