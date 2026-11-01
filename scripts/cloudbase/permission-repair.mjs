import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { splitPostgresDump } from './sql-batches.mjs';

export const TARGET_ENV = 'dydata-d6g0gd1v37fcddf21';
export const TARGET_DATABASE = 'postgres-nj1t015u';
export const TARGET_VERSION = '17.11';
const ACTIVE = 'cloudbase_current_actor_active_v2';
const REQUIRE = 'cloudbase_require_active_actor_v2';
const OLD = new Set(['review_exemption_request_atomically', 'review_exemption_request_atomically_v2', 're_review_exemption_request_atomically']);
const q = s => `'${String(s).replaceAll("'", "''")}'`;
const ident = s => `"${String(s).replaceAll('"', '""')}"`;
const md5 = s => createHash('md5').update(s).digest('hex');
const sig = f => `${f.schema}.${f.name}${f.signature.slice(f.signature.indexOf('('))}`;

function definition(f, source, language = f.language) {
  const delimiter = /\$[a-zA-Z_0-9]*\$/.exec(f.def)?.[0];
  if (!delimiter || !f.def.includes(`${delimiter}${f.source}${delimiter}`)) throw new Error(`Unrecognized function definition: ${f.signature}`);
  return f.def.replace(`LANGUAGE ${f.language}`, `LANGUAGE ${language}`)
    .replace(`${delimiter}${f.source}${delimiter}`, `${delimiter}${source}${delimiter}`) + ';';
}

function guardedSource(f, source) {
  const check = `\n  PERFORM public.${REQUIRE}();\n`;
  if (f.language === 'plpgsql') {
    // All current PL/pgSQL definitions have a standalone outer BEGIN. Do not rewrite nested statements.
    const begin = /^begin\s*$/im.exec(source);
    if (!begin) throw new Error(`No standalone outer BEGIN: ${f.signature}`);
    return { source: source.slice(0, begin.index + 5) + check + source.slice(begin.index + 5), language: f.language };
  }
  if (f.language !== 'sql') throw new Error(`Unsupported function language: ${f.signature}`);
  const statements = splitPostgresDump(source.trimEnd().endsWith(';') ? source : `${source}\n;`);
  if (statements.length !== 1 || !/^\s*select\b/i.test(statements[0])) throw new Error(`SQL function is not a single SELECT: ${f.signature}`);
  const query = statements[0].trim().replace(/;$/, '');
  return { language: 'plpgsql', source: `\n#variable_conflict use_column\nBEGIN${check}${f.retset ? `  RETURN QUERY ${query};` : `  RETURN (${query});`}\nEND;\n` };
}

function sourceState(f, source, language = f.language) {
  const array = value => value === null ? 'NULL' : `ARRAY[${value.map(q).join(',')}]::text[]`;
  const acl = f.acl === null ? 'p.proacl IS NULL' : `ARRAY(SELECT a FROM unnest(p.proacl::text[]) a ORDER BY a) IS NOT DISTINCT FROM ${array([...f.acl].sort())}`;
  return `(SELECT pg_catalog.md5(p.prosrc) = ${q(md5(source))} AND l.lanname=${q(language)} AND p.prosecdef IS TRUE AND pg_get_userbyid(p.proowner)=${q(f.owner)} AND p.proconfig IS NOT DISTINCT FROM ${array(f.config)} AND ${acl} FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE p.oid = pg_catalog.to_regprocedure(${q(sig(f))}))`;
}

function frame(label, actions, expected, done) {
  return `-- ${label}; isolated environment ${TARGET_ENV}\nDO $cb_permission_v2$\nBEGIN
  IF current_database() <> ${q(TARGET_DATABASE)} OR current_setting('server_version') <> ${q(TARGET_VERSION)} THEN RAISE EXCEPTION 'Wrong isolated database/version'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('dydata-permission-v2'));
  IF coalesce((${done}), false) THEN RETURN; END IF;
  IF NOT coalesce((${expected}), false) THEN RAISE EXCEPTION ${q(`Permission repair baseline drift: ${label}`)}; END IF;
${actions.map(sql => typeof sql === 'string' ? `  EXECUTE ${q(sql)};` : `  ${sql.raw}`).join('\n')}
END\n$cb_permission_v2$;`;
}

