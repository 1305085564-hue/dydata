import { createHash } from 'node:crypto';
import { TextDecoder } from 'node:util';

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function readLines(source) {
  const lines = [];
  let start = 0;
  let lineNumber = 1;
  while (start < source.length) {
    const newline = source.indexOf('\n', start);
    const end = newline === -1 ? source.length : newline + 1;
    const raw = source.slice(start, end);
    let content = newline === -1 ? raw : raw.slice(0, -1);
    if (content.endsWith('\r')) content = content.slice(0, -1);
    lines.push({ content, raw, lineNumber });
    start = end;
    lineNumber += 1;
  }
  return lines;
}

function skipWhitespace(text, index) {
  while (index < text.length && /\s/.test(text[index])) index += 1;
  return index;
}

function readIdentifier(text, start) {
  if (text[start] === '"') {
    let value = '';
    for (let i = start + 1; i < text.length;) {
      if (text[i] === '"' && text[i + 1] === '"') {
        value += '"';
        i += 2;
      } else if (text[i] === '"') {
        return { value, end: i + 1 };
      } else {
        value += text[i];
        i += 1;
      }
    }
    throw new SyntaxError('Unterminated quoted identifier in COPY header');
  }

  const match = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(text.slice(start));
  if (!match) throw new SyntaxError('Invalid identifier in COPY header');
  return { value: match[0].toLowerCase(), end: start + match[0].length };
}

function parseCopyHeader(header) {
  let i = skipWhitespace(header, 0);
  const keyword = /^COPY\b/i.exec(header.slice(i));
  if (!keyword) throw new SyntaxError('Invalid COPY header');
  i += keyword[0].length;
  if (!/\s/.test(header[i] ?? '')) throw new SyntaxError('Invalid COPY header');
  i = skipWhitespace(header, i);

  const schema = readIdentifier(header, i);
  i = schema.end;
  if (header[i] !== '.') throw new SyntaxError('COPY target must be schema-qualified');
  i += 1;
  const table = readIdentifier(header, i);
  i = skipWhitespace(header, table.end);
  if (header[i] !== '(') throw new SyntaxError('COPY header must list columns');
  i += 1;

  const columns = [];
  while (true) {
    i = skipWhitespace(header, i);
    if (header[i] === ')') {
      i += 1;
      break;
    }
    const column = readIdentifier(header, i);
    columns.push(column.value);
    i = skipWhitespace(header, column.end);
    if (header[i] === ',') {
      i += 1;
      continue;
    }
    if (header[i] === ')') {
      i += 1;
      break;
    }
    throw new SyntaxError('Invalid column list in COPY header');
  }

  if (columns.length === 0) throw new SyntaxError('COPY header must list at least one column');
  const suffix = header.slice(i);
  if (!/^\s+FROM\s+stdin\s*;\s*$/i.test(suffix)) {
    throw new SyntaxError('COPY header must end with FROM stdin;');
  }
  if (schema.value !== 'public') throw new SyntaxError('Only public COPY targets are supported');
  return { name: table.value, columns };
}

function appendLiteral(chunks, raw, start, end) {
  if (end > start) chunks.push(Buffer.from(raw.slice(start, end), 'utf8'));
}

function decodeCopyField(raw) {
  if (raw === '\\N') return null;

  const chunks = [];
  let literalStart = 0;
  for (let i = 0; i < raw.length;) {
    if (raw[i] !== '\\') {
      i += 1;
      continue;
    }

    appendLiteral(chunks, raw, literalStart, i);
    if (i + 1 >= raw.length) throw new SyntaxError('COPY field ends with an incomplete escape');
    const escape = raw[i + 1];
    const simpleEscapes = {
      b: 0x08,
      f: 0x0c,
      n: 0x0a,
      r: 0x0d,
      t: 0x09,
      v: 0x0b,
      '\\': 0x5c,
    };

    if (Object.hasOwn(simpleEscapes, escape)) {
      chunks.push(Buffer.from([simpleEscapes[escape]]));
      i += 2;
      literalStart = i;
      continue;
    }

    if (/[0-7]/.test(escape)) {
      let end = i + 1;
      while (end < raw.length && end < i + 4 && /[0-7]/.test(raw[end])) end += 1;
      const byte = Number.parseInt(raw.slice(i + 1, end), 8);
      if (byte > 0xff) throw new RangeError('COPY octal escape is outside the byte range');
      chunks.push(Buffer.from([byte]));
      i = end;
      literalStart = i;
      continue;
    }

    if (escape === 'x') {
      let end = i + 2;
      while (end < raw.length && end < i + 4 && /[0-9A-Fa-f]/.test(raw[end])) end += 1;
      if (end === i + 2) throw new SyntaxError('COPY hexadecimal escape has no digits');
      chunks.push(Buffer.from([Number.parseInt(raw.slice(i + 2, end), 16)]));
      i = end;
      literalStart = i;
      continue;
    }

    // PostgreSQL COPY text format drops an unrecognized escape's slash.
    const codePoint = raw.codePointAt(i + 1);
    const escapedChar = String.fromCodePoint(codePoint);
    chunks.push(Buffer.from(escapedChar, 'utf8'));
    i += 1 + escapedChar.length;
    literalStart = i;
  }

  appendLiteral(chunks, raw, literalStart, raw.length);
  const bytes = Buffer.concat(chunks);
  if (bytes.includes(0)) throw new TypeError('COPY field contains ASCII NUL, which PostgreSQL text cannot store');
  try {
    return utf8Decoder.decode(bytes);
  } catch {
    throw new TypeError('COPY field escapes do not form valid UTF-8');
  }
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function sqlString(value) {
  if (value.includes('\0')) throw new TypeError('COPY field contains ASCII NUL, which PostgreSQL text cannot store');
  let escaped = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (character === "'") escaped += "''";
    else if (character === '\\') escaped += '\\\\';
    else if (character === '\b') escaped += '\\b';
    else if (character === '\f') escaped += '\\f';
    else if (character === '\n') escaped += '\\n';
    else if (character === '\r') escaped += '\\r';
    else if (character === '\t') escaped += '\\t';
    else if (codePoint < 0x20 || codePoint === 0x7f) {
      escaped += `\\${codePoint.toString(8).padStart(3, '0')}`;
    } else {
      escaped += character;
    }
  }
  return `E'${escaped}'`;
}

