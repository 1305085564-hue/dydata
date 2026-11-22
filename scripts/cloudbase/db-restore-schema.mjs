import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { qualifiedName, quoteIdentifier } from './db-backup-core.mjs';

const PRE_SQL_20261005024700 = `
do $$
begin
  if to_regclass('public.script_document') is not null
    and not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'script_document' and policyname = 'script_document_public_read'
    ) then
    create policy script_document_public_read on public.script_document for select to public using (true);
  end if;
  if to_regclass('public.tag_definition') is not null
    and not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'tag_definition' and policyname = 'tag_definition_read'
    ) then
    create policy tag_definition_read on public.tag_definition for select to public using (true);
  end if;
end $$;
`;

export const LOCAL_SCHEMA_QUERY = `SELECT jsonb_build_object(
  'tables', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'table', c.relname,
      'kind', c.relkind,
      'columns', (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
          'name', a.attname,
          'attnum', a.attnum,
          'formatType', format_type(a.atttypid, a.atttypmod),
          'notNull', a.attnotnull,
          'defaultExpr', pg_get_expr(ad.adbin, ad.adrelid),
          'identityGeneration', a.attidentity,
          'generatedKind', a.attgenerated,
          'generationExpr', CASE WHEN a.attgenerated <> '' THEN pg_get_expr(ad.adbin, ad.adrelid) ELSE NULL END
        ) ORDER BY a.attnum), '[]'::jsonb)
        FROM pg_attribute a
        LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
        WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      ),
      'checkConstraints', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'name', con.conname,
          'definition', pg_get_constraintdef(con.oid, true)
        ) ORDER BY con.conname)
        FROM pg_constraint con
        WHERE con.conrelid = c.oid AND con.contype = 'c'
      ), '[]'::jsonb)
    ) ORDER BY n.nspname, c.relname)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
      AND c.relkind IN ('r', 'p')
  ), '[]'::jsonb),
  'authFks', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'table', c.relname,
      'constraintName', con.conname,
      'targetTable', tn.nspname || '.' || tc.relname
    ) ORDER BY n.nspname, c.relname, con.conname)
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_class tc ON tc.oid = con.confrelid
    JOIN pg_namespace tn ON tn.oid = tc.relnamespace
    WHERE con.contype = 'f' AND tn.nspname = 'auth'
  ), '[]'::jsonb)
)::text AS catalog;`;

/** Read ordered migration SQL files and skip/pre-sql exceptions from the repo. */
export function readMigrationPlan(repoRoot) {
  const exceptionsPath = path.join(repoRoot, 'supabase', 'migration-ledger-exceptions.json');
  const migrationDir = path.join(repoRoot, 'supabase', 'migrations');
  const raw = JSON.parse(readFileSync(exceptionsPath, 'utf8'));
  const skip = new Set([
    ...(raw.replay_skip ?? []).map((item) => item.version),
    ...(raw.not_applied ?? []).map((item) => item.version),
  ]);
  const preSqlVersions = new Set((raw.replay_pre_sql ?? []).map((item) => item.version));

  const files = readdirSync(migrationDir)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();

  const items = [];
  for (const file of files) {
    const version = file.match(/^(\d+)_/)?.[1] ?? file;
    const name = file.replace(/^\d+_/, '').replace(/\.sql$/, '');
    if (skip.has(version)) {
      items.push({ file, version, name, skipped: true, sql: '' });
      continue;
    }
    const body = readFileSync(path.join(migrationDir, file), 'utf8');
    const pre = preSqlVersions.has(version) && version === '20261005024700' ? PRE_SQL_20261005024700 : '';
    items.push({ file, version, name, skipped: false, sql: `${pre}\n${body}` });
  }
  return items;
}