function functionBatch(f, next) {
  return { id: `R01-${f.schema}-${f.name}-${f.oid}`, object: sig(f),
    apply: frame(sig(f), [definition(f, next.source, next.language)], sourceState(f, f.source), sourceState(f, next.source, next.language)),
    rollback: frame(`rollback ${sig(f)}`, [definition(f, f.source)], sourceState(f, next.source, next.language), sourceState(f, f.source)),
  };
}

function newFunction(name, result, source, owner, { language = 'plpgsql', security = 'DEFINER', stable = false, grants = ['authenticated', 'service_role'] } = {}) {
  const signature = `public.${name}()`;
  const def = `CREATE FUNCTION ${signature} RETURNS ${result} LANGUAGE ${language} ${stable ? 'STABLE' : 'VOLATILE'} SECURITY ${security} SET search_path = '' AS $f$${source}$f$;`;
  const exists = `pg_catalog.to_regprocedure(${q(signature)}) IS NOT NULL`;
  const roleChecks = ['authenticated', 'service_role', 'anon'].map(role => `pg_catalog.has_function_privilege(${q(role)},p.oid,'EXECUTE') IS ${grants.includes(role) ? 'TRUE' : 'FALSE'}`).join(' AND ');
  const same = `(SELECT p.prosrc=${q(source)} AND p.prosecdef IS ${security === 'DEFINER' ? 'TRUE' : 'FALSE'} AND l.lanname=${q(language)} AND pg_get_userbyid(p.proowner)=${q(owner)} AND p.proconfig=ARRAY['search_path=""']::text[] AND ${roleChecks} AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(p.proacl) a WHERE a.grantee=0) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang WHERE p.oid=pg_catalog.to_regprocedure(${q(signature)}))`;
  return { id: `helper-${name}`, object: signature,
    apply: frame(signature, [def, `REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated, service_role;`, ...(grants.length ? [`GRANT EXECUTE ON FUNCTION ${signature} TO ${grants.map(ident).join(', ')};`] : [])], `NOT (${exists}) AND current_user = ${q(owner)}`, same),
    rollback: frame(`rollback ${signature}`, [`DROP FUNCTION ${signature};`], same, `NOT (${exists})`),
  };
}

const commandName = { '*': 'ALL', r: 'SELECT', a: 'INSERT', w: 'UPDATE', d: 'DELETE' };
function policyCreate(table, p) {
  return `CREATE POLICY ${ident(p.name)} ON public.${ident(table)} AS ${p.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'} FOR ${commandName[p.command]} TO ${p.roles.map(r => r === 'public' ? 'PUBLIC' : ident(r)).join(', ')}${p.using ? ` USING (${p.using})` : ''}${p.check ? ` WITH CHECK (${p.check})` : ''};`;
}
function policyState(table, policies) {
  // Compare named rows as JSONB; JSON array order is explicitly sorted in both directions.
  const expected = [...policies].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    .map(p => ({ name: p.name, using: p.using, check: p.check, permissive: p.permissive, command: p.command, roles: [...p.roles].sort() }));
  return `(SELECT coalesce(jsonb_agg(jsonb_build_object('name',polname,'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid),'permissive',polpermissive,'command',polcmd,'roles',(SELECT jsonb_agg(CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r) END ORDER BY CASE WHEN r=0 THEN 'public' ELSE pg_get_userbyid(r) END) FROM unnest(polroles) r)) ORDER BY polname COLLATE "C"),'[]'::jsonb) FROM pg_catalog.pg_policy WHERE polrelid=${q(`public.${table}`)}::regclass AND polname=ANY(ARRAY[${policies.map(p => q(p.name)).join(',')}])) = ${q(JSON.stringify(expected))}::jsonb`;
}
function policyExists(table, name) {
  return `EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid=${q(`public.${table}`)}::regclass AND polname=${q(name)})`;
}
function policyFingerprint() {
  return `pg_catalog.md5(pg_catalog.concat_ws('|',polname,polcmd,polpermissive::text,polroles::text,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)))`;
}
function policyApplied(table, policy) {
  const tag = `dydata-permission-v2:${md5(policyCreate(table, policy))}:`;
  return `EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polrelid=${q(`public.${table}`)}::regclass AND polname=${q(policy.name)} AND pg_catalog.obj_description(oid,'pg_policy')=${q(tag)} || ${policyFingerprint()})`;
}
function policyMark(table, policy) {
  const tag = `dydata-permission-v2:${md5(policyCreate(table, policy))}:`;
  return { raw: `EXECUTE pg_catalog.format(${q(`COMMENT ON POLICY ${ident(policy.name)} ON public.${ident(table)} IS %L`)}, (SELECT ${q(tag)} || ${policyFingerprint()} FROM pg_catalog.pg_policy WHERE polrelid=${q(`public.${table}`)}::regclass AND polname=${q(policy.name)}));` };
}
function policyBatch(table, oldPolicies, nextPolicies) {
  const remove = ps => ps.map(p => `DROP POLICY ${ident(p.name)} ON public.${ident(table)};`);
  const absent = nextPolicies.map(p => `NOT (${policyExists(table, p.name)})`).join(' AND ');
  const applied = nextPolicies.map(p => policyApplied(table, p)).join(' AND ');
  const original = oldPolicies.length ? `${policyState(table, oldPolicies)} AND ${absent}` : absent;
  return { id: `policy-${table}-${nextPolicies[0].name}`, object: `public.${table}`,
    apply: frame(`policy ${table}`, [...remove(oldPolicies), ...nextPolicies.flatMap(p => [policyCreate(table, p), policyMark(table, p)])], original, applied),
    rollback: frame(`rollback policy ${table}`, [...remove(nextPolicies), ...oldPolicies.map(p => policyCreate(table, p))], applied, original),
  };
}

