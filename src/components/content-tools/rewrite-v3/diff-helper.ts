export interface DiffToken {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
}

/**
 * 简单的字词/字符级 Diff。
 * 对于中文按汉字进行切分；对于英文单词或连续标点，我们合并切分。
 */
export function diffWords(oldStr: string, newStr: string): DiffToken[] {
  if (!oldStr) {
    return [{ type: 'added', value: newStr }];
  }
  if (!newStr) {
    return [{ type: 'removed', value: oldStr }];
  }

  const tokenize = (str: string): string[] => {
    // 匹配英文字母与数字、中文字符、非空标点或空白字符
    const regex = /[a-zA-Z0-9]+|[\u4e00-\u9fa5]|[^a-zA-Z0-9\u4e00-\u9fa5\s]+|\s+/g;
    return str.match(regex) || [];
  };

  const oldTokens = tokenize(oldStr);
  const newTokens = tokenize(newStr);

  const oldLen = oldTokens.length;
  const newLen = newTokens.length;

  // LCS 动态规划表格
  const dp: number[][] = Array.from({ length: oldLen + 1 }, () =>
    Array(newLen + 1).fill(0)
  );

  for (let i = 1; i <= oldLen; i++) {
    const ot = oldTokens[i - 1];
    for (let j = 1; j <= newLen; j++) {
      if (ot === newTokens[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 回溯计算 diff 序列
  const result: DiffToken[] = [];
  let i = oldLen;
  let j = newLen;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      result.unshift({ type: 'unchanged', value: oldTokens[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', value: newTokens[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      result.unshift({ type: 'removed', value: oldTokens[i - 1] });
      i--;
    }
  }

  // 合并相邻且类型相同的 tokens 以压缩尺寸提高渲染性能
  const merged: DiffToken[] = [];
  for (const token of result) {
    const last = merged.at(-1);
    if (last && last.type === token.type) {
      last.value += token.value;
    } else {
      merged.push({ ...token });
    }
  }

  return merged;
}