/** Compare local migrated schema against expected production table definitions. */
export function compareLocalAndProdSchema(localTables, prodTables) {
  const localByKey = Object.create(null);
  for (const t of localTables) {
    localByKey[`${t.schema}.${t.table}`] = t;
  }

  const missingTables = [];
  const missingColumns = [];
  const extraColumns = [];
  const typeMismatches = [];
  const nullabilityMismatches = [];
  const checkMismatches = [];

  for (const prod of prodTables) {
    const key = `${prod.schema}.${prod.table}`;
    const local = localByKey[key];
    if (!local) {
      missingTables.push({ schema: prod.schema, table: prod.table, prodMeta: prod });
      continue;
    }
    const localCols = Object.create(null);
    for (const c of local.columns ?? []) {
      localCols[c.name] = c;
    }
    const prodCols = Object.create(null);
    for (const prodCol of prod.columns ?? []) {
      prodCols[prodCol.name] = prodCol;
      const localCol = localCols[prodCol.name];
      if (!localCol) {
        missingColumns.push({ schema: prod.schema, table: prod.table, column: prodCol });
        continue;
      }
      if (localCol.formatType !== prodCol.formatType) {
        typeMismatches.push({
          schema: prod.schema,
          table: prod.table,
          column: prodCol.name,
          localType: localCol.formatType,
          prodType: prodCol.formatType,
        });
      }
      if (prod.schema !== 'auth' && Boolean(localCol.notNull) !== Boolean(prodCol.notNull)) {
        nullabilityMismatches.push({
          schema: prod.schema,
          table: prod.table,
          column: prodCol.name,
          localNotNull: Boolean(localCol.notNull),
          prodNotNull: Boolean(prodCol.notNull),
        });
      }
    }
    if (prod.schema !== 'auth') {
      for (const localCol of local.columns ?? []) {
        if (!prodCols[localCol.name]) {
          extraColumns.push({
            schema: prod.schema,
            table: prod.table,
            column: localCol.name,
            formatType: localCol.formatType,
            notNull: Boolean(localCol.notNull),
          });
        }
      }
      if (Array.isArray(prod.checkConstraints)) {
        const prodChecks = Object.create(null);
        for (const chk of prod.checkConstraints) prodChecks[chk.name] = chk.definition;
        const localChecks = Object.create(null);
        for (const chk of local.checkConstraints ?? []) localChecks[chk.name] = chk.definition;
        for (const chk of local.checkConstraints ?? []) {
          if (prodChecks[chk.name] !== chk.definition) {
            checkMismatches.push({
              schema: prod.schema,
              table: prod.table,
              name: chk.name,
              action: prodChecks[chk.name] ? 'replace' : 'drop',
              definition: prodChecks[chk.name] ?? null,
              localDefinition: chk.definition,
            });
          }
        }
        for (const chk of prod.checkConstraints) {
          if (!localChecks[chk.name]) {
            checkMismatches.push({
              schema: prod.schema,
              table: prod.table,
              name: chk.name,
              action: 'add',
              definition: chk.definition,
              localDefinition: null,
            });
          }
        }
      }
    }
  }

  return {
    missingTables,
    missingColumns,
    extraColumns,
    typeMismatches,
    nullabilityMismatches,
    checkMismatches,
    totalMismatches:
      missingTables.length +
      missingColumns.length +
      extraColumns.length +
      typeMismatches.length +
      nullabilityMismatches.length +
      checkMismatches.length,
  };
}

/** Format human-readable lines listing every schema mismatch found after migrations. */
export function describeSchemaMismatches(diff) {
  const lines = [];
  for (const item of diff.missingTables) {
    lines.push(`[缺表] ${item.schema}.${item.table}`);
  }
  for (const item of diff.missingColumns) {
    lines.push(`[缺列] ${item.schema}.${item.table}.${item.column.name} (${item.column.formatType})`);
  }
  for (const item of diff.extraColumns ?? []) {
    lines.push(`[多余列] ${item.schema}.${item.table}.${item.column} (${item.formatType})`);
  }
  for (const item of diff.typeMismatches) {
    lines.push(`[类型不一致] ${item.schema}.${item.table}.${item.column}: 本地=${item.localType}, 正式库=${item.prodType}`);
  }
  for (const item of diff.nullabilityMismatches ?? []) {
    lines.push(
      `[非空约束不一致] ${item.schema}.${item.table}.${item.column}: 本地=${item.localNotNull ? 'NOT NULL' : 'NULLABLE'}, 正式库=${item.prodNotNull ? 'NOT NULL' : 'NULLABLE'}`,
    );
  }
  for (const item of diff.checkMismatches ?? []) {
    lines.push(`[检查约束不一致] ${item.schema}.${item.table}.${item.name}: action=${item.action}`);
  }
  return lines;
}