function appealSource(f) {
  let source = f.source;
  const old = `  if not public.is_admin_or_owner() then\n    raise exception 'permission denied';\n  end if;`;
  if (!source.includes(old)) throw new Error(`Appeal baseline mismatch: ${f.signature}`);
  const actor = `  resolved_handler_id := CASE WHEN auth.role()='service_role' THEN p_handler_id ELSE (auth.uid())::uuid END;
  IF resolved_handler_id IS NULL OR (auth.role()='authenticated' AND p_handler_id IS NOT NULL AND p_handler_id IS DISTINCT FROM resolved_handler_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='permission denied';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles actor JOIN auth.users au ON au.sub=actor.id::text WHERE actor.id=resolved_handler_id AND actor.membership_status='active' AND au.status=1 AND coalesce(actor.company_role,CASE WHEN actor.role='owner' THEN 'company_owner' ELSE actor.role END) IN ('admin','company_owner')) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='permission denied';
  END IF;`;
  source = source.replace(old, actor);
  if (f.name === 'handle_fulfillment_appeal') {
    const resolve = `  resolved_handler_id := coalesce(\n    p_handler_id,\n    (auth.uid())::uuid\n  );\n`;
    if (!source.includes(resolve)) throw new Error('Handler resolution baseline changed');
    source = source.replace(resolve, '').replace("if p_decision not in ('approve', 'reject')", "if p_decision is null or p_decision not in ('approve', 'reject')");
  }
  const lock = '  for update;';
  if (source.split(lock).length !== 2) throw new Error('Appeal lock baseline changed');
  return source.replace(lock, `${lock}
  IF NOT FOUND OR appeal_record.user_id=resolved_handler_id OR NOT EXISTS (SELECT 1 FROM public.active_visible_user_ids(resolved_handler_id) scope WHERE scope.user_id=appeal_record.user_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='permission denied';
  END IF;`);
}

