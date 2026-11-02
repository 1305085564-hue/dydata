type SqlRow = Record<string, unknown>;
type SqlResult = { requestId?: unknown; rows?: unknown };
type SqlReader = (sql: string) => Promise<unknown[]>;
type SqlExecutor = (sql: string) => Promise<SqlResult>;
type EvidenceStatus = "DENIED" | "BLOCKED" | "NOT_GRANTED";
type WriteOperation = "insert" | "update" | "delete";

export interface CollectInactiveWriteEvidenceInput {
  gateway: string;
  jwt: string;
  actorId: string;
  rows: SqlReader;
  execute: SqlExecutor;
  quote: (value: string) => string;
  uuid: (value: number) => string;
}

interface TableCatalogRow extends SqlRow {
  table_name?: unknown;
  can_insert?: unknown;
  can_update?: unknown;
  can_delete?: unknown;
}

interface RpcArgument {
  name: string | null;
  type: string;
}

interface RpcCatalogRow extends SqlRow {
  schema_name?: unknown;
  function_name?: unknown;
  signature?: unknown;
  arguments?: unknown;
}

interface ProbeResult {
  status: EvidenceStatus;
  reason: string;
  httpStatus?: number;
  denial?: "http-401" | "http-403" | "postgres-42501" | "inactive-account" | "rls-zero-rows";
  rowUnchanged?: boolean;
  requestId?: string;
}

interface TableEvidence {
  table: string;
  privileges: { insert: boolean; update: boolean; delete: boolean };
  probes: Record<WriteOperation, ProbeResult>;
}

interface RpcEvidence {
  schema: string;
  name: string;
  signature: string;
  argumentTypes: string[];
  status: EvidenceStatus;
  reason: string;
  httpStatus?: number;
  denial?: ProbeResult["denial"];
  requestId?: string;
}

export interface InactiveWriteEvidence {
  source: "old-jwt-for-blocked-synthetic-user";
  actorId: string;
  tableDirectory: {
    expected: 80;
    observed: number;
    complete: boolean;
    entries: TableEvidence[];
  };
  protectedFunctions: {
    expected: 42;
    observed: number;
    complete: boolean;
    entries: RpcEvidence[];
  };
  summary: {
    explicitTableDenials: number;
    blockedTableOperations: number;
    explicitRpcDenials: number;
    blockedRpcs: number;
    privateHelpersWithoutDirectGatewayEvidence: number;
  };
}

interface SafeRowProbe {
  table: string;
  id: string;
  field: string;
  ownerFilters: Record<string, string>;
  sqlOwnerPredicate: string;
  fixtureValue: (value: unknown) => boolean;
  replacement: unknown;
}

interface SafeInsertProbe {
  table: string;
  id: string;
  ownerColumn: string;
  payload: Record<string, unknown>;
}

