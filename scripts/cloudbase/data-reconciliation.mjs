const DEFAULT_MAX_BYTES = 512 * 1024;
const HASH_WIDTH = 16;

function quoteIdentifier(identifier) {
  if (typeof identifier !== 'string' || identifier.length === 0 || identifier.includes('\0')) {
    throw new TypeError('identifier must be a non-empty string without NUL');
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

function qualifiedTable(name) {
  return `public.${quoteIdentifier(name)}`;
}

function quoteSqlString(value) {
  if (typeof value !== 'string' || value.includes('\0')) throw new TypeError('SQL string key must be a string without NUL');
  return `'${value.replaceAll("'", "''")}'`;
}

function buildHashSum(rowExpression, start, generatedColumns = []) {
  let rowJson = `to_jsonb(${rowExpression})`;
  for (const column of generatedColumns) rowJson = `(${rowJson} - ${quoteSqlString(column)})`;
  return `coalesce(sum(('x'||substr(md5(${rowJson}::text),${start},${HASH_WIDTH}))::bit(64)::bigint),0)::text`;
}

function expectedQueryParts(tableName, generatedColumns = []) {
  const tableType = qualifiedTable(tableName);
  const prefix = `SELECT count(*)::text AS n, ${buildHashSum('r', 1, generatedColumns)} AS h1, ${buildHashSum('r', 17, generatedColumns)} AS h2 FROM (VALUES\n  `;
  const suffix = `\n) AS v(r);`;
  return { prefix, suffix, tableType };
}

function skipWhitespace(source, index) {
  while (index < source.length && /\s/.test(source[index])) index += 1;
  return index;
}

function readIdentifier(source, index) {
  index = skipWhitespace(source, index);
  if (source[index] === '"') {
    let value = '';
    for (let cursor = index + 1; cursor < source.length; cursor += 1) {
      if (source[cursor] !== '"') {
        value += source[cursor];
        continue;
      }
      if (source[cursor + 1] === '"') {
        value += '"';
        cursor += 1;
        continue;
      }
      if (value.length === 0) throw new SyntaxError('empty SQL identifier');
      return { value, end: cursor + 1 };
    }
    throw new SyntaxError('unterminated quoted SQL identifier');
  }

  const match = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(source.slice(index));
  if (!match) throw new SyntaxError('invalid SQL identifier');
  return { value: match[0], end: index + match[0].length };
}

function parseIdentifierList(source, index) {
  const columns = [];
  let cursor = index;
  while (true) {
    const identifier = readIdentifier(source, cursor);
    columns.push(identifier.value);
    cursor = skipWhitespace(source, identifier.end);
    if (source[cursor] === ')') return { columns, end: cursor + 1 };
    if (source[cursor] !== ',') throw new SyntaxError('invalid INSERT column list');
    cursor += 1;
  }
}

function parseGeneratedValueList(source, start) {
  let cursor = start;
  let count = 0;
  const values = [];
  while (true) {
    cursor = skipWhitespace(source, cursor);
    const valueStart = cursor;
    if (/^NULL\b/i.test(source.slice(cursor))) {
      cursor += 4;
    } else if ((source[cursor] === 'E' || source[cursor] === 'e') && source[cursor + 1] === "'") {
      cursor += 2;
      let closed = false;
      while (cursor < source.length) {
        if (source[cursor] === '\\') {
          cursor += Math.min(2, source.length - cursor);
        } else if (source[cursor] === "'" && source[cursor + 1] === "'") {
          cursor += 2;
        } else if (source[cursor] === "'") {
          cursor += 1;
          closed = true;
          break;
        } else {
          cursor += 1;
        }
      }
      if (!closed) throw new SyntaxError('unterminated INSERT value literal');
    } else {
      throw new SyntaxError('INSERT values must come from the COPY converter');
    }

    values.push(source.slice(valueStart, cursor));
    count += 1;
    cursor = skipWhitespace(source, cursor);
    if (source[cursor] === ')') return { count, end: cursor + 1, values };
    if (source[cursor] !== ',') throw new SyntaxError('INSERT values must contain one expression list');
    cursor += 1;
  }
}

function parseConvertedInsert(statement, expectedTable) {
  if (typeof statement !== 'string') throw new TypeError('INSERT statement must be a string');
  const source = statement.trim();
  if (!/^INSERT\s+INTO\s+/i.test(source) || !source.endsWith(';')) {
    throw new SyntaxError('expected one terminated INSERT statement');
  }

  let cursor = /^INSERT\s+INTO\s+/i.exec(source)[0].length;
  const schema = readIdentifier(source, cursor);
  cursor = skipWhitespace(source, schema.end);
  if (source[cursor] !== '.') throw new SyntaxError('INSERT target must use the public schema');
  const table = readIdentifier(source, cursor + 1);
  if (schema.value !== 'public' || table.value !== expectedTable.name) {
    throw new SyntaxError(`INSERT target does not match table ${expectedTable.name}`);
  }

  cursor = skipWhitespace(source, table.end);
  if (source[cursor] !== '(') throw new SyntaxError('INSERT target columns are required');
  const parsedColumns = parseIdentifierList(source, cursor + 1);
  if (parsedColumns.columns.length !== expectedTable.columns.length
    || parsedColumns.columns.some((column, index) => column !== expectedTable.columns[index])) {
    throw new SyntaxError(`INSERT columns do not match COPY column order for ${expectedTable.name}`);
  }

  cursor = parsedColumns.end;
  const valuesPrefix = /^\s+OVERRIDING\s+SYSTEM\s+VALUE\s+VALUES\s*\(/i.exec(source.slice(cursor));
  if (!valuesPrefix) throw new SyntaxError('expected INSERT OVERRIDING SYSTEM VALUE VALUES');
  cursor += valuesPrefix[0].length;
  const parsedValues = parseGeneratedValueList(source, cursor);
  if (source.slice(parsedValues.end).trim() !== ';') throw new SyntaxError('expected a single INSERT statement');
  const valueCount = parsedValues.count;
  if (valueCount !== expectedTable.columns.length) {
    throw new SyntaxError(`INSERT field count mismatch for ${expectedTable.name}`);
  }

  let rowValues = parsedValues.values;
  if (expectedTable.typeColumns) {
    const generated = new Set(expectedTable.generatedColumns);
    let copyIndex = 0;
    rowValues = expectedTable.typeColumns.map((column) => (
      generated.has(column) ? 'NULL' : parsedValues.values[copyIndex++]
    ));
  }
  return `ROW(${rowValues.join(', ')})::${qualifiedTable(expectedTable.name)}`;
}

function readInsertTargetName(statement) {
  if (typeof statement !== 'string') throw new TypeError('INSERT statement must be a string');
  const prefix = /^INSERT\s+INTO\s+/i.exec(statement.trim());
  if (!prefix) throw new SyntaxError('expected one INSERT statement');
  let cursor = prefix[0].length;
  const schema = readIdentifier(statement.trim(), cursor);
  cursor = skipWhitespace(statement.trim(), schema.end);
  if (statement.trim()[cursor] !== '.') throw new SyntaxError('INSERT target must use the public schema');
  const table = readIdentifier(statement.trim(), cursor + 1);
  if (schema.value !== 'public') throw new SyntaxError('INSERT target must use the public schema');
  return table.value;
}

function normalizeParsedTables(parsed) {
  if (!parsed || !Array.isArray(parsed.statements) || !Array.isArray(parsed.tables)) {
    throw new TypeError('parsed must contain statements and tables arrays');
  }
  // gate:transient-map 本次对账调用的临时表名索引，函数返回后释放
  const byName = new Map();
  const tables = [];
  for (const metadata of parsed.tables) {
    if (!metadata || typeof metadata.name !== 'string' || !Array.isArray(metadata.columns)) {
      throw new TypeError('table metadata must contain a name and columns');
    }
    quoteIdentifier(metadata.name);
    if (!Number.isSafeInteger(metadata.rowCount) || metadata.rowCount < 0) {
      throw new RangeError(`invalid rowCount for ${metadata.name}`);
    }
    if (metadata.columns.length === 0) throw new TypeError(`table ${metadata.name} has no COPY columns`);
    metadata.columns.forEach(quoteIdentifier);
    if (new Set(metadata.columns).size !== metadata.columns.length) {
      throw new SyntaxError(`duplicate COPY columns for ${metadata.name}`);
    }

    const hasTypeColumns = metadata.typeColumns !== undefined;
    if (hasTypeColumns && (!Array.isArray(metadata.typeColumns) || metadata.typeColumns.length === 0)) {
      throw new TypeError(`typeColumns for ${metadata.name} must be a non-empty array`);
    }
    if (metadata.generatedColumns !== undefined && !Array.isArray(metadata.generatedColumns)) {
      throw new TypeError(`generatedColumns for ${metadata.name} must be an array`);
    }
    const declaredGenerated = metadata.generatedColumns ?? [];
    declaredGenerated.forEach(quoteIdentifier);
    if (new Set(declaredGenerated).size !== declaredGenerated.length) {
      throw new SyntaxError(`duplicate generated columns for ${metadata.name}`);
    }
    if (declaredGenerated.length > 0 && !hasTypeColumns) {
      throw new TypeError(`typeColumns are required when generatedColumns are provided for ${metadata.name}`);
    }

    let generatedColumns = [];
    let typeColumns;
    if (hasTypeColumns) {
      typeColumns = [...metadata.typeColumns];
      typeColumns.forEach(quoteIdentifier);
      if (new Set(typeColumns).size !== typeColumns.length) {
        throw new SyntaxError(`duplicate typeColumns for ${metadata.name}`);
      }
      const typeColumnSet = new Set(typeColumns);
      if (declaredGenerated.some((column) => !typeColumnSet.has(column))) {
        throw new SyntaxError(`generatedColumns are not present in typeColumns for ${metadata.name}`);
      }
      const copiedTypeColumns = typeColumns.filter((column) => !declaredGenerated.includes(column));
      if (copiedTypeColumns.length !== metadata.columns.length
        || copiedTypeColumns.some((column, index) => column !== metadata.columns[index])) {
        throw new SyntaxError(`COPY column order does not match typeColumns for ${metadata.name}`);
      }
      generatedColumns = typeColumns.filter((column) => declaredGenerated.includes(column));
    }

    const existing = byName.get(metadata.name);
    if (existing) {
      if (existing.columns.length !== metadata.columns.length
        || existing.columns.some((column, index) => column !== metadata.columns[index])) {
        throw new SyntaxError(`inconsistent COPY column order for ${metadata.name}`);
      }
      const existingHasTypeColumns = existing.typeColumns !== undefined;
      if (existingHasTypeColumns !== hasTypeColumns
        || (hasTypeColumns && (existing.typeColumns.length !== typeColumns.length
          || existing.typeColumns.some((column, index) => column !== typeColumns[index])
          || existing.generatedColumns.length !== generatedColumns.length
          || existing.generatedColumns.some((column, index) => column !== generatedColumns[index])))) {
        throw new SyntaxError(`inconsistent target type metadata for ${metadata.name}`);
      }
      existing.rowCount += metadata.rowCount;
    } else {
      const table = {
        name: metadata.name,
        columns: [...metadata.columns],
        ...(hasTypeColumns ? { typeColumns, generatedColumns } : {}),
        rowCount: metadata.rowCount,
        rows: [],
      };
      byName.set(table.name, table);
      tables.push(table);
    }
  }

  for (const statement of parsed.statements) {
    const tableName = readInsertTargetName(statement);
    const table = byName.get(tableName);
    if (!table) throw new SyntaxError(`INSERT target has no COPY metadata: ${tableName}`);
    table.rows.push(parseConvertedInsert(statement, table));
  }

  for (const table of tables) {
    if (table.rows.length !== table.rowCount) {
      throw new RangeError(`rowCount mismatch for ${table.name}: metadata=${table.rowCount}, INSERTs=${table.rows.length}`);
    }
  }
  return tables;
}

function buildExpectedQueryEntries(tables, maxBytes, measureBytes = sql => Buffer.byteLength(sql, 'utf8')) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new RangeError('maxBytes must be a positive safe integer');
  const queries = [];
  for (const table of tables) {
    if (table.rows.length === 0) continue;
    const { prefix, suffix } = expectedQueryParts(table.name, table.generatedColumns ?? []);
    const baseBytes = measureBytes(prefix + suffix);
    const separator = ',\n  ';
    const separatorBytes = measureBytes(separator);
    let chunk = [];
    let chunkBytes = baseBytes;
    const flush = () => {
      if (chunk.length === 0) return;
      queries.push({ tableName: table.name, sql: prefix + chunk.join(separator) + suffix });
      chunk = [];
      chunkBytes = baseBytes;
    };

    for (const row of table.rows) {
      const rowBytes = measureBytes(`(${row})`);
      const candidateBytes = chunkBytes + (chunk.length ? separatorBytes : 0) + rowBytes;
      if (candidateBytes > maxBytes && chunk.length > 0) flush();
      const singleRowBytes = chunkBytes + (chunk.length ? separatorBytes : 0) + rowBytes;
      if (singleRowBytes > maxBytes) throw new RangeError(`one row for ${table.name} exceeds maxBytes`);
      chunkBytes = singleRowBytes;
      chunk.push(`(${row})`);
    }
    flush();
  }
  return queries;
}

/** Build expected-row queries from the very INSERTs generated for the archive. */
export function buildExpectedQueries({ parsed, maxBytes = DEFAULT_MAX_BYTES, measureBytes }) {
  const tables = normalizeParsedTables(parsed);
  return buildExpectedQueryEntries(tables, maxBytes, measureBytes).map(({ sql }) => sql);
}

/** Build a content-summary query over the actual CloudBase table. */
export function buildActualQuery(table) {
  if (!table || typeof table.name !== 'string') throw new TypeError('table must contain a name');
  const target = qualifiedTable(table.name);
  const generatedColumns = table.generatedColumns ?? [];
  if (!Array.isArray(generatedColumns)) throw new TypeError('generatedColumns must be an array');
  generatedColumns.forEach(quoteIdentifier);
  return `SELECT count(*)::text AS n, ${buildHashSum('t', 1, generatedColumns)} AS h1, ${buildHashSum('t', 17, generatedColumns)} AS h2 FROM ${target} AS t;`;
}

function parseExecuteResult(result, context) {
  if (!result || !Array.isArray(result.Rows) || result.Rows.length !== 1 || typeof result.Rows[0] !== 'string') {
    throw new TypeError(`${context} must return Rows with one JSON tuple`);
  }
  let values;
  try {
    values = JSON.parse(result.Rows[0]);
  } catch {
    throw new SyntaxError(`${context} returned an invalid JSON tuple`);
  }
  if (!Array.isArray(values) || values.length !== 3) throw new TypeError(`${context} tuple must contain count, h1, and h2`);
  const parsed = values.map((value, index) => {
    const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
    if (!/^-?\d+$/.test(text)) throw new TypeError(`${context} value ${index} is not an integer`);
    return BigInt(text);
  });
  if (parsed[0] < 0n) throw new RangeError(`${context} returned a negative row count`);
  return parsed;
}

function metricsToObject(metrics) {
  return { count: metrics[0].toString(), h1: metrics[1].toString(), h2: metrics[2].toString() };
}

/** Compare archive-derived rows with the rows in the target database. */
export async function reconcileTables({ parsed, execute, maxBytes = DEFAULT_MAX_BYTES, measureBytes }) {
  if (typeof execute !== 'function') throw new TypeError('execute must be a function');
  const tables = normalizeParsedTables(parsed);
  const expectedQueries = buildExpectedQueryEntries(tables, maxBytes, measureBytes);
  const results = [];
  let queriesExecuted = 0;

  for (const table of tables) {
    const expected = [0n, 0n, 0n];
    const tableQueries = expectedQueries.filter(({ tableName }) => tableName === table.name);
    for (const { sql } of tableQueries) {
      const metrics = parseExecuteResult(await execute(sql), `expected query for ${table.name}`);
      expected[0] += metrics[0];
      expected[1] += metrics[1];
      expected[2] += metrics[2];
      queriesExecuted += 1;
    }

    const actualQuery = buildActualQuery(table);
    const actual = parseExecuteResult(await execute(actualQuery), `actual query for ${table.name}`);
    queriesExecuted += 1;
    const expectedObject = metricsToObject(expected);
    const actualObject = metricsToObject(actual);
    const countMatches = expected[0] === actual[0];
    const hashesMatch = expected[1] === actual[1] && expected[2] === actual[2];
    const sourceRowCountMatches = expected[0] === BigInt(table.rowCount);
    results.push({
      name: table.name,
      expected: expectedObject,
      actual: actualObject,
      countMatches,
      hashesMatch,
      sourceRowCountMatches,
      matches: countMatches && hashesMatch && sourceRowCountMatches,
    });
  }

  return { ok: results.every((table) => table.matches), tables: results, queriesExecuted };
}