function triggerBatch(table, name, event, fn) {
  const exists = `EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=${q(`public.${table}`)}::regclass AND tgname=${q(name)} AND NOT tgisinternal)`;
  const ddl = `CREATE TRIGGER ${ident(name)} BEFORE ${event} ON public.${ident(table)} FOR EACH ROW EXECUTE FUNCTION public.${fn}();`;
  const tag = `dydata-permission-v2:${md5(ddl)}:`;
  const fingerprint = `pg_catalog.md5(pg_catalog.pg_get_triggerdef(oid)||tgenabled::text)`;
  const applied = `EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=${q(`public.${table}`)}::regclass AND tgname=${q(name)} AND NOT tgisinternal AND pg_catalog.obj_description(oid,'pg_trigger')=${q(tag)} || ${fingerprint})`;
  const mark = { raw: `EXECUTE pg_catalog.format(${q(`COMMENT ON TRIGGER ${ident(name)} ON public.${ident(table)} IS %L`)}, (SELECT ${q(tag)} || ${fingerprint} FROM pg_catalog.pg_trigger WHERE tgrelid=${q(`public.${table}`)}::regclass AND tgname=${q(name)}));` };
  return { id: `trigger-${table}`, object: `public.${table}.${name}`,
    apply: frame(name, [ddl, mark], `NOT (${exists})`, applied),
    rollback: frame(`rollback ${name}`, [`DROP TRIGGER ${ident(name)} ON public.${ident(table)};`], applied, `NOT (${exists})`),
  };
}

function legacyAclBatch(f) {
  if (!Array.isArray(f.acl)) throw new Error('Legacy RPC requires explicit baseline ACL');
  const signature = sig(f);
  const restore = [`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated;`];
  for (const item of f.acl) {
    const match = /^([^=]*)=([^/]*)\/(.+)$/.exec(item);
    if (!match) throw new Error('Unknown function ACL');
    const role = match[1] || 'PUBLIC';
    if (['PUBLIC', 'anon', 'authenticated'].includes(role) && match[3] !== f.owner) throw new Error('Cannot exactly restore a non-owner function grantor');
    if (['PUBLIC', 'anon', 'authenticated'].includes(role) && match[2].includes('X')) restore.push(`GRANT EXECUTE ON FUNCTION ${signature} TO ${role === 'PUBLIC' ? 'PUBLIC' : ident(role)}${match[2].includes('X*') ? ' WITH GRANT OPTION' : ''};`);
  }
  const aclState = acl => `(SELECT ARRAY(SELECT a FROM unnest(proacl::text[]) a ORDER BY a) IS NOT DISTINCT FROM ARRAY[${[...acl].sort().map(q).join(',')}]::text[] AND pg_get_userbyid(proowner)=${q(f.owner)} FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure(${q(signature)}))`;
  const revokedAcl = f.acl.filter(item => !['', 'anon', 'authenticated'].includes(item.slice(0, item.indexOf('='))));
  const original = aclState(f.acl);
  const revoked = `${aclState(revokedAcl)} AND NOT has_function_privilege('authenticated',${q(signature)},'EXECUTE') AND NOT has_function_privilege('anon',${q(signature)},'EXECUTE')`;
  return { id: `R12-${f.name}`, object: signature,
    apply: frame(`R12 ${signature}`, [`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated;`], original, revoked),
    rollback: frame(`rollback R12 ${signature}`, restore, revoked, original),
  };
}