const FIXED_UUID_PREFIX = "f0cba501-2026-4111-a001-";
const FIXTURE_PREFIX = "dydata-permission-v2";
const EXPECTED_TABLE_COUNT = 80 as const;
const EXPECTED_RPC_COUNT = 42 as const;
const REST_METHOD: Record<WriteOperation, "POST" | "PATCH" | "DELETE"> = {
  insert: "POST",
  update: "PATCH",
  delete: "DELETE",
};
const UPDATE_FIXTURES: SafeRowProbe[] = [
  {
    table: "profiles",
    id: "actor",
    field: "name",
    ownerFilters: {},
    sqlOwnerPredicate: "name LIKE 'dydata-permission-v2-%'",
    fixtureValue: (value) => typeof value === "string" && value.startsWith(`${FIXTURE_PREFIX}-`),
    replacement: `${FIXTURE_PREFIX}-inactive-write-probe`,
  },
  {
    table: "accounts",
    id: "201",
    field: "name",
    ownerFilters: { profile_id: "1" },
    sqlOwnerPredicate: "profile_id = {{uuid:1}} AND name LIKE 'dydata-permission-v2-%'",
    fixtureValue: (value) => typeof value === "string" && value.startsWith(`${FIXTURE_PREFIX}-`),
    replacement: `${FIXTURE_PREFIX}-inactive-write-probe`,
  },
  {
    table: "videos",
    id: "301",
    field: "video_title",
    ownerFilters: { user_id: "1" },
    sqlOwnerPredicate: "user_id = {{uuid:1}} AND video_title LIKE 'dydata-permission-v2-%'",
    fixtureValue: (value) => typeof value === "string" && value.startsWith(`${FIXTURE_PREFIX}-`),
    replacement: `${FIXTURE_PREFIX}-inactive-write-probe`,
  },
  {
    table: "sub_topics",
    id: "401",
    field: "title",
    ownerFilters: { created_by: "1" },
    sqlOwnerPredicate: "created_by = {{uuid:1}} AND title LIKE 'dydata-permission-v2-%'",
    fixtureValue: (value) => typeof value === "string" && value.startsWith(`${FIXTURE_PREFIX}-`),
    replacement: `${FIXTURE_PREFIX}-inactive-write-probe`,
  },
  {
    table: "notifications",
    id: "501",
    field: "title",
    ownerFilters: { user_id: "1" },
    sqlOwnerPredicate: "user_id = {{uuid:1}} AND title LIKE 'dydata-permission-v2%'",
    fixtureValue: (value) => typeof value === "string" && value.startsWith(FIXTURE_PREFIX),
    replacement: `${FIXTURE_PREFIX}-inactive-write-probe`,
  },
  {
    table: "fulfillment_appeals",
    id: "601",
    field: "reason",
    ownerFilters: { user_id: "1" },
    sqlOwnerPredicate: "user_id = {{uuid:1}} AND reason LIKE 'dydata-permission-v2%'",
    fixtureValue: (value) => typeof value === "string" && value.startsWith(FIXTURE_PREFIX),
    replacement: `${FIXTURE_PREFIX}-inactive-write-probe`,
  },
  {
    table: "content_observations",
    id: "701",
    field: "note",
    ownerFilters: { observer_id: "3" },
    sqlOwnerPredicate: "observer_id = {{uuid:3}} AND note LIKE 'dydata-permission-v2%'",
    fixtureValue: (value) => typeof value === "string" && value.startsWith(FIXTURE_PREFIX),
    replacement: `${FIXTURE_PREFIX}-inactive-write-probe`,
  },
  {
    table: "daily_reports",
    id: "801",
    field: "title",
    ownerFilters: { user_id: "1" },
    sqlOwnerPredicate: "user_id = {{uuid:1}} AND title LIKE 'dydata-permission-v2%'",
    fixtureValue: (value) => typeof value === "string" && value.startsWith(FIXTURE_PREFIX),
    replacement: `${FIXTURE_PREFIX}-inactive-write-probe`,
  },
  {
    table: "sample_quality_issues",
    id: "901",
    field: "severity",
    ownerFilters: { report_id: "801" },
    sqlOwnerPredicate: "report_id = {{uuid:801}} AND EXISTS (SELECT 1 FROM public.daily_reports r WHERE r.id = {{uuid:801}} AND r.user_id = {{uuid:1}} AND r.title LIKE 'dydata-permission-v2%')",
    fixtureValue: (value) => value === "warning",
    replacement: "critical",
  },
  {
    table: "exemption_request",
    id: "1001",
    field: "reason",
    ownerFilters: { applicant_user_id: "1" },
    sqlOwnerPredicate: "applicant_user_id = {{uuid:1}} AND reason LIKE 'dydata-permission-v2%'",
    fixtureValue: (value) => typeof value === "string" && value.startsWith(FIXTURE_PREFIX),
    replacement: `${FIXTURE_PREFIX}-inactive-write-probe`,
  },
  {
    table: "exemption_request_date",
    id: "1101",
    field: "request_date",
    ownerFilters: { request_id: "1001" },
    sqlOwnerPredicate: "request_id = {{uuid:1001}} AND EXISTS (SELECT 1 FROM public.exemption_request r WHERE r.id = {{uuid:1001}} AND r.applicant_user_id = {{uuid:1}} AND r.reason LIKE 'dydata-permission-v2%')",
    fixtureValue: (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value),
    replacement: "1999-01-01",
  },
];

