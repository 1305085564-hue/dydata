import type { SupabaseClient } from "@supabase/supabase-js";

type ResourceClient = Pick<SupabaseClient, "from">;

async function userOwnsResource(
  supabase: ResourceClient,
  input: {
    table: "accounts" | "content_item" | "videos";
    resourceId: string;
    ownerColumn: "profile_id" | "owner_user_id" | "user_id";
    userId: string;
  },
) {
  const { data, error } = await supabase
    .from(input.table)
    .select("id")
    .eq("id", input.resourceId)
    .eq(input.ownerColumn, input.userId)
    .maybeSingle();

  return !error && Boolean(data);
}

export function userOwnsContentItem(
  supabase: ResourceClient,
  contentItemId: string,
  userId: string,
) {
  return userOwnsResource(supabase, {
    table: "content_item",
    resourceId: contentItemId,
    ownerColumn: "owner_user_id",
    userId,
  });
}

export function userOwnsAccount(
  supabase: ResourceClient,
  accountId: string,
  userId: string,
) {
  return userOwnsResource(supabase, {
    table: "accounts",
    resourceId: accountId,
    ownerColumn: "profile_id",
    userId,
  });
}

export function userOwnsVideo(
  supabase: ResourceClient,
  videoId: string,
  userId: string,
) {
  return userOwnsResource(supabase, {
    table: "videos",
    resourceId: videoId,
    ownerColumn: "user_id",
    userId,
  });
}
