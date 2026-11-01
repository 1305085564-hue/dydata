import { createHash } from "node:crypto";

export const AUTH_IMPORT_ENV_ID = "dydata-d6g0gd1v37fcddf21";

const FULL_SOURCE_COUNT = 84;
const ROWS_PER_BATCH = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BCRYPT_2A_10_PATTERN = /^\$2a\$10\$[./A-Za-z0-9]{53}$/;
const REQUIRED_TIMESTAMP_ZONE = /(?:Z|[+-]\d{2}:\d{2})$/i;

function fail(message) {
  throw new Error(message);
}

function rejectNul(value, label) {
  if (typeof value === "string" && value.includes("\u0000")) fail(`${label} contains a SQL NUL byte`);
}

function normalized(value) {
  return value.toLocaleLowerCase("en-US");
}

function validateInstant(value, label) {
  rejectNul(value, label);
  if (typeof value !== "string" || value.trim() !== value || !REQUIRED_TIMESTAMP_ZONE.test(value)) {
    fail(`${label} must be a timestamp with an explicit timezone`);
  }
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) fail(`${label} is invalid`);
  return epoch;
}

function validateSourceUsers(sourceUsers) {
  if (!Array.isArray(sourceUsers)) fail("sourceUsers must be an array");
  const seen = new Map();
  const rows = sourceUsers.map((user) => {
    if (!user || typeof user !== "object" || Array.isArray(user)) fail("source user row is invalid");
    if (typeof user.id !== "string" || !UUID_PATTERN.test(user.id)) fail("source user UUID is invalid");
    rejectNul(user.email, "source email");
    if (typeof user.email !== "string" || !user.email || user.email.trim() !== user.email || user.email.length > 320) {
      fail("source user email is invalid");
    }
    if (typeof user.encrypted_password !== "string" || !BCRYPT_2A_10_PATTERN.test(user.encrypted_password) || Buffer.byteLength(user.encrypted_password, "utf8") !== 60) {
      fail("source bcrypt must be exactly a $2a$10$ 60-byte hash");
    }
    validateInstant(user.created_at, "source created_at");
    if (!Object.prototype.hasOwnProperty.call(user, "email_confirmed_at")) fail("source email_confirmed_at is required");
    const emailVerified = user.email_confirmed_at !== null;
    if (emailVerified) validateInstant(user.email_confirmed_at, "source email_confirmed_at");
    if (!Object.prototype.hasOwnProperty.call(user, "banned_until") || user.banned_until === undefined) {
      fail("source banned_until is required; unknown ban state must not activate an account");
    }
    let bannedUntilEpoch = null;
    if (user.banned_until !== null) {
      if (user.banned_until === "infinity") bannedUntilEpoch = Number.POSITIVE_INFINITY;
      else if (user.banned_until === "-infinity") bannedUntilEpoch = Number.NEGATIVE_INFINITY;
      else bannedUntilEpoch = validateInstant(user.banned_until, "source banned_until");
    }

    const row = {
      emailConfirmedAt: user.email_confirmed_at,
      emailVerified,
      sourceId: user.id,
      email: user.email,
      emailKey: normalized(user.email),
      encryptedPassword: user.encrypted_password,
      createdAt: user.created_at,
      bannedUntilEpoch,
    };
    for (const [key, value] of [[`sub:${normalized(row.sourceId)}`, row.sourceId], [`email:${row.emailKey}`, row.email]]) {
      const previous = seen.get(key);
      if (previous) fail("duplicate source UUID or email");
      seen.set(key, value);
    }
    return row;
  });
  return rows;
}

function validateTargetIdentities(targetIdentities) {
  if (!Array.isArray(targetIdentities)) fail("targetIdentities must be an array");
  const occupied = new Map();
  targetIdentities.forEach((identity, index) => {
    if (!identity || typeof identity !== "object" || Array.isArray(identity)) fail("target identity row is invalid");
    if (typeof identity.sub !== "string" || !identity.sub || identity.sub.trim() !== identity.sub) fail("target identity sub is invalid");
    const values = [identity.sub, identity.username, identity.email];
    for (const value of values) {
      if (value === null || value === undefined || value === "") continue;
      if (typeof value !== "string" || value.trim() !== value) fail("target identity value is invalid");
      rejectNul(value, "target identity");
      const key = normalized(value);
      const rows = occupied.get(key) ?? new Set();
      rows.add(index);
      if (rows.size > 1) fail("duplicate target identity conflict");
      occupied.set(key, rows);
    }
  });
  return occupied;
}