const INSERT_FIXTURES: SafeInsertProbe[] = [
  {
    table: "notifications",
    id: "1201",
    ownerColumn: "user_id",
    payload: {
      user_id: "actor",
      type: "system",
      category: "feed",
      title: `${FIXTURE_PREFIX}-inactive-write-probe`,
      source_type: `${FIXTURE_PREFIX}-inactive-write-probe`,
    },
  },
  {
    table: "accounts",
    id: "1202",
    ownerColumn: "profile_id",
    payload: { profile_id: "actor", name: `${FIXTURE_PREFIX}-inactive-write-probe` },
  },
  {
    table: "sub_topics",
    id: "1203",
    ownerColumn: "created_by",
    payload: {
      title: `${FIXTURE_PREFIX}-inactive-write-probe`,
      hook: `${FIXTURE_PREFIX}-inactive-write-probe`,
      created_by: "actor",
    },
  },
  {
    table: "exemption_request",
    id: "1204",
    ownerColumn: "applicant_user_id",
    payload: {
      profile_id: "actor",
      applicant_user_id: "actor",
      team_id: "101",
      exemption_type: "range",
      start_date: "1999-01-01",
      end_date: "1999-01-01",
      reason: `${FIXTURE_PREFIX}-inactive-write-probe`,
    },
  },
];

