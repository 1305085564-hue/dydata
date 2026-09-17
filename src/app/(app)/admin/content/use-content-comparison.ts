import { useCallback, useEffect, useMemo, useState } from "react";
import type { MultiRefAttributionResult } from "@/lib/content-attribution";
import type { VideoRow } from "@/lib/review-queue";
import {
  buildComparisonMemberOptions,
  type ComparisonMemberOption,
} from "@/lib/content-comparison-members";

export type RefKey = "self" | "team" | "top" | "user";

export function useContentComparison({
  video,
  videos,
  profiles,
}: {
  video: VideoRow | null;
  videos: VideoRow[];
  profiles: Array<{ id: string; name: string }>;
}) {
  const [selectedRefs, setSelectedRefs] = useState<Set<RefKey>>(
    () => new Set(["self", "team"]),
  );
  const [selectedRefUserId, setSelectedRefUserId] = useState<string | null>(
    null,
  );
  const [fallbackComparisonProfiles, setFallbackComparisonProfiles] = useState<
    ComparisonMemberOption[]
  >([]);
  const [comparisonMembersLoading, setComparisonMembersLoading] =
    useState(false);
  const [comparisonMembersLoaded, setComparisonMembersLoaded] = useState(false);
  const [comparisonMembersError, setComparisonMembersError] = useState<
    string | null
  >(null);
  const [multiAttribution, setMultiAttribution] =
    useState<MultiRefAttributionResult | null>(null);
  const [attributionLoading, setAttributionLoading] = useState(false);
  const [attributionError, setAttributionError] = useState<string | null>(null);
  const comparisonVideos = useMemo(() => {
    if (!video) return videos;
    return [video, ...videos.filter((item) => item.id !== video.id)];
  }, [video, videos]);

  const comparisonMembers = useMemo(
    () =>
      buildComparisonMemberOptions({
        profiles,
        videos: comparisonVideos,
        fallbackProfiles: fallbackComparisonProfiles,
      }),
    [comparisonVideos, fallbackComparisonProfiles, profiles],
  );

  const availableComparisonMembers = useMemo(
    () => comparisonMembers.filter((member) => member.id !== video?.user_id),
    [comparisonMembers, video?.user_id],
  );

  const validSelectedRefUserId = useMemo(() => {
    if (!selectedRefUserId) return null;
    return availableComparisonMembers.some((member) => member.id === selectedRefUserId)
      ? selectedRefUserId
      : null;
  }, [availableComparisonMembers, selectedRefUserId]);

  const selectedMemberName = useMemo(() => {
    if (!validSelectedRefUserId) return undefined;
    return comparisonMembers.find((p) => p.id === validSelectedRefUserId)?.name;
  }, [comparisonMembers, validSelectedRefUserId]);

  const toggleRef = (refKey: RefKey) => {
    setSelectedRefs((prev) => {
      const next = new Set(prev);
      if (next.has(refKey)) {
        if (next.size > 1) {
          next.delete(refKey);
        }
      } else {
        next.add(refKey);
        // 如果激活“指定成员”且尚未选择对比人，自动挑选第一个非当前作者成员
        if (refKey === "user" && !selectedRefUserId) {
          const defaultMember = availableComparisonMembers[0];
          if (defaultMember) {
            setSelectedRefUserId(defaultMember.id);
          }
        }
      }
      return next;
    });
  };

  const fetchAttribution = useCallback(
    async (
      vId: string,
      refs: RefKey[],
      signal: AbortSignal,
      refUserId?: string | null,
    ) => {
      setAttributionLoading(true);
      setAttributionError(null);
      const refsStr = refs.length > 0 ? refs.join(",") : "self";
      let url = `/api/admin/content-attribution/${vId}?refs=${encodeURIComponent(refsStr)}`;
      if (refs.includes("user") && refUserId) {
        url += `&refUserId=${encodeURIComponent(refUserId)}`;
      }
      try {
        const res = await fetch(url, { signal });
        const data = (await res.json()) as MultiRefAttributionResult & {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || "归因数据加载失败");
        }
        if (signal.aborted) return;
        setMultiAttribution(data);
      } catch (error) {
        if (signal.aborted) return;
        setMultiAttribution(null);
        setAttributionError(
          error instanceof Error ? error.message : "归因数据加载失败",
        );
      } finally {
        if (!signal.aborted) setAttributionLoading(false);
      }
    },
    [],
  );

  const loadFallbackComparisonMembers = useCallback(async (signal: AbortSignal) => {
    setComparisonMembersLoading(true);
    setComparisonMembersError(null);
    try {
      const res = await fetch("/api/admin/content/comparison-members", { signal });
      const data = (await res.json().catch(() => ({}))) as {
        profiles?: ComparisonMemberOption[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "可对比成员加载失败");
      }
      if (signal.aborted) return;
      setFallbackComparisonProfiles(data.profiles ?? []);
      setComparisonMembersLoaded(true);
    } catch (error) {
      if (signal.aborted) return;
      setComparisonMembersError(
        error instanceof Error ? error.message : "可对比成员加载失败",
      );
      setComparisonMembersLoaded(true);
    } finally {
      if (!signal.aborted) setComparisonMembersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedRefs.has("user")) return;
    if (availableComparisonMembers.length > 0) return;
    if (comparisonMembersLoaded || comparisonMembersLoading) return;

    const controller = new AbortController();
    void loadFallbackComparisonMembers(controller.signal);
    return () => controller.abort();
  }, [
    availableComparisonMembers.length,
    comparisonMembersLoaded,
    comparisonMembersLoading,
    loadFallbackComparisonMembers,
    selectedRefs,
  ]);

  useEffect(() => {
    if (!selectedRefs.has("user")) return;
    const nextUserId = validSelectedRefUserId ?? availableComparisonMembers[0]?.id ?? null;
    if (nextUserId !== selectedRefUserId) {
      setSelectedRefUserId(nextUserId);
    }
  }, [
    availableComparisonMembers,
    selectedRefUserId,
    selectedRefs,
    validSelectedRefUserId,
  ]);

  useEffect(() => {
    if (!video?.id) return;
    setSelectedRefUserId(null);
    setMultiAttribution(null);
    setAttributionError(null);
    setAttributionLoading(false);
  }, [video?.id]);

  useEffect(() => {
    const videoId = video?.id;
    if (!videoId) return;
    const controller = new AbortController();
    const activeArr = Array.from(selectedRefs);

    // 如果勾选了 user 但尚未指定成员（如无其他成员可指定），排除 user 仅请求其他已选参照，避免全盘空白
    const validRefs = activeArr.includes("user") && !validSelectedRefUserId
      ? activeArr.filter((r) => r !== "user")
      : activeArr;

    if (validRefs.length === 0) {
      setAttributionLoading(false);
      return () => controller.abort();
    }

    void fetchAttribution(
      videoId,
      validRefs,
      controller.signal,
      validSelectedRefUserId,
    );
    return () => controller.abort();
  }, [video?.id, selectedRefs, validSelectedRefUserId, fetchAttribution]);

  return {
    selectedRefs,
    toggleRef,
    selectedRefUserId,
    setSelectedRefUserId,
    comparisonMembers,
    availableComparisonMembers,
    validSelectedRefUserId,
    selectedMemberName,
    comparisonMembersLoading,
    comparisonMembersError,
    multiAttribution,
    attributionLoading,
    attributionError,
  };
}
