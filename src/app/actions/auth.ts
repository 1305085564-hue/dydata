"use server";

import { signOut as signOutAction } from "@/lib/account-actions";

export async function signOut() {
  return signOutAction();
}