const DELETE_FIXTURES: SafeRowProbe[] = [
  ...UPDATE_FIXTURES.filter((probe) =>
    ["notifications", "content_observations", "sample_quality_issues", "exemption_request_date"].includes(probe.table),
  ),
];

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isRecord(value: unknown): value is SqlRow {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function records(value: unknown): SqlRow[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function scalarString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function fixedUuid(input: CollectInactiveWriteEvidenceInput, index: number): string {
  const value = input.uuid(index);
  requireCondition(
    new RegExp(`^${FIXED_UUID_PREFIX}[0-9]{12}$`).test(value),
    "B05 fixed fixture UUID is outside the approved synthetic namespace",
  );
  return value;
}

function resolveFixtureId(
  input: CollectInactiveWriteEvidenceInput,
  id: string,
): string {
  return id === "actor" ? input.actorId : fixedUuid(input, Number(id));
}

function resolveFixtureFilters(
  input: CollectInactiveWriteEvidenceInput,
  filters: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(filters).map(([column, id]) => [column, resolveFixtureId(input, id)]),
  );
}

function fixtureSqlPredicate(
  input: CollectInactiveWriteEvidenceInput,
  predicate: string,
): string {
  return predicate.replace(/\{\{uuid:(\d+)\}\}/g, (_match, value: string) =>
    input.quote(fixedUuid(input, Number(value))),
  );
}

function jwtSubject(jwt: string): string | null {
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as unknown;
    return isRecord(payload) && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function gatewayBase(gateway: string): string {
  let url: URL;
  try {
    url = new URL(gateway);
  } catch {
    throw new Error("B05 CloudBase gateway URL is invalid");
  }
  const envId = process.env.CLOUDBASE_ENV_ID;
  requireCondition(process.env.DYDATA_GATE_BACKEND === "cloudbase", "B05 requires the isolated CloudBase gate backend");
  requireCondition(Boolean(envId), "B05 isolated CloudBase environment is not configured");
  requireCondition(
    url.protocol === "https:"
      && url.hostname === `${envId}.api.tcloudbasegateway.com`
      && url.pathname === "/"
      && !url.search
      && !url.hash,
    "B05 requests are restricted to the configured CloudBase isolation gateway",
  );
  return url.origin;
}

async function readRows(input: CollectInactiveWriteEvidenceInput, sql: string): Promise<SqlRow[]> {
  try {
    return records(await input.rows(sql));
  } catch {
    throw new Error("B05 read-only fixture snapshot failed");
  }
}

async function executeCatalog(input: CollectInactiveWriteEvidenceInput, sql: string): Promise<{
  rows: SqlRow[];
  requestId?: string;
}> {
  try {
    const result = await input.execute(sql);
    const requestId = scalarString(result.requestId);
    const resultRows = records(result.rows);
    return {
      rows: resultRows.length > 0 || Array.isArray(result.rows)
        ? resultRows
        : await readRows(input, sql),
      ...(requestId ? { requestId } : {}),
    };
  } catch {
    throw new Error("B05 read-only catalog query failed");
  }
}

async function assertBlockedSyntheticActor(input: CollectInactiveWriteEvidenceInput): Promise<void> {
  const blockedId = fixedUuid(input, 6);
  requireCondition(input.actorId === blockedId, "B05 actor must be the fixed blocked synthetic user");
  requireCondition(jwtSubject(input.jwt) === input.actorId, "B05 JWT subject does not match the blocked synthetic actor");

  const actorRows = await readRows(
    input,
    `SELECT u.status::text AS auth_status, u.username, p.id::text AS profile_id, p.name AS profile_name
     FROM auth.users u
     JOIN public.profiles p ON p.id::text = u.sub
     WHERE u.sub = ${input.quote(input.actorId)}
       AND u.username LIKE '${FIXTURE_PREFIX}-%'
       AND p.name LIKE '${FIXTURE_PREFIX}-%'`,
  );
  requireCondition(
    actorRows.length === 1
      && scalarString(actorRows[0].auth_status) === "3"
      && scalarString(actorRows[0].profile_id) === input.actorId,
    "B05 actor is not the blocked synthetic fixture; no write evidence requests were sent",
  );
}

function tableCatalogSql(): string {
  return `SELECT c.relname AS table_name,
      pg_catalog.has_table_privilege('authenticated', c.oid, 'INSERT') AS can_insert,
      (pg_catalog.has_table_privilege('authenticated', c.oid, 'UPDATE') OR pg_catalog.has_any_column_privilege('authenticated', c.oid, 'UPDATE')) AS can_update,
      pg_catalog.has_table_privilege('authenticated', c.oid, 'DELETE') AS can_delete
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND (pg_catalog.has_table_privilege('authenticated', c.oid, 'INSERT')
        OR pg_catalog.has_table_privilege('authenticated', c.oid, 'UPDATE')
        OR pg_catalog.has_any_column_privilege('authenticated', c.oid, 'UPDATE')
        OR pg_catalog.has_table_privilege('authenticated', c.oid, 'DELETE'))
    ORDER BY c.relname`;
}

function rpcCatalogSql(): string {
  return `SELECT n.nspname AS schema_name,p.proname AS function_name,
      p.oid::regprocedure::text AS signature,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'name', p.proargnames[arguments.ordinality],
          'type', pg_catalog.format_type(arguments.arg_oid, NULL)
        ) ORDER BY arguments.ordinality)
        FROM unnest(COALESCE(p.proallargtypes, p.proargtypes::oid[])) WITH ORDINALITY AS arguments(arg_oid, ordinality)
        WHERE p.proargmodes IS NULL OR p.proargmodes[arguments.ordinality] IN ('i', 'b', 'v')
      ), '[]'::jsonb) AS arguments
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public','private')
      AND p.prokind = 'f'
      AND p.prorettype <> 'pg_catalog.trigger'::regtype
      AND p.prosecdef IS TRUE
      AND position('cloudbase_require_active_actor_v2' IN p.prosrc) > 0
    ORDER BY p.proname, p.oid::regprocedure::text`;
}

function parseArguments(value: unknown): RpcArgument[] | null {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed)) return null;
  const result: RpcArgument[] = [];
  for (const item of parsed) {
    if (!isRecord(item) || typeof item.type !== "string") return null;
    result.push({ name: typeof item.name === "string" ? item.name : null, type: item.type });
  }
  return result;
}

