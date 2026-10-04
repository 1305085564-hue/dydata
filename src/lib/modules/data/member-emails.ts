export async function fetchMemberEmails(): Promise<Record<string, string> | undefined> {
  try {
    const response = await fetch("/api/admin/modules/member-emails", {
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = await response.json();
    if (payload.emails) return payload.emails as Record<string, string>;
  } catch {}
}