function makeInsert(table, fields) {
  const columns = table.columns.map(quoteIdentifier).join(', ');
  const values = fields.map((value) => value === null ? 'NULL' : sqlString(value)).join(', ');
  return `INSERT INTO public.${quoteIdentifier(table.name)} (${columns}) OVERRIDING SYSTEM VALUE VALUES (${values});`;
}

function isTerminatedCommand(line) {
  return /;\s*(?:--[^\r\n]*)?$/.test(line);
}

function isSetConfigHeader(line) {
  return /^SELECT\s+pg_catalog\.set_config\s*\(\s*'search_path'\s*,\s*''\s*,\s*false\s*\)\s*;\s*$/i.test(line);
}

function isSequenceSetval(line) {
  return /^SELECT\s+pg_catalog\.setval\s*\(/i.test(line) && isTerminatedCommand(line);
}

/** Convert a pg_dump/pg_restore plain --data-only COPY stream into INSERTs. */
export function copyDumpToStatements(source) {
  if (typeof source !== 'string') throw new TypeError('COPY dump must be a UTF-8 string');

  const lines = readLines(source);
  const statements = [];
  const sequenceStatements = [];
  const tables = [];

  for (let index = 0; index < lines.length;) {
    const { content, lineNumber } = lines[index];
    const line = content.trim();
    if (line === '' || line.startsWith('--')) {
      index += 1;
      continue;
    }
    if (/^\\(?:restrict|unrestrict)\b(?:\s+\S+)?\s*$/i.test(line)) {
      index += 1;
      continue;
    }
    if (line.startsWith('\\')) {
      throw new SyntaxError(`Unknown psql meta command at line ${lineNumber}`);
    }

    if (/^COPY\b/i.test(line)) {
      const table = parseCopyHeader(line);
      const rawCopyLines = [];
      let rowCount = 0;
      index += 1;
      let terminated = false;
      while (index < lines.length) {
        const copyLine = lines[index];
        if (copyLine.content === '\\.') {
          terminated = true;
          index += 1;
          break;
        }
        const fields = copyLine.content.split('\t');
        if (fields.length !== table.columns.length) {
          throw new SyntaxError(`COPY field count mismatch for ${table.name} at line ${copyLine.lineNumber}`);
        }
        const decodedFields = fields.map(decodeCopyField);
        statements.push(makeInsert(table, decodedFields));
        rawCopyLines.push(copyLine.raw);
        rowCount += 1;
        index += 1;
      }
      if (!terminated) throw new SyntaxError(`COPY data for ${table.name} is missing the \\. terminator`);
      tables.push({
        name: table.name,
        columns: table.columns,
        rowCount,
        sha256ofrawCopy: createHash('sha256').update(rawCopyLines.join(''), 'utf8').digest('hex'),
      });
      continue;
    }

    if (/^SET\b/i.test(line)) {
      if (!isTerminatedCommand(line)) throw new SyntaxError(`Unterminated SET command at line ${lineNumber}`);
      index += 1;
      continue;
    }
    if (isSetConfigHeader(line)) {
      index += 1;
      continue;
    }
    if (/^SELECT\s+pg_catalog\.setval\b/i.test(line)) {
      if (!isSequenceSetval(line)) throw new SyntaxError(`Unterminated sequence setval at line ${lineNumber}`);
      sequenceStatements.push(line);
      index += 1;
      continue;
    }

    throw new SyntaxError(`Unknown command at line ${lineNumber}`);
  }

  return { statements, sequenceStatements, tables };
}