function pgErrorCode(value: unknown, depth = 0): string | null {
  if (depth > 5 || !isRecord(value)) return null;
  for (const [key, item] of Object.entries(value)) {
    if (key.toLowerCase() === "code" && (typeof item === "string" || typeof item === "number")) {
      return String(item);
    }
  }
  for (const item of Object.values(value)) {
    const nested = pgErrorCode(item, depth + 1);
    if (nested) return nested;
  }
  return null;
}

function textValues(value: unknown, depth = 0): string[] {
  if (depth > 5) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => textValues(item, depth + 1));
  if (isRecord(value)) return Object.values(value).flatMap((item) => textValues(item, depth + 1));
  return [];
}

function explicitDenial(status: number, payload: unknown): ProbeResult["denial"] | null {
  if (status === 401) return "http-401";
  if (status === 403) return "http-403";
  if (pgErrorCode(payload) === "42501") return "postgres-42501";

  const message = textValues(payload).join(" ").toLowerCase();
  const inactiveCode = /\b(?:account|user|auth)[_-]?(?:inactive|disabled|blocked|archived)\b/;
  const inactiveMessage = /\b(?:account|user|actor)\s+(?:is\s+)?(?:inactive|disabled|blocked|archived)\b|\b(?:inactive|disabled|blocked|archived)\s+(?:account|user|actor)\b/;
  return inactiveCode.test(message) || inactiveMessage.test(message) ? "inactive-account" : null;
}

function responseRequestId(response: Response, payload: unknown): string | undefined {
  const header = response.headers.get("x-request-id") ?? response.headers.get("x-tc-requestid");
  if (header) return header;
  if (!isRecord(payload)) return undefined;
  const value = payload.RequestId ?? (isRecord(payload.Response) ? payload.Response.RequestId : undefined);
  return typeof value === "string" ? value : undefined;
}

async function parseResponse(response: Response): Promise<{ payload: unknown; requestId?: string }> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return { payload: null };
  }
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = null;
    }
  }
  const requestId = responseRequestId(response, payload);
  return { payload, ...(requestId ? { requestId } : {}) };
}

function snapshotSql(input: CollectInactiveWriteEvidenceInput, probe: SafeRowProbe, actorId: string): string {
  const id = resolveFixtureId(input, probe.id);
  const ownerPredicate = fixtureSqlPredicate(input, probe.sqlOwnerPredicate.replaceAll("{{actor}}", input.quote(actorId)));
  return `SELECT id::text AS id, to_jsonb(t) ->> '${probe.field}' AS value
    FROM public.${probe.table} t
    WHERE id = ${input.quote(id)} AND ${ownerPredicate}`;
}

async function snapshotRow(
  input: CollectInactiveWriteEvidenceInput,
  probe: SafeRowProbe,
  actorId: string,
): Promise<SqlRow | null> {
  const result = await readRows(input, snapshotSql(input, probe, actorId));
  return result.length === 1 && scalarString(result[0].id) === resolveFixtureId(input, probe.id)
    ? result[0]
    : null;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function apiUrl(base: string, path: string, filters: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [column, id] of Object.entries(filters)) params.set(column, `eq.${id}`);
  const query = params.toString();
  return `${base}/v1/rdb/rest/${path}${query ? `?${query}` : ""}`;
}