function quoteELiteral(value) {
  const text = String(value);
  rejectNul(text, "SQL value");
  return `E'${text.replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
}

function rowValues(row) {
  const values = [
    row.sourceId,
    AUTH_IMPORT_ENV_ID,
    row.email,
    row.email,
    row.password,
    row.status,
    "internal",
    "[]",
    row.createdAt,
    row.createdAt,
    row.emailVerified,
  ];
  return `(${[
    quoteELiteral(values[0]),
    quoteELiteral(values[1]),
    quoteELiteral(values[2]),
    quoteELiteral(values[3]),
    quoteELiteral(values[4]),
    String(values[5]),
    quoteELiteral(values[6]),
    `${quoteELiteral(values[7])}::jsonb`,
    `${quoteELiteral(values[8])}::timestamptz`,
    `${quoteELiteral(values[9])}::timestamptz`,
    String(values[10]),
  ].join(", ")})`;
}

function makeGuardStatement(rows) {
  const candidates = rows.map((row) => `(${quoteELiteral(row.sourceId)}, ${quoteELiteral(row.email)}, ${quoteELiteral(row.email)})`).join(",\n      ");
  return `DO $auth_import_guard$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM auth.users AS target
    JOIN (VALUES
      ${candidates}
    ) AS planned(sub, username, email)
      ON target."project" = ${quoteELiteral(AUTH_IMPORT_ENV_ID)}
     AND (
       lower(target."sub") IN (lower(planned.sub), lower(planned.username), lower(planned.email))
       OR lower(target."username") IN (lower(planned.sub), lower(planned.username), lower(planned.email))
       OR lower(target."email") IN (lower(planned.sub), lower(planned.username), lower(planned.email))
     )
  ) THEN
    RAISE EXCEPTION 'Auth import target identity conflict';
  END IF;
