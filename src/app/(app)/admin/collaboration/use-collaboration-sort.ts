"use client";

import { useCallback, useState } from "react";
import {
  buildCollaborationSearchParams,
  COLLABORATION_BASE_PATH,
  resolveCollaborationSort,
  type CollaborationAdminView,
  type CollaborationSortDir,
  type CollaborationTabKey,
} from "@/lib/collaboration/work-group-navigation";

export function useCollaborationSort(input: {
  defaultSortKey: string | null;
  defaultSortDir: CollaborationSortDir;
  year: number;
  month: number;
  view: CollaborationAdminView;
  tab: CollaborationTabKey;
  selectedGroupId: string | null;
  selectedPersonId: string | null;
}) {
  const defaultSig = `${input.defaultSortKey ?? ""}:${input.defaultSortDir}`;
  const [state, setState] = useState<{
    sig: string;
    sortKey: string | null;
    sortDir: CollaborationSortDir;
  }>({
    sig: defaultSig,
    sortKey: input.defaultSortKey,
    sortDir: input.defaultSortDir,
  });

  if (state.sig !== defaultSig) {
    setState({
      sig: defaultSig,
      sortKey: input.defaultSortKey,
      sortDir: input.defaultSortDir,
    });
  }

  const syncSortFromParams = useCallback((params: URLSearchParams) => {
    const next = resolveCollaborationSort(params.get("sort"), params.get("dir"));
    setState((prev) => ({ ...prev, sortKey: next.sortKey, sortDir: next.sortDir }));
  }, []);

  const resetSort = useCallback(() => {
    setState((prev) => ({ ...prev, sortKey: null, sortDir: "desc" }));
  }, []);

  const handleSortChange = useCallback(
    (next: { sortKey: string; sortOrder: CollaborationSortDir }) => {
      setState((prev) => ({ ...prev, sortKey: next.sortKey, sortDir: next.sortOrder }));
      const search = buildCollaborationSearchParams({
        year: input.year,
        month: input.month,
        view: input.view,
        tab: input.tab,
        groupId: input.selectedGroupId,
        personId: input.selectedPersonId,
        sort: next.sortKey,
        dir: next.sortOrder,
      });
      window.history.replaceState(null, "", `${COLLABORATION_BASE_PATH}?${search}`);
    },
    [input.year, input.month, input.view, input.tab, input.selectedGroupId, input.selectedPersonId],
  );

  return {
    sortKey: state.sortKey,
    sortDir: state.sortDir,
    syncSortFromParams,
    resetSort,
    handleSortChange,
  };
}