export function generatePermissionRepair(snapshot, { envId = TARGET_ENV, allowLegacyRpcRevoke = false } = {}) {
  if (envId !== TARGET_ENV || snapshot.envId !== TARGET_ENV || snapshot.database !== TARGET_DATABASE || snapshot.version !== TARGET_VERSION) throw new Error('Wrong isolated environment/database/version');
  const tables = snapshot.tables.filter(t => t.read);
  if (tables.length !== 89 || !tables.every(t => t.rls)) throw new Error('Expected 89 readable RLS tables');
  const functions = snapshot.functions.filter(f => f.secdef && f.authenticated);
  if (functions.length !== 42 || !functions.every(f => f.ownerBypass)) throw new Error('SECURITY DEFINER inventory/owner changed');
  const owner = snapshot.tables.find(t => t.name === 'profiles')?.owner;
  if (!owner || !functions.every(f => f.owner === owner)) throw new Error('Unexpected function owner');
  if (snapshot.functions.some(f => [ACTIVE, REQUIRE, 'cloudbase_session_status', 'cloudbase_guard_video_write_v2', 'cloudbase_guard_appeal_write_v2'].includes(f.name))) throw new Error('Repair helper name collision');
  const batches = [];
  batches.push(newFunction('cloudbase_session_status', 'text', `\n SELECT coalesce((SELECT CASE
 WHEN p.membership_status='archived' THEN 'archived'
 WHEN u.status=2 THEN 'pending'
 WHEN u.status<>1 THEN 'blocked'
 WHEN p.membership_status='active' AND u.status=1 THEN 'active'
 ELSE 'blocked' END
 FROM public.profiles p JOIN auth.users u ON u.sub=p.id::text
 WHERE p.id=(auth.uid())::uuid), 'missing');\n`, owner, { language: 'sql', stable: true, grants: ['authenticated'] }));
  batches.push(newFunction(ACTIVE, 'boolean', `\n SELECT public.cloudbase_session_status()='active';\n`, owner, { language: 'sql', stable: true }));
  batches.push(newFunction(REQUIRE, 'void', `\nBEGIN
 IF auth.role()='service_role' OR (auth.role() IS NULL AND session_user=${q(owner)}) THEN RETURN; END IF;
 IF auth.role() IS DISTINCT FROM 'authenticated' OR public.${ACTIVE}() IS NOT TRUE THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='account inactive'; END IF;
END;\n`, owner, { stable: true }));
  for (const f of functions) {
    const original = ['handle_fulfillment_appeal', 'reopen_fulfillment_appeal_atomically'].includes(f.name) ? appealSource(f) : f.source;
    batches.push(functionBatch(f, guardedSource(f, original)));
  }
  for (const table of tables) {
    if (table.policies?.some(p => p.name === 'cb_permission_v2_active')) throw new Error('State policy name collision');
    batches.push(policyBatch(table.name, [], [{ name: 'cb_permission_v2_active', command: '*', roles: ['authenticated'], permissive: false, using: `(SELECT public.${ACTIVE}())`, check: `(SELECT public.${ACTIVE}())` }]));
  }
  for (const tableName of ['fulfillment_appeals', 'content_observations', 'sample_quality_issues']) {
    const table = snapshot.tables.find(t => t.name === tableName);
    const admin = tableName === 'fulfillment_appeals' ? 'public.is_admin_or_owner()' : 'public.is_admin()';
    const scopeExpression = mode => {
      const scope = `public.${mode === 'read' ? 'visible_user_ids' : 'active_visible_user_ids'}((auth.uid())::uuid)`;
      if (tableName === 'fulfillment_appeals') return `user_id IN (SELECT user_id FROM ${scope})`;
      const video = `EXISTS (SELECT 1 FROM public.videos v JOIN public.accounts a ON a.id=v.account_id AND a.profile_id=v.user_id WHERE v.id=${tableName}.video_id AND a.profile_id IN (SELECT user_id FROM ${scope}))`;
      if (tableName === 'content_observations') return video;
      const report = `EXISTS (SELECT 1 FROM public.daily_reports r JOIN public.accounts a ON a.id=r.account_id AND a.profile_id=r.user_id WHERE r.id=sample_quality_issues.report_id AND a.profile_id IN (SELECT user_id FROM ${scope}))`;
      return `((sample_quality_issues.video_id IS NOT NULL AND ${video}) OR (sample_quality_issues.video_id IS NULL AND ${report})) AND (sample_quality_issues.report_id IS NULL OR ${report})`;
    };
    const oldPolicies = table.policies.filter(p => p.roles.includes('public') || p.name.startsWith('Admins '));
    if (!oldPolicies.length) throw new Error(`Missing broad policy baseline: ${tableName}`);
    const next = ['r', 'a', 'w', 'd'].filter(c => oldPolicies.some(p => p.command === '*' || p.command === c)).map(command => ({
      name: `cb_permission_v2_scope_${command}`, command, roles: ['authenticated'], permissive: true,
      using: ['r', 'w', 'd'].includes(command) ? `(${admin}) AND (${scopeExpression(command === 'r' ? 'read' : 'write')})` : null,
      check: ['a', 'w'].includes(command) ? `(${admin}) AND (${scopeExpression('write')})` : null,
    }));
    batches.push(policyBatch(tableName, oldPolicies, next));
  }
  const videoSource = `\nDECLARE
 actor uuid := (auth.uid())::uuid;
 review_changed boolean;
 topic_changed boolean;
BEGIN
 -- Service routes already derive their actor and scope before using the service key.
 IF auth.role()='service_role' OR (auth.role() IS NULL AND session_user=${q(owner)}) THEN RETURN NEW; END IF;
 PERFORM public.${REQUIRE}();
 IF TG_OP='INSERT' THEN
  review_changed := NEW.review_status IS DISTINCT FROM 'pending' OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL;
  topic_changed := true;
 ELSE
  review_changed := ROW(NEW.review_status,NEW.reviewed_by,NEW.reviewed_at) IS DISTINCT FROM ROW(OLD.review_status,OLD.reviewed_by,OLD.reviewed_at);
  topic_changed := ROW(NEW.topic_id,NEW.user_id,NEW.account_id) IS DISTINCT FROM ROW(OLD.topic_id,OLD.user_id,OLD.account_id);
 END IF;
 IF review_changed THEN
  IF public.is_admin_or_owner() IS NOT TRUE OR NOT EXISTS(SELECT 1 FROM public.active_visible_user_ids(actor) s WHERE s.user_id=NEW.user_id) OR NOT EXISTS(SELECT 1 FROM public.accounts a WHERE a.id=NEW.account_id AND a.profile_id=NEW.user_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='review denied'; END IF;
  IF NEW.review_status='reviewed' THEN NEW.reviewed_by:=actor; IF NEW.reviewed_at IS NULL THEN NEW.reviewed_at:=now(); END IF;
  ELSIF NEW.review_status='pending' THEN NEW.reviewed_by:=NULL; NEW.reviewed_at:=NULL;
  ELSE RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid review status'; END IF;
 END IF;
 IF topic_changed THEN
  IF NOT EXISTS(SELECT 1 FROM public.accounts a WHERE a.id=NEW.account_id AND a.profile_id=NEW.user_id) OR NOT EXISTS(SELECT 1 FROM public.active_visible_user_ids(actor) s WHERE s.user_id=NEW.user_id) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='video owner denied'; END IF;
  IF NEW.topic_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sub_topics st WHERE st.id=NEW.topic_id AND st.library_status='in_library' AND private.can_read_team_topic(st.id)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='topic association denied'; END IF;
 END IF;
 RETURN NEW;
END;\n`;
  batches.push(newFunction('cloudbase_guard_video_write_v2', 'trigger', videoSource, owner, { security: 'INVOKER', grants: [] }));
  batches.push(triggerBatch('videos', 'cb_permission_v2_video_write', 'INSERT OR UPDATE', 'cloudbase_guard_video_write_v2'));
  const appealGuard = `\nBEGIN
 -- SECURITY INVOKER preserves the actual SQL role; clients cannot become a definer owner.
 IF current_user=${q(owner)} OR auth.role()='service_role' THEN IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END IF;
 PERFORM public.${REQUIRE}();
 IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='appeal changes require audited RPC'; END IF;
 IF NEW.user_id IS DISTINCT FROM (auth.uid())::uuid OR NEW.status IS DISTINCT FROM 'pending' OR NEW.handler_id IS NOT NULL OR NEW.handled_at IS NOT NULL OR NEW.decision_reason IS NOT NULL OR (NEW.account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.accounts a WHERE a.id=NEW.account_id AND a.profile_id=NEW.user_id)) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='appeal submission denied'; END IF;
 RETURN NEW;
END;\n`;
  batches.push(newFunction('cloudbase_guard_appeal_write_v2', 'trigger', appealGuard, owner, { security: 'INVOKER', grants: [] }));
  batches.push(triggerBatch('fulfillment_appeals', 'cb_permission_v2_appeal_write', 'INSERT OR UPDATE OR DELETE', 'cloudbase_guard_appeal_write_v2'));
  if (allowLegacyRpcRevoke) {
    const oldFunctions = snapshot.functions.filter(f => OLD.has(f.name));
    if (oldFunctions.length !== 3) throw new Error('Legacy RPC overload inventory changed');
    for (const f of oldFunctions) batches.push(legacyAclBatch(f));
  }
  return { version: 'permission-v2', envId: TARGET_ENV, sourceRequestId: snapshot.requestId, batches, rollbackOrder: batches.map(b => b.id).reverse(), blocked: allowLegacyRpcRevoke ? [] : ['R12 requires current repository call-site confirmation (--confirm-no-legacy-callers)'] };
}