function extractSequenceName(defaultExpr) {
  if (typeof defaultExpr !== 'string') return null;
  const match = defaultExpr.match(/^nextval\('([^']+)'::regclass\)$/);
  return match ? match[1] : null;
}

function buildSequenceCreateSql(sequenceRef, fallbackSchema) {
  const parts = sequenceRef.split('.');
  const schema = parts.length === 2 ? parts[0].replace(/^"|"$/g, '') : fallbackSchema;
  const seqName = parts[parts.length - 1].replace(/^"|"$/g, '');
  return `CREATE SEQUENCE IF NOT EXISTS ${quoteIdentifier(schema)}.${quoteIdentifier(seqName)};`;
}

/** Build column SQL definition from captured pg_attribute metadata. */
export function buildColumnDefSql(col) {
  const parts = [quoteIdentifier(col.name), col.formatType];
  if (col.generatedKind === 's' && col.generationExpr) {
    parts.push(`GENERATED ALWAYS AS (${col.generationExpr}) STORED`);
  } else if (col.identityGeneration === 'a') {
    parts.push('GENERATED ALWAYS AS IDENTITY');
  } else if (col.identityGeneration === 'd') {
    parts.push('GENERATED BY DEFAULT AS IDENTITY');
  } else if (col.defaultExpr) {
    parts.push(`DEFAULT ${col.defaultExpr}`);
  }
  if (col.notNull) parts.push('NOT NULL');
  return parts.join(' ');
}

