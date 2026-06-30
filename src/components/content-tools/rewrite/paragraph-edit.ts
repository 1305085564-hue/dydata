export function normalizeParagraphEditContent(content: string) {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';

  const duplicateCollapsed = collapseExactDuplicatedBlock(normalized);
  return duplicateCollapsed ?? normalized;
}

function collapseExactDuplicatedBlock(content: string) {
  const lines = content.split('\n');

  for (let index = 1; index < lines.length; index += 1) {
    const left = lines.slice(0, index).join('\n').trim();
    const right = lines.slice(index).join('\n').trim();

    if (left.length >= 40 && left === right) {
      return left;
    }
  }

  return null;
}