function viewSignature(view) { return `${ident(view.schema)}.${ident(view.name)}`; }
function viewMetadata(view, acl = view.acl, options = view.options) {
  if (!Array.isArray(acl)) throw new Error(`View requires explicit ACL snapshot: ${view.name}`);
  const expectedColumns = view.columns.map(c => ({ name: c.name, type: c.type, attacl: c.attacl }));
  const optionState = options === null ? 'c.reloptions IS NULL' : `c.reloptions=ARRAY[${options.map(q).join(',')}]::text[]`;
  return `c.oid=${q(view.oid)}::oid AND c.relkind='v' AND pg_get_userbyid(c.relowner)=${q(view.owner)} AND ARRAY(SELECT a FROM unnest(c.relacl::text[]) a ORDER BY a)=ARRAY[${[...acl].sort().map(q).join(',')}]::text[] AND ${optionState} AND (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'attacl',a.attacl) ORDER BY a.attnum) FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)=${q(JSON.stringify(expectedColumns))}::jsonb`;
}
function viewOriginalState(view, acl = view.acl) {
  return `(SELECT ${viewMetadata(view, acl)} AND pg_get_viewdef(c.oid)=${q(view.def)} AND obj_description(c.oid,'pg_class') IS NOT DISTINCT FROM ${view.comment === null ? 'NULL::text' : q(view.comment)} FROM pg_catalog.pg_class c WHERE c.oid=to_regclass(${q(`${view.schema}.${view.name}`)}))`;
}

