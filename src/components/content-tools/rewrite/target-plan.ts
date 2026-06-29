export type TargetPlan =
  | {
      scope: 'paragraphs';
      paragraphIds: string[];
      confidence: number;
      reason: string;
    }
  | {
      scope: 'full_document';
      confidence: number;
      reason: string;
    }
  | {
      scope: 'need_confirmation';
      candidates: string[];
      question: string;
    };

export type TargetableParagraph = {
  paragraphId: string;
  position: number;
  isLocked?: boolean;
};

const FULL_DOCUMENT_PATTERN = /(全文|整篇|全部|通篇|整体|从头到尾|重新生成|重写全文|重写整篇|全篇)/u;
const LAST_PARAGRAPH_PATTERN = /(最后|末尾|结尾|尾段|末段)(一)?段/u;
const FIRST_PARAGRAPH_PATTERN = /(开头|开篇|首段|第一段|第1段)/u;

const CHINESE_DIGITS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

function normalizeParagraphs(paragraphs: TargetableParagraph[]) {
  return [...paragraphs].sort((left, right) => left.position - right.position);
}

function parseOrdinal(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;

  const numeric = Number.parseInt(text, 10);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;

  if (text === '十') return 10;
  if (text.includes('十')) {
    const [tensRaw, onesRaw] = text.split('十');
    const tens = tensRaw ? CHINESE_DIGITS[tensRaw] : 1;
    const ones = onesRaw ? CHINESE_DIGITS[onesRaw] : 0;
    if (tens && ones !== undefined) return tens * 10 + ones;
    return null;
  }

  return CHINESE_DIGITS[text] ?? null;
}

function parseCount(raw: string): number | null {
  return parseOrdinal(raw);
}

function findByOneBasedIndex(paragraphs: TargetableParagraph[], index: number) {
  return paragraphs[index - 1] ?? null;
}

function onlyUnlocked(paragraphs: TargetableParagraph[]) {
  return paragraphs.filter((paragraph) => !paragraph.isLocked);
}

function paragraphPlan(paragraphs: TargetableParagraph[], reason: string, confidence: number): TargetPlan {
  const unlocked = onlyUnlocked(paragraphs);
  if (unlocked.length === 0) {
    return {
      scope: 'need_confirmation',
      candidates: paragraphs.map((paragraph) => paragraph.paragraphId),
      question: '目标段落已锁定，请先解除锁定或选择其他段落。',
    };
  }
  return {
    scope: 'paragraphs',
    paragraphIds: unlocked.map((paragraph) => paragraph.paragraphId),
    confidence,
    reason,
  };
}

export function resolveLocalTargetPlan(input: {
  prompt: string;
  paragraphs: TargetableParagraph[];
  selectedParagraphIds?: Iterable<string>;
  lastSelectedParagraphId?: string | null;
}): TargetPlan {
  const prompt = input.prompt.trim();
  const paragraphs = normalizeParagraphs(input.paragraphs);
  const selectedIds = Array.from(input.selectedParagraphIds ?? []).filter(Boolean);

  if (selectedIds.length > 0) {
    const selected = paragraphs.filter((paragraph) => selectedIds.includes(paragraph.paragraphId));
    return paragraphPlan(selected, '用户已手动选中段落', 1);
  }

  if (paragraphs.length === 0) {
    return { scope: 'full_document', confidence: 1, reason: '当前还没有段落画布' };
  }

  const rangeMatch = prompt.match(/第\s*([一二两三四五六七八九十0-9]+)\s*(?:到|-|~|至)\s*([一二两三四五六七八九十0-9]+)\s*段/u);
  if (rangeMatch) {
    const start = parseOrdinal(rangeMatch[1]);
    const end = parseOrdinal(rangeMatch[2]);
    if (start && end) {
      const low = Math.min(start, end);
      const high = Math.max(start, end);
      return paragraphPlan(paragraphs.slice(low - 1, high), `用户指定第 ${low}-${high} 段`, 0.96);
    }
  }

  const singleMatch = prompt.match(/第\s*([一二两三四五六七八九十0-9]+)\s*段/u);
  if (singleMatch) {
    const index = parseOrdinal(singleMatch[1]);
    const target = index ? findByOneBasedIndex(paragraphs, index) : null;
    if (target) return paragraphPlan([target], `用户指定第 ${index} 段`, 0.98);
  }

  const firstCountMatch = prompt.match(/前\s*([一二两三四五六七八九十0-9]+)\s*段/u);
  if (firstCountMatch) {
    const count = parseCount(firstCountMatch[1]);
    if (count) return paragraphPlan(paragraphs.slice(0, count), `用户指定前 ${count} 段`, 0.94);
  }

  const lastCountMatch = prompt.match(/(?:后|最后)\s*([一二两三四五六七八九十0-9]+)\s*段/u);
  if (lastCountMatch) {
    const count = parseCount(lastCountMatch[1]);
    if (count) return paragraphPlan(paragraphs.slice(Math.max(0, paragraphs.length - count)), `用户指定后 ${count} 段`, 0.94);
  }

  if (LAST_PARAGRAPH_PATTERN.test(prompt)) {
    return paragraphPlan([paragraphs[paragraphs.length - 1]], '用户指定最后一段', 0.96);
  }

  if (FIRST_PARAGRAPH_PATTERN.test(prompt)) {
    return paragraphPlan([paragraphs[0]], '用户指定第一段', 0.96);
  }

  if (FULL_DOCUMENT_PATTERN.test(prompt)) {
    return { scope: 'full_document', confidence: 0.98, reason: '用户明确要求全文处理' };
  }

  if (input.lastSelectedParagraphId) {
    const target = paragraphs.find((paragraph) => paragraph.paragraphId === input.lastSelectedParagraphId);
    if (target) {
      return paragraphPlan([target], '使用最近聚焦段落', 0.72);
    }
  }

  return {
    scope: 'need_confirmation',
    candidates: paragraphs.map((paragraph) => paragraph.paragraphId),
    question: '没有识别到要修改哪一段，请先点选右侧段落，或在指令里写明“第几段”。',
  };
}
