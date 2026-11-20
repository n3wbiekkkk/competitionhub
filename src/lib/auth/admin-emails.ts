export function getConfiguredAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  const emails = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return new Set(emails);
}

export function isConfiguredAdminEmail(
  email: string | null | undefined,
): boolean {
  if (!email) return false;
  return getConfiguredAdminEmails().has(email.trim().toLowerCase());
}
