const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UUID_PATH_RULES = [
  /^\/api\/admin\/content-comparison\/([^/]+)$/,
  /^\/api\/admin\/content-feedback-cards\/([^/]+)$/,
  /^\/api\/admin\/video-assets\/([^/]+)$/,
  /^\/api\/content-tools\/rewrite\/conversations\/([^/]+)\/messages$/,
  /^\/api\/dashboard\/content-feedback-cards\/([^/]+)$/,
  /^\/api\/notifications\/([^/]+)\/(?:done|read)$/,
  /^\/api\/rewrite\/conversations\/([^/]+)\/skills(?:\/([^/]+))?$/,
  /^\/api\/rewrite\/documents\/([^/]+)(?:\/(?:history|paragraphs|revisions))?$/,
  /^\/api\/rewrite\/paragraphs\/([^/]+)\/undo$/,
  /^\/api\/rewrite\/skills\/([^/]+)$/,
  /^\/api\/topics\/sub-topics\/((?!(?:suggest|from-recommendation)$)[^/]+)(?:\/(?:claim|claims|return|start-scripting|works))?$/,
  /^\/api\/work-submissions\/([^/]+)$/,
] as const;

export function hasInvalidUuidPathParameter(pathname: string) {
  for (const rule of UUID_PATH_RULES) {
    const match = pathname.match(rule);
    if (!match) continue;
    return match.slice(1).filter(Boolean).some((value) => !UUID_PATTERN.test(value));
  }
  return false;
}

export const __internal = { UUID_PATTERN, UUID_PATH_RULES };
