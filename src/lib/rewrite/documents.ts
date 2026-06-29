// Dynamic v2 tables are not in the generated Supabase type map yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MinimalClient = any;

export type DocumentSourceType = "ai_generation" | "user_edit" | "paragraph_patch" | "variant_adopt" | "fork";
export type RevisionStatus = "pending" | "completed" | "failed" | "aborted";
export type ParagraphSourceType = "ai" | "user" | "original";

export type DocumentRow = {
  id: string;
  conversation_id: string;
  title: string;
  current_revision_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentRevisionRow = {
  id: string;
  document_id: string;
  parent_revision_id: string | null;
  source_type: DocumentSourceType;
  status: RevisionStatus;
  generation_run_id: string | null;
  full_content: string | null;
  message_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export type DocumentParagraphRow = {
  id: string;
  revision_id: string;
  paragraph_id: string;
  position: number;
  content: string;
  is_locked: boolean;
  source_type: ParagraphSourceType;
  created_at: string;
};

export type VariantRow = {
  id: string;
  document_id: string;
  generation_run_id: string;
  target_paragraph_ids: string[];
  content: string;
  label: string | null;
  is_adopted: boolean;
  adopted_revision_id: string | null;
  created_at: string;
};

export type Document = {
  id: string;
  conversationId: string;
  title: string;
  currentRevisionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DocumentRevision = {
  id: string;
  documentId: string;
  parentRevisionId: string | null;
  sourceType: DocumentSourceType;
  status: RevisionStatus;
  generationRunId: string | null;
  fullContent: string | null;
  messageId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

export type DocumentParagraph = {
  id: string;
  revisionId: string;
  paragraphId: string;
  position: number;
  content: string;
  isLocked: boolean;
  sourceType: ParagraphSourceType;
  createdAt: string;
};

export type Variant = {
  id: string;
  documentId: string;
  generationRunId: string;
  targetParagraphIds: string[];
  content: string;
  label: string | null;
  isAdopted: boolean;
  adoptedRevisionId: string | null;
  createdAt: string;
};

function toDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    title: row.title,
    currentRevisionId: row.current_revision_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDocumentRevision(row: DocumentRevisionRow): DocumentRevision {
  return {
    id: row.id,
    documentId: row.document_id,
    parentRevisionId: row.parent_revision_id,
    sourceType: row.source_type,
    status: row.status,
    generationRunId: row.generation_run_id,
    fullContent: row.full_content,
    messageId: row.message_id,
    meta: row.meta,
    createdAt: row.created_at,
  };
}

function toDocumentParagraph(row: DocumentParagraphRow): DocumentParagraph {
  return {
    id: row.id,
    revisionId: row.revision_id,
    paragraphId: row.paragraph_id,
    position: row.position,
    content: row.content,
    isLocked: row.is_locked,
    sourceType: row.source_type,
    createdAt: row.created_at,
  };
}

function toVariant(row: VariantRow): Variant {
  return {
    id: row.id,
    documentId: row.document_id,
    generationRunId: row.generation_run_id,
    targetParagraphIds: row.target_paragraph_ids,
    content: row.content,
    label: row.label,
    isAdopted: row.is_adopted,
    adoptedRevisionId: row.adopted_revision_id,
    createdAt: row.created_at,
  };
}

export async function getOrCreateDocument(
  service: MinimalClient,
  conversationId: string,
): Promise<Document> {
  const { data: existing } = await service
    .from("rewrite_documents")
    .select("id, conversation_id, title, current_revision_id, created_at, updated_at")
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (existing) {
    return toDocument(existing as DocumentRow);
  }

  const { data: created, error } = await service
    .from("rewrite_documents")
    .insert({
      conversation_id: conversationId,
      title: "未命名文档",
    })
    .select("id, conversation_id, title, current_revision_id, created_at, updated_at")
    .single();

  if (error || !created) {
    throw new Error(error?.message ?? "创建 document 失败");
  }

  return toDocument(created as DocumentRow);
}

export async function getDocumentByConversationId(
  service: MinimalClient,
  conversationId: string,
): Promise<Document | null> {
  const { data, error } = await service
    .from("rewrite_documents")
    .select("id, conversation_id, title, current_revision_id, created_at, updated_at")
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? toDocument(data as DocumentRow) : null;
}

export async function updateDocumentTitle(
  service: MinimalClient,
  documentId: string,
  title: string,
): Promise<void> {
  const { error } = await service
    .from("rewrite_documents")
    .update({
      title,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function createRevision(
  service: MinimalClient,
  input: {
    documentId: string;
    parentRevisionId?: string | null;
    sourceType: DocumentSourceType;
    status?: RevisionStatus;
    generationRunId?: string | null;
    fullContent?: string | null;
    messageId?: string | null;
    meta?: Record<string, unknown> | null;
  },
): Promise<DocumentRevision> {
  const { data, error } = await service
    .from("rewrite_document_revisions")
    .insert({
      document_id: input.documentId,
      parent_revision_id: input.parentRevisionId ?? null,
      source_type: input.sourceType,
      status: input.status ?? "pending",
      generation_run_id: input.generationRunId ?? null,
      full_content: input.fullContent ?? null,
      message_id: input.messageId ?? null,
      meta: input.meta ?? null,
    })
    .select("id, document_id, parent_revision_id, source_type, status, generation_run_id, full_content, message_id, meta, created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "创建 revision 失败");
  }

  return toDocumentRevision(data as DocumentRevisionRow);
}

export async function updateRevisionStatus(
  service: MinimalClient,
  revisionId: string,
  status: RevisionStatus,
  fullContent?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (fullContent !== undefined) {
    patch.full_content = fullContent;
  }

  const { error } = await service
    .from("rewrite_document_revisions")
    .update(patch)
    .eq("id", revisionId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function setCurrentRevision(
  service: MinimalClient,
  documentId: string,
  revisionId: string,
): Promise<void> {
  const { data: revision } = await service
    .from("rewrite_document_revisions")
    .select("status")
    .eq("id", revisionId)
    .single();

  if (!revision || (revision as { status: string }).status !== "completed") {
    throw new Error("只能将 completed 状态的 revision 设为 current");
  }

  const { error } = await service
    .from("rewrite_documents")
    .update({
      current_revision_id: revisionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getRevisionById(
  service: MinimalClient,
  revisionId: string,
): Promise<DocumentRevision | null> {
  const { data, error } = await service
    .from("rewrite_document_revisions")
    .select("id, document_id, parent_revision_id, source_type, status, generation_run_id, full_content, message_id, meta, created_at")
    .eq("id", revisionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? toDocumentRevision(data as DocumentRevisionRow) : null;
}

export async function listRevisionsByDocumentId(
  service: MinimalClient,
  documentId: string,
  limit = 50,
): Promise<DocumentRevision[]> {
  const { data, error } = await service
    .from("rewrite_document_revisions")
    .select("id, document_id, parent_revision_id, source_type, status, generation_run_id, full_content, message_id, meta, created_at")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as DocumentRevisionRow[]).map(toDocumentRevision);
}

export function splitIntoParagraphs(content: string): string[] {
  const rawParagraphs = content
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const merged: string[] = [];
  for (let i = 0; i < rawParagraphs.length; i++) {
    const current = rawParagraphs[i];
    if (
      i < rawParagraphs.length - 1 &&
      current.length <= 15 &&
      (current.endsWith(':') || current.endsWith('：') || !/[。！？!?]/.test(current))
    ) {
      merged.push(current + '\n' + rawParagraphs[i + 1]);
      i++;
    } else {
      merged.push(current);
    }
  }
  return merged;
}

export async function createParagraphs(
  service: MinimalClient,
  input: {
    revisionId: string;
    paragraphs: Array<{
      paragraphId: string;
      position: number;
      content: string;
      isLocked?: boolean;
      sourceType?: ParagraphSourceType;
    }>;
  },
): Promise<DocumentParagraph[]> {
  const rows = input.paragraphs.map((p) => ({
    revision_id: input.revisionId,
    paragraph_id: p.paragraphId,
    position: p.position,
    content: p.content,
    is_locked: p.isLocked ?? false,
    source_type: p.sourceType ?? "ai",
  }));

  const { data, error } = await service
    .from("rewrite_document_paragraphs")
    .insert(rows)
    .select("id, revision_id, paragraph_id, position, content, is_locked, source_type, created_at");

  if (error || !data) {
    throw new Error(error?.message ?? "创建 paragraphs 失败");
  }

  return ((data ?? []) as DocumentParagraphRow[]).map(toDocumentParagraph);
}

export async function getParagraphsByRevisionId(
  service: MinimalClient,
  revisionId: string,
): Promise<DocumentParagraph[]> {
  const { data, error } = await service
    .from("rewrite_document_paragraphs")
    .select("id, revision_id, paragraph_id, position, content, is_locked, source_type, created_at")
    .eq("revision_id", revisionId)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as DocumentParagraphRow[]).map(toDocumentParagraph);
}

export async function updateParagraphLockStatus(
  service: MinimalClient,
  revisionId: string,
  paragraphId: string,
  isLocked: boolean,
): Promise<void> {
  const { error } = await service
    .from("rewrite_document_paragraphs")
    .update({ is_locked: isLocked })
    .eq("revision_id", revisionId)
    .eq("paragraph_id", paragraphId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function createVariant(
  service: MinimalClient,
  input: {
    documentId: string;
    generationRunId: string;
    targetParagraphIds: string[];
    content: string;
    label?: string | null;
  },
): Promise<Variant> {
  const { data, error } = await service
    .from("rewrite_variants")
    .insert({
      document_id: input.documentId,
      generation_run_id: input.generationRunId,
      target_paragraph_ids: input.targetParagraphIds,
      content: input.content,
      label: input.label ?? null,
      is_adopted: false,
    })
    .select("id, document_id, generation_run_id, target_paragraph_ids, content, label, is_adopted, adopted_revision_id, created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "创建 variant 失败");
  }

  return toVariant(data as VariantRow);
}

export async function adoptVariant(
  service: MinimalClient,
  variantId: string,
  adoptedRevisionId: string,
): Promise<void> {
  const { error } = await service
    .from("rewrite_variants")
    .update({
      is_adopted: true,
      adopted_revision_id: adoptedRevisionId,
    })
    .eq("id", variantId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function listVariantsByDocumentId(
  service: MinimalClient,
  documentId: string,
  limit = 20,
): Promise<Variant[]> {
  const { data, error } = await service
    .from("rewrite_variants")
    .select("id, document_id, generation_run_id, target_paragraph_ids, content, label, is_adopted, adopted_revision_id, created_at")
    .eq("document_id", documentId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as VariantRow[]).map(toVariant);
}

export async function getCurrentDocumentSnapshot(
  service: MinimalClient,
  conversationId: string,
): Promise<{
  document: Document;
  revision: DocumentRevision | null;
  paragraphs: DocumentParagraph[];
} | null> {
  const document = await getDocumentByConversationId(service, conversationId);
  if (!document) {
    return null;
  }

  if (!document.currentRevisionId) {
    return {
      document,
      revision: null,
      paragraphs: [],
    };
  }

  const revision = await getRevisionById(service, document.currentRevisionId);
  if (!revision) {
    return {
      document,
      revision: null,
      paragraphs: [],
    };
  }

  const paragraphs = await getParagraphsByRevisionId(service, revision.id);

  return {
    document,
    revision,
    paragraphs,
  };
}

export async function createUserEditRevision(
  service: MinimalClient,
  input: {
    conversationId: string;
    userId: string; // Used for potential audit or auth
    paragraphId: string;
    newContent: string;
  },
): Promise<DocumentRevision> {
  const snapshot = await getCurrentDocumentSnapshot(service, input.conversationId);
  if (!snapshot || !snapshot.revision) {
    throw new Error("找不到可供修改的当前文档版本");
  }

  const targetIndex = snapshot.paragraphs.findIndex(p => p.paragraphId === input.paragraphId);
  if (targetIndex === -1) {
    throw new Error("未找到目标段落");
  }

  const newRevision = await createRevision(service, {
    documentId: snapshot.document.id,
    parentRevisionId: snapshot.revision.id,
    sourceType: "user_edit",
    status: "pending",
  });

  const newParagraphs = snapshot.paragraphs.map((p) => {
    if (p.paragraphId === input.paragraphId) {
      return {
        paragraphId: p.paragraphId,
        position: p.position,
        content: input.newContent,
        isLocked: p.isLocked,
        sourceType: "user" as ParagraphSourceType,
      };
    }
    return {
      paragraphId: p.paragraphId,
      position: p.position,
      content: p.content,
      isLocked: p.isLocked,
      sourceType: p.sourceType,
    };
  });

  await createParagraphs(service, {
    revisionId: newRevision.id,
    paragraphs: newParagraphs,
  });

  const fullContent = newParagraphs.map(p => p.content).join("\n\n");
  await updateRevisionStatus(service, newRevision.id, "completed", fullContent);
  await setCurrentRevision(service, snapshot.document.id, newRevision.id);

  return {
    ...newRevision,
    status: "completed",
    fullContent,
  };
}

export async function createParagraphUndoRevision(
  service: MinimalClient,
  input: {
    conversationId: string;
    paragraphId: string;
  },
): Promise<DocumentRevision> {
  const snapshot = await getCurrentDocumentSnapshot(service, input.conversationId);
  if (!snapshot || !snapshot.revision || !snapshot.revision.parentRevisionId) {
    throw new Error("找不到可供撤销的历史版本");
  }

  const parentParagraphs = await getParagraphsByRevisionId(service, snapshot.revision.parentRevisionId);
  
  const currentTarget = snapshot.paragraphs.find(p => p.paragraphId === input.paragraphId);
  if (!currentTarget) {
    throw new Error("当前版本未找到目标段落");
  }

  const parentTarget = parentParagraphs.find(p => p.paragraphId === input.paragraphId) || 
                       parentParagraphs.find(p => p.position === currentTarget.position);

  if (!parentTarget) {
    throw new Error("无法追溯该段落的上一版本");
  }

  const newRevision = await createRevision(service, {
    documentId: snapshot.document.id,
    parentRevisionId: snapshot.revision.id,
    sourceType: "user_edit",
    status: "pending",
  });

  const newParagraphs = snapshot.paragraphs.map((p) => {
    if (p.paragraphId === input.paragraphId) {
      return {
        paragraphId: p.paragraphId,
        position: p.position,
        content: parentTarget.content,
        isLocked: p.isLocked,
        sourceType: "user" as ParagraphSourceType,
      };
    }
    return {
      paragraphId: p.paragraphId,
      position: p.position,
      content: p.content,
      isLocked: p.isLocked,
      sourceType: p.sourceType,
    };
  });

  await createParagraphs(service, {
    revisionId: newRevision.id,
    paragraphs: newParagraphs,
  });

  const fullContent = newParagraphs.map(p => p.content).join("\n\n");
  await updateRevisionStatus(service, newRevision.id, "completed", fullContent);
  await setCurrentRevision(service, snapshot.document.id, newRevision.id);

  return {
    ...newRevision,
    status: "completed",
    fullContent,
  };
}