/** Build ordered DDL statements to patch all missing schemas, tables, columns, and auth table mismatches. */
export function buildRepairStatements(diff, prodTables, authFks = []) {
  const statements = [];
  const prodByKey = Object.create(null);
  for (const t of prodTables) {
    prodByKey[`${t.schema}.${t.table}`] = t;
  }

  const schemasToEnsure = new Set([
    ...diff.missingTables.map((t) => t.schema),
    ...diff.typeMismatches.filter((m) => m.schema === 'auth').map((m) => m.schema),
  ]);
  for (const schema of [...schemasToEnsure].sort()) {
    statements.push(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schema)};`);
  }

  const authTablesToRecreate = new Set(
    diff.typeMismatches.filter((m) => m.schema === 'auth').map((m) => `${m.schema}.${m.table}`),
  );
  if (authTablesToRecreate.size > 0) {
    for (const fk of authFks) {
      if (authTablesToRecreate.has(fk.targetTable)) {
        statements.push(
          `ALTER TABLE ${qualifiedName(fk.schema, fk.table)} DROP CONSTRAINT IF EXISTS ${quoteIdentifier(fk.constraintName)};`,
        );
      }
    }
    for (const key of [...authTablesToRecreate].sort()) {
      const [schema, table] = key.split('.');
      statements.push(`DROP TABLE IF EXISTS ${qualifiedName(schema, table)};`);
    }
  }

  const tablesToCreate = [
    ...diff.missingTables.map((t) => t.prodMeta),
    ...[...authTablesToRecreate].sort().map((key) => prodByKey[key]).filter(Boolean),
  ];

  for (const tableMeta of tablesToCreate) {
    for (const col of tableMeta.columns ?? []) {
      const seq = extractSequenceName(col.defaultExpr);
      if (seq) statements.push(buildSequenceCreateSql(seq, tableMeta.schema));
    }
    const colDefs = (tableMeta.columns ?? []).map(buildColumnDefSql);
    if (Array.isArray(tableMeta.primaryKey) && tableMeta.primaryKey.length > 0) {
      const pkCols = tableMeta.primaryKey.map((pk) => quoteIdentifier(pk.name)).join(', ');
      colDefs.push(`PRIMARY KEY (${pkCols})`);
    }
    for (const chk of tableMeta.checkConstraints ?? []) {
      colDefs.push(`CONSTRAINT ${quoteIdentifier(chk.name)} ${chk.definition}`);
    }
    statements.push(`CREATE TABLE IF NOT EXISTS ${qualifiedName(tableMeta.schema, tableMeta.table)} (\n  ${colDefs.join(',\n  ')}\n);`);
  }

  const recreatedKeys = new Set(tablesToCreate.map((t) => `${t.schema}.${t.table}`));
  for (const item of diff.missingColumns) {
    const key = `${item.schema}.${item.table}`;
    if (recreatedKeys.has(key)) continue;
    const seq = extractSequenceName(item.column.defaultExpr);
    if (seq) statements.push(buildSequenceCreateSql(seq, item.schema));
    statements.push(`ALTER TABLE ${qualifiedName(item.schema, item.table)} ADD COLUMN IF NOT EXISTS ${buildColumnDefSql(item.column)};`);
  }

  for (const item of diff.typeMismatches) {
    if (item.schema === 'auth') continue;
    statements.push(
      `ALTER TABLE ${qualifiedName(item.schema, item.table)} ALTER COLUMN ${quoteIdentifier(item.column)} TYPE ${item.prodType} USING ${quoteIdentifier(item.column)}::${item.prodType};`,
    );
  }

  for (const item of diff.nullabilityMismatches ?? []) {
    if (recreatedKeys.has(`${item.schema}.${item.table}`)) continue;
    const action = item.prodNotNull ? 'SET NOT NULL' : 'DROP NOT NULL';
    statements.push(`ALTER TABLE ${qualifiedName(item.schema, item.table)} ALTER COLUMN ${quoteIdentifier(item.column)} ${action};`);
  }

  for (const item of diff.extraColumns ?? []) {
    if (recreatedKeys.has(`${item.schema}.${item.table}`)) continue;
    statements.push(`ALTER TABLE ${qualifiedName(item.schema, item.table)} DROP COLUMN IF EXISTS ${quoteIdentifier(item.column)} CASCADE;`);
  }

  for (const item of diff.checkMismatches ?? []) {
    if (recreatedKeys.has(`${item.schema}.${item.table}`)) continue;
    if (item.action === 'drop' || item.action === 'replace') {
      statements.push(`ALTER TABLE ${qualifiedName(item.schema, item.table)} DROP CONSTRAINT IF EXISTS ${quoteIdentifier(item.name)};`);
    }
    if ((item.action === 'add' || item.action === 'replace') && item.definition) {
      statements.push(`ALTER TABLE ${qualifiedName(item.schema, item.table)} ADD CONSTRAINT ${quoteIdentifier(item.name)} ${item.definition};`);
    }
  }

  return statements;
}

/** Build parameterized INSERT ... SELECT FROM jsonb_populate_recordset statement for a table. */
export function buildBatchInsertSql(tableMeta) {
  const insertableCols = (tableMeta.columns ?? []).filter((col) => !col.generatedKind);
  if (insertableCols.length === 0) {
    throw new Error(`表 ${tableMeta.schema}.${tableMeta.table} 没有可写入列`);
  }
  const hasIdentity = insertableCols.some((col) => col.identityGeneration === 'a' || col.identityGeneration === 'd');
  const colList = insertableCols.map((col) => quoteIdentifier(col.name)).join(', ');
  const overrideClause = hasIdentity ? 'OVERRIDING SYSTEM VALUE ' : '';
  const target = qualifiedName(tableMeta.schema, tableMeta.table);
  return `INSERT INTO ${target} (${colList}) ${overrideClause}SELECT ${colList} FROM jsonb_populate_recordset(NULL::${target}, $1::jsonb);`;
}