async function sendWrite(
  input: CollectInactiveWriteEvidenceInput,
  base: string,
  table: string,
  operation: WriteOperation,
  filters: Record<string, string>,
  body?: unknown,
): Promise<{ response: Response; payload: unknown; requestId?: string }> {
  let response: Response;
  try {
    response = await fetch(apiUrl(base, table, filters), {
      signal: AbortSignal.timeout(10_000),
      method: REST_METHOD[operation],
      headers: {
        authorization: `Bearer ${input.jwt}`,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error(`B05 ${operation.toUpperCase()} request failed for synthetic table ${table}`);
  }
  const parsed = await parseResponse(response);
  return { response, payload: parsed.payload, ...(parsed.requestId ? { requestId: parsed.requestId } : {}) };
}

function explicitProbe(
  httpStatus: number,
  denial: ProbeResult["denial"] | null,
  requestId?: string,
): ProbeResult {
  if (denial) {
    return {
      status: "DENIED",
      reason: denial,
      httpStatus,
      denial,
      ...(requestId ? { requestId } : {}),
    };
  }
  return {
    status: "BLOCKED",
    reason: "response-was-not-an-explicit-authorization-denial",
    httpStatus,
    ...(requestId ? { requestId } : {}),
  };
}

function unsupportedProbe(reason: string): ProbeResult {
  return { status: "BLOCKED", reason };
}

function noGrantProbe(): ProbeResult {
  return { status: "NOT_GRANTED", reason: "authenticated-role-has-no-table-write-grant" };
}

async function testRowWrite(
  input: CollectInactiveWriteEvidenceInput,
  base: string,
  probe: SafeRowProbe,
  actorId: string,
  operation: "update" | "delete",
): Promise<ProbeResult> {
  const before = await snapshotRow(input, probe, actorId);
  if (!before || !probe.fixtureValue(before.value)) {
    return unsupportedProbe("no-matching-owned-synthetic-fixture-row");
  }

  const id = resolveFixtureId(input, probe.id);
  const filters = {
    id,
    ...resolveFixtureFilters(input, probe.ownerFilters),
  };
  const body = operation === "update" ? { [probe.field]: probe.replacement } : undefined;
  const { response, payload, requestId } = await sendWrite(
    input,
    base,
    probe.table,
    operation,
    filters,
    body,
  );
  const denial = explicitDenial(response.status, payload)
    ?? (response.ok && Array.isArray(payload) && payload.length===0 ? 'rls-zero-rows' : null);
  const hasReturnedRows = Array.isArray(payload) && payload.length > 0;
  if (!denial && response.ok && hasReturnedRows) {
    throw new Error(`B05 ${operation.toUpperCase()} returned a row for synthetic table ${probe.table}; stop and let fixture cleanup run`);
  }

  const after = await snapshotRow(input, probe, actorId);
  const unchanged = Boolean(after)
    && scalarString(after?.id) === id
    && sameValue(after?.value, before.value);
  if (!unchanged) {
    throw new Error(`B05 ${operation.toUpperCase()} changed a fixed synthetic row in ${probe.table}; stop and let fixture cleanup run`);
  }

  return denial
    ? { status: "DENIED", reason: denial, httpStatus: response.status, denial, rowUnchanged: true, ...(requestId ? { requestId } : {}) }
    : { status: "BLOCKED", reason: "no-explicit-denial; fixed synthetic row remained unchanged", httpStatus: response.status, rowUnchanged: true, ...(requestId ? { requestId } : {}) };
}

async function testInsert(
  input: CollectInactiveWriteEvidenceInput,
  base: string,
  probe: SafeInsertProbe,
  actorId: string,
): Promise<ProbeResult> {
  const id = resolveFixtureId(input, probe.id);
  const before = await readRows(input, `SELECT id::text AS id FROM public.${probe.table} WHERE id = ${input.quote(id)}`);
  if (before.length !== 0) return unsupportedProbe("fixed-synthetic-insert-id-is-already-occupied");

  const payload = Object.fromEntries(
    Object.entries(probe.payload).map(([key, value]) => [key, value === "actor" ? actorId : value === "101" ? fixedUuid(input, 101) : value]),
  );
  const body = { id, ...payload };
  const { response, payload: responseBody, requestId } = await sendWrite(
    input,
    base,
    probe.table,
    "insert",
    {},
    body,
  );
  const denial = explicitDenial(response.status, responseBody);
  if (!denial && response.ok && Array.isArray(responseBody) && responseBody.length > 0) {
    throw new Error(`B05 INSERT returned a row for synthetic table ${probe.table}; stop and let fixture cleanup run`);
  }
  const after = await readRows(input, `SELECT id::text AS id, ${probe.ownerColumn}::text AS owner_id FROM public.${probe.table} WHERE id = ${input.quote(id)}`);
  const unchanged = after.length === 0;
  if (!unchanged) {
    throw new Error(`B05 INSERT created fixed synthetic row ${id}; stop and let fixture cleanup run`);
  }
  return denial
    ? { status: "DENIED", reason: denial, httpStatus: response.status, denial, rowUnchanged: true, ...(requestId ? { requestId } : {}) }
    : { status: "BLOCKED", reason: "no-explicit-denial; fixed synthetic insert id remained absent", httpStatus: response.status, rowUnchanged: true, ...(requestId ? { requestId } : {}) };
}

async function testRpc(
  input: CollectInactiveWriteEvidenceInput,
  base: string,
  row: RpcCatalogRow,
): Promise<RpcEvidence> {
  const name = scalarString(row.function_name);
  const signature = scalarString(row.signature);
  const schema=scalarString(row.schema_name)??'unknown';
  if (!name || !/^[a-z][a-z0-9_]*$/.test(name) || !signature) {
    return { schema,name: name ?? "unknown", signature: signature ?? "unknown", argumentTypes: [], status: "BLOCKED", reason: "catalog row has no safe function name/signature" };
  }

  const argumentsList = parseArguments(row.arguments);
  if (!argumentsList || argumentsList.some((argument) => !argument.name)
    || new Set(argumentsList.map((argument) => argument.name)).size !== argumentsList.length) {
    return { schema,name, signature, argumentTypes: argumentsList?.map((argument) => argument.type) ?? [], status: "BLOCKED", reason: "RPC input argument names are missing or ambiguous" };
  }
  if(schema!=='public')return {schema,name,signature,argumentTypes:argumentsList.map(argument=>argument.type),status:'BLOCKED',reason:'private-schema-not-exposed-as-RPC; indirect helper execution not isolated'};
  const args = Object.fromEntries(argumentsList.map((argument) => [argument.name!, null]));

  let response: Response;
  try {
    response = await fetch(`${base}/v1/rdb/rest/rpc/${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(10_000),
      method: "POST",
      headers: {
        authorization: `Bearer ${input.jwt}`,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify(args),
    });
  } catch {
    throw new Error(`B05 protected RPC request failed for ${name}`);
  }

  const parsed = await parseResponse(response);
  const denial = explicitDenial(response.status, parsed.payload);
  if (!denial && response.ok) {
    throw new Error(`B05 protected RPC ${name} returned success; stop and let fixture cleanup run`);
  }
  return {
    schema,
    name,
    signature,
    argumentTypes: argumentsList.map((argument) => argument.type),
    ...explicitProbe(response.status, denial, parsed.requestId),
  };
}

export async function collectInactiveWriteEvidence(
  input: CollectInactiveWriteEvidenceInput,
): Promise<InactiveWriteEvidence> {
  const base = gatewayBase(input.gateway);
  await assertBlockedSyntheticActor(input);

  const [tableCatalog, rpcCatalog] = await Promise.all([
    executeCatalog(input, tableCatalogSql()),
    executeCatalog(input, rpcCatalogSql()),
  ]);
  const catalogTables = records(tableCatalog.rows) as TableCatalogRow[];
  const catalogRpcs = records(rpcCatalog.rows) as RpcCatalogRow[];
  requireCondition(catalogTables.length <= 200, "B05 public writable-table catalog exceeded its safety bound");
  requireCondition(catalogRpcs.length <= 100, "B05 protected RPC catalog exceeded its safety bound");

  const privilegesByTable = new Map<string, TableEvidence["privileges"]>();
  for (const row of catalogTables) {
    const table = scalarString(row.table_name);
    requireCondition(Boolean(table && /^[a-z][a-z0-9_]*$/.test(table)), "B05 catalog returned an unsafe public table name");
    privilegesByTable.set(table!, {
      insert: asBoolean(row.can_insert),
      update: asBoolean(row.can_update),
      delete: asBoolean(row.can_delete),
    });
  }

  const evidenceByTable = new Map<string, TableEvidence>();
  for (const [table, privileges] of privilegesByTable) {
    evidenceByTable.set(table, {
      table,
      privileges,
      probes: {
        insert: privileges.insert ? unsupportedProbe("no-safe-synthetic-insert-fixture") : noGrantProbe(),
        update: privileges.update ? unsupportedProbe("no-safe-synthetic-update-fixture") : noGrantProbe(),
        delete: privileges.delete ? unsupportedProbe("no-safe-synthetic-child-delete-fixture") : noGrantProbe(),
      },
    });
  }

  for (const probe of UPDATE_FIXTURES) {
    const tableEvidence = evidenceByTable.get(probe.table);
    if (!tableEvidence) continue;
    tableEvidence.probes.update = tableEvidence.privileges.update
      ? await testRowWrite(input, base, probe, input.actorId, "update")
      : noGrantProbe();
  }

  for (const probe of INSERT_FIXTURES) {
    const tableEvidence = evidenceByTable.get(probe.table);
    if (!tableEvidence) continue;
    tableEvidence.probes.insert = tableEvidence.privileges.insert
      ? await testInsert(input, base, probe, input.actorId)
      : noGrantProbe();
  }

  for (const probe of DELETE_FIXTURES) {
    const tableEvidence = evidenceByTable.get(probe.table);
    if (!tableEvidence) continue;
    tableEvidence.probes.delete = tableEvidence.privileges.delete
      ? await testRowWrite(input, base, probe, input.actorId, "delete")
      : noGrantProbe();
  }

  const rpcEvidence: RpcEvidence[] = [];
  for (const row of catalogRpcs) rpcEvidence.push(await testRpc(input, base, row));

  const tables = [...evidenceByTable.values()].sort((left, right) => left.table.localeCompare(right.table));
  const tableProbes = tables.flatMap((table) => Object.values(table.probes));
  const explicitTableDenials = tableProbes.filter((probe) => probe.status === "DENIED").length;
  const blockedTableOperations = tableProbes.filter((probe) => probe.status === "BLOCKED").length;
  const explicitRpcDenials = rpcEvidence.filter((probe) => probe.status === "DENIED").length;
  const blockedRpcs = rpcEvidence.filter((probe) => probe.schema==='public' && probe.status === "BLOCKED").length;
  const privateHelpersWithoutDirectGatewayEvidence=rpcEvidence.filter(probe=>probe.schema==='private').length;

  return {
    source: "old-jwt-for-blocked-synthetic-user",
    actorId: input.actorId,
    tableDirectory: {
      expected: EXPECTED_TABLE_COUNT,
      observed: tables.length,
      complete: tables.length === EXPECTED_TABLE_COUNT,
      entries: tables,
    },
    protectedFunctions: {
      expected: EXPECTED_RPC_COUNT,
      observed: rpcEvidence.length,
      complete: rpcEvidence.length === EXPECTED_RPC_COUNT,
      entries: rpcEvidence,
    },
    summary: {
      explicitTableDenials,
      blockedTableOperations,
      explicitRpcDenials,
      blockedRpcs,
      privateHelpersWithoutDirectGatewayEvidence,
    },
  };
}