/** Supplementary view group: deliberately independent of the already-applied 144 core batch hashes. */
export function generatePermissionViewRepair(rawSnapshot, { envId = TARGET_ENV, allowStatisticsViewRevoke = false } = {}) {
  const snapshot = rawSnapshot.data ? { ...rawSnapshot.data, envId: rawSnapshot.envId, requestId: rawSnapshot.requestId } : rawSnapshot;
  if (envId !== TARGET_ENV || snapshot.envId !== TARGET_ENV || snapshot.database !== TARGET_DATABASE || snapshot.version !== TARGET_VERSION) throw new Error('Wrong isolated view environment/database/version');
  const views = snapshot.readViews;
  if (!Array.isArray(views) || views.length !== 3 || views.some(v => v.schema !== 'public' || v.kind !== 'v' || v.options !== null)) throw new Error('View inventory/options changed');
  const business = views.find(v => v.name === 'ai_unified_config_view');
  const stats = views.filter(v => ['pg_stat_statements', 'pg_stat_statements_info'].includes(v.name));
  if (!business || stats.length !== 2 || !business.columns?.length || stats.some(v => !v.columns?.length)) throw new Error('Missing audited view metadata');
  const originalQuery = business.def.trim().replace(/;$/, '');
  const ddl = `CREATE OR REPLACE VIEW ${viewSignature(business)} WITH (security_barrier=true) AS SELECT config.* FROM (${originalQuery}) AS config WHERE auth.role()='service_role' OR (auth.role() IS NULL AND session_user=${q(business.owner)}) OR public.${ACTIVE}();`;
  const fingerprint = `md5(pg_get_viewdef(c.oid)||coalesce(c.reloptions::text,''))`;
  const tag = `dydata-permission-v2-views:${md5(ddl)}:`;
  const applied = `(SELECT ${viewMetadata(business, business.acl, ['security_barrier=true'])} AND obj_description(c.oid,'pg_class')=${q(tag)}||${fingerprint} FROM pg_catalog.pg_class c WHERE c.oid=to_regclass(${q(`${business.schema}.${business.name}`)}))`;
  const mark = { raw: `EXECUTE pg_catalog.format(${q(`COMMENT ON VIEW ${viewSignature(business)} IS %L`)}, (SELECT ${q(tag)}||${fingerprint} FROM pg_catalog.pg_class c WHERE c.oid=to_regclass(${q(`${business.schema}.${business.name}`)})));` };
  const batches = [{ id: 'R01-views-ai-state', object: 'public.ai_unified_config_view',
    apply: frame('R01 AI view state', [ddl, mark], `${viewOriginalState(business)} AND current_user=${q(business.owner)} AND to_regprocedure('public.${ACTIVE}()') IS NOT NULL`, applied),
    rollback: frame('rollback R01 AI view state', [`CREATE OR REPLACE VIEW ${viewSignature(business)} AS ${originalQuery};`, `ALTER VIEW ${viewSignature(business)} RESET (security_barrier);`, `COMMENT ON VIEW ${viewSignature(business)} IS ${business.comment === null ? 'NULL' : q(business.comment)};`], applied, viewOriginalState(business)),
  }];
  if (allowStatisticsViewRevoke) {
    const affected = new Set(['', 'anon', 'authenticated']);
    const revokedAcl = v => v.acl.filter(item => !affected.has(item.slice(0, item.indexOf('='))));
    const revoke = v => `REVOKE ALL PRIVILEGES ON TABLE ${viewSignature(v)} FROM PUBLIC, anon, authenticated;`;
    const restore = [];
    const privileges = { a: 'INSERT', r: 'SELECT', w: 'UPDATE', d: 'DELETE', D: 'TRUNCATE', x: 'REFERENCES', t: 'TRIGGER', m: 'MAINTAIN' };
    for (const view of stats) {
      restore.push(revoke(view));
      for (const item of view.acl) {
        const match = /^([^=]*)=([^/]*)\/(.+)$/.exec(item);
        if (!match) throw new Error('Unknown statistics view ACL');
        if (!affected.has(match[1])) continue;
        if (match[3] !== view.owner) throw new Error('Cannot exactly restore a non-owner view grantor');
        for (let i = 0; i < match[2].length; i += 1) {
          const privilege = privileges[match[2][i]];
          if (!privilege) throw new Error('Unknown statistics view privilege');
          const grantOption = match[2][i + 1] === '*';
          if (grantOption) i += 1;
          restore.push(`GRANT ${privilege} ON TABLE ${viewSignature(view)} TO ${match[1] === '' ? 'PUBLIC' : ident(match[1])}${grantOption ? ' WITH GRANT OPTION' : ''};`);
        }
      }
    }
    const original = stats.map(v => viewOriginalState(v)).join(' AND ');
    const revoked = stats.map(v => viewOriginalState(v, revokedAcl(v))).join(' AND ');
    batches.push({ id: 'R01-views-statistics-acl', object: 'public.pg_stat_statements + public.pg_stat_statements_info',
      apply: frame('R01 statistics view ACL', stats.map(revoke), original, revoked),
      rollback: frame('rollback R01 statistics view ACL', restore, revoked, original),
    });
  }
  return { version: 'permission-v2-views', group: 'views', envId: TARGET_ENV, sourceRequestId: snapshot.requestId, batches, rollbackOrder: batches.map(b => b.id).reverse(), blocked: allowStatisticsViewRevoke ? [] : ['Statistics view revocation requires current call-site confirmation (--confirm-no-stat-view-callers)'] };
}