END;
$auth_import_guard$;`;
}

function batchesOf(rows, statementForSlice) {
  const batches = [];
  for (let offset = 0; offset < rows.length; offset += ROWS_PER_BATCH) {
    const slice = rows.slice(offset, offset + ROWS_PER_BATCH);
    const sql = `BEGIN;\nLOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;\n${statementForSlice(slice)}\nCOMMIT;`;
    batches.push({
      index: batches.length + 1,
      rowCount: slice.length,
      sql,
      sha256: sha256(sql),
      expectedRows: slice.map((row) => ({
        sub: row.sourceId,
        project: AUTH_IMPORT_ENV_ID,
        username: row.email,
        email: row.email,
        password: row.password,
        email_verified: row.emailVerified,
        status: row.status,
        type: "internal",
        providers: [],
        created_at: row.createdAt,
        updated_at: row.createdAt,
      })),
    });
  }
  return batches;
}

function makeForwardBatches(rows) {
  const columns = '"sub", "project", "username", "email", "password", "status", "type", "providers", "created_at", "updated_at", "email_verified"';
  return batchesOf(rows, (slice) => `${makeGuardStatement(slice)}\nINSERT INTO auth.users (${columns}) VALUES\n${slice.map(rowValues).join(",\n")}\nRETURNING id::text, sub;`);
}

function makeRollbackBatchSql(receiptRows) {
  const predicates = receiptRows.map(({ expected, id }) => {
    const values = [
      ["id", id],
      ["sub", expected.sub],
      ["project", expected.project],
      ["username", expected.username],
      ["email", expected.email],
      ["password", expected.password],
      ["email_verified", expected.email_verified],
      ["status", expected.status],
      ["type", expected.type],
      ["providers", "[]"],
      ["created_at", expected.created_at],
      ["updated_at", expected.updated_at],
    ];
    return `(${values.map(([column, value]) => {
      const literal = column === "status" || column === "email_verified" ? String(value) : quoteELiteral(value);
      const expression = column === "id" ? `target."id"::text` : `target."${column}"`;
      return `${expression} = ${column === "providers" ? `${literal}::jsonb` : literal}`;
    }).join(" AND ")})`;
  });
  return `DELETE FROM auth.users AS target\nWHERE\n  ${predicates.join("\n  OR ")};`;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function buildAuthImportPlan({ sourceUsers, targetIdentities, capturedAt, sampleIds, project } = {}) {
  if (project !== undefined && project !== AUTH_IMPORT_ENV_ID) fail("project environment does not match the fixed import environment");
  const capturedAtEpoch = validateInstant(capturedAt, "capturedAt");
  const sourceRows = validateSourceUsers(sourceUsers);
  const isSample = sampleIds !== undefined;
  let selectedRows = sourceRows;

  if (isSample) {
    if (!Array.isArray(sampleIds) || sampleIds.length === 0) fail("sampleIds must be a non-empty array");
    const requested = new Set();
    for (const id of sampleIds) {
      if (typeof id !== "string" || !UUID_PATTERN.test(id)) fail("sample UUID is invalid");
      const key = normalized(id);
      if (requested.has(key)) fail("duplicate sample UUID");
      requested.add(key);
    }
    const sourceById = new Map(sourceRows.map((row) => [normalized(row.sourceId), row]));
    if ([...requested].some((id) => !sourceById.has(id))) fail("requested sample user is missing from sourceUsers");
    selectedRows = [...requested].map((id) => sourceById.get(id));
  } else if (sourceRows.length !== FULL_SOURCE_COUNT) {
    fail(`full import must contain exactly ${FULL_SOURCE_COUNT} source users`);
  }

  const targetKeys = validateTargetIdentities(targetIdentities);
  const plannedKeys = new Map();
  for (let index = 0; index < selectedRows.length; index += 1) {
    const row = selectedRows[index];
    for (const key of [normalized(row.sourceId), row.emailKey]) {
      if (targetKeys.has(key)) fail("target identity conflict; refusing to overwrite an existing account");
      const previousIndex = plannedKeys.get(key);
      if (previousIndex !== undefined && previousIndex !== index) fail("planned source identity conflict");
      plannedKeys.set(key, index);
    }
  }

  const rows = selectedRows.map((row) => ({
    ...row,
    password: Buffer.from(row.encryptedPassword, "utf8").toString("base64"),
    emailVerified: row.emailConfirmedAt !== null,
    status: row.bannedUntilEpoch !== null && row.bannedUntilEpoch > capturedAtEpoch
      ? 3
      : row.emailConfirmedAt === null ? 2 : 1,
  }));
  const statusCounts = rows.reduce((counts, row) => {
    if (row.status === 3) counts.disabled += 1;
    else if (row.status === 2) counts.pending += 1;
    else counts.active += 1;
    return counts;
  }, { active: 0, pending: 0, disabled: 0 });
  const expectedRows = rows.map((row) => ({
    sub: row.sourceId,
    project: AUTH_IMPORT_ENV_ID,
    username: row.email,
    email: row.email,
    password: row.password,
    email_verified: row.emailVerified,
    status: row.status,
    type: "internal",
    providers: [],
    created_at: row.createdAt,
    updated_at: row.createdAt,
  }));
  const expectedPlanSha256 = sha256(JSON.stringify(expectedRows));
  const batches = makeForwardBatches(rows);
  const planSha256 = sha256(JSON.stringify({
    environment: AUTH_IMPORT_ENV_ID,
    capturedAt,
    expectedPlanSha256,
    batches: batches.map(({ index, rowCount, sha256: batchSha256 }) => ({ index, rowCount, sha256: batchSha256 })),
  }));
  const expectedPlan = {
    environment: AUTH_IMPORT_ENV_ID,
    capturedAt,
    userCount: rows.length,
    activeCount: statusCounts.active,
    pendingCount: statusCounts.pending,
    disabledCount: statusCounts.disabled,
    sha256: expectedPlanSha256,
    bindingSha256: planSha256,
  };

  return {
    sensitive: true,
    summary: {
      environment: AUTH_IMPORT_ENV_ID,
      mode: isSample ? "sample" : "full",
      importCount: rows.length,
      batchCount: batches.length,
      statusCounts,
      expectedPlanSha256,
      planSha256,
      sensitive: true,
    },
    expectedPlan,
    batches,
    executionGate: "执行前必须通过外部闸门暂停此环境全部 Auth 写入口，并持续暂停到所有批次完成；每批锁表只覆盖该批事务。",
  };
}

export function buildAuthImportRollback(plan, insertedReceipts) {
  if (!plan || typeof plan !== "object" || plan.summary?.environment !== AUTH_IMPORT_ENV_ID || !Array.isArray(plan.batches)) {
    fail("import plan is invalid");
  }
  if (plan.sensitive !== true || plan.summary.sensitive !== true || !Array.isArray(insertedReceipts) || insertedReceipts.length !== plan.batches.length) {
    fail("complete batch receipts are required before rollback generation");
  }
  const expectedRows = plan.batches.flatMap((batch) => batch.expectedRows ?? []);
  if (expectedRows.length !== plan.summary.importCount || expectedRows.some((row) => !row || typeof row !== "object")) {
    fail("import plan expected rows are incomplete");
  }
  if (plan.batches.some((batch) => typeof batch.sql !== "string" || batch.sha256 !== sha256(batch.sql))) {
    fail("import plan batch digest is invalid");
  }
  const expectedPlanSha256 = sha256(JSON.stringify(expectedRows));
  if (expectedPlanSha256 !== plan.expectedPlan?.sha256 || expectedPlanSha256 !== plan.summary.expectedPlanSha256) {
    fail("expected plan digest does not match import plan");
  }
  const planSha256 = sha256(JSON.stringify({
    environment: AUTH_IMPORT_ENV_ID,
    capturedAt: plan.expectedPlan?.capturedAt,
    expectedPlanSha256,
    batches: plan.batches.map(({ index, rowCount, sha256: batchSha256 }) => ({ index, rowCount, sha256: batchSha256 })),
  }));
  if (planSha256 !== plan.summary.planSha256 || planSha256 !== plan.expectedPlan.bindingSha256) {
    fail("import plan binding digest is invalid");
  }

  const expectedBySub = new Map(expectedRows.map((row) => [row.sub, row]));
  if (expectedBySub.size !== expectedRows.length) fail("import plan contains duplicate subjects");
  const receiptsByBatch = new Map();
  const seenInternalIds = new Set();
  for (const receipt of insertedReceipts) {
    if (!receipt || !Number.isInteger(receipt.batchIndex) || receiptsByBatch.has(receipt.batchIndex)) fail("batch receipt index is invalid");
    const batch = plan.batches.find((candidate) => candidate.index === receipt.batchIndex);
    if (!batch || receipt.planSha256 !== planSha256 || receipt.batchSha256 !== batch.sha256 || !Array.isArray(receipt.rows) || receipt.rows.length !== batch.rowCount) {
      fail("batch receipt is missing or not bound to this plan");
    }
    const rows = [];
    const seenSubs = new Set();
    for (const returned of receipt.rows) {
      if (!returned || typeof returned.id !== "string" || !/^[1-9][0-9]*$/.test(returned.id)) {
        fail("returned internal id must be a positive decimal string");
      }
      if (returned.id.length > 19 || BigInt(returned.id) > 9223372036854775807n) {
        fail("returned internal id exceeds PostgreSQL bigint range");
      }
      if (seenInternalIds.has(returned.id)) fail("duplicate internal id in batch receipts");
      seenInternalIds.add(returned.id);
      rejectNul(returned.sub, "returned sub");
      if (typeof returned.sub !== "string" || !expectedBySub.has(returned.sub) || seenSubs.has(returned.sub)) {
        fail("returned sub does not match the bound batch plan");
      }
      const expected = expectedBySub.get(returned.sub);
      if (!batch.expectedRows.some((row) => row.sub === returned.sub)) fail("returned sub belongs to another plan batch");
      seenSubs.add(returned.sub);
      rows.push({ expected, id: returned.id });
    }
    if (seenSubs.size !== batch.rowCount) fail("batch receipt rows are incomplete");
    receiptsByBatch.set(batch.index, rows);
  }
  if (receiptsByBatch.size !== plan.batches.length) fail("complete batch receipts are required before rollback generation");

  const rollbackBatches = plan.batches.map((batch) => {
    const sql = `BEGIN;\nLOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;\n${makeRollbackBatchSql(receiptsByBatch.get(batch.index))}\nCOMMIT;`;
    return { index: batch.index, rowCount: batch.rowCount, sql, sha256: sha256(sql) };
  });
  return {
    summary: {
      environment: AUTH_IMPORT_ENV_ID,
      planSha256,
      receiptBatchCount: receiptsByBatch.size,
      rollbackBatchCount: rollbackBatches.length,
      sensitive: true,
    },
    rollbackBatches,
    rollbackNotice: "回退模板仅凭本次 INSERT RETURNING 收集的内部 id 与 sub，并逐字段精确匹配本次映射内容后删除。执行需另行授权；token 与联动表未验证，不能视为完整 Auth 回滚。",
  };
}