export function generatePermissionRepairGroups(coreSnapshot, viewSnapshot, options = {}) {
  return { core: generatePermissionRepair(coreSnapshot, options), views: generatePermissionViewRepair(viewSnapshot, options) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const value = flag => args[args.indexOf(flag) + 1];
  if (!args.includes('--snapshot') || !args.includes('--output')) throw new Error('Usage: --snapshot private-snapshot.json --output private-directory [--confirm-no-legacy-callers]');
  const snapshot = JSON.parse(await readFile(value('--snapshot'), 'utf8'));
  const group = args.includes('--group') ? value('--group') : 'core';
  if (!['core', 'views'].includes(group)) throw new Error('Unknown repair group');
  const plan = group === 'views'
    ? generatePermissionViewRepair(snapshot, { allowStatisticsViewRevoke: args.includes('--confirm-no-stat-view-callers') })
    : generatePermissionRepair(snapshot, { allowLegacyRpcRevoke: args.includes('--confirm-no-legacy-callers') });
  await mkdir(value('--output'), { recursive: true, mode: 0o700 });
  await writeFile(`${value('--output')}/permission-repair.json`, JSON.stringify(plan, null, 2), { mode: 0o600 });
  await writeFile(`${value('--output')}/apply.sql`, plan.batches.map(b => b.apply).join('\n\n'), { mode: 0o600 });
  await writeFile(`${value('--output')}/rollback.sql`, [...plan.batches].reverse().map(b => b.rollback).join('\n\n'), { mode: 0o600 });
  console.log(JSON.stringify({ version: plan.version, envId: plan.envId, batches: plan.batches.length, blocked: plan.blocked }));
}
