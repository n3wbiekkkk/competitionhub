import { withUserDb } from "@/lib/db/pool";
import type { DirectoryPersonProfile, DirectoryProfile } from "@/types/database";

// Server-only query module. Client components must import DirectoryProfile
// with `import type` from @/types/database, never this module.

export function normalizeDirectoryQuery(raw: string | undefined): string | null {
  const cleaned = (raw ?? "")
    .trim()
    .slice(0, 80)
    .replace(/[%_\\]/g, "")
    .trim();
  return cleaned.length >= 2 ? cleaned : null;
}

export async function listDirectoryProfiles(
  userId: string,
  rawQuery: string | undefined,
): Promise<DirectoryProfile[]> {
  const query = normalizeDirectoryQuery(rawQuery);
  return withUserDb(userId, async (client) => {
    const result = await client.query<DirectoryProfile>(
      `SELECT id, full_name, nickname, grade, skills, role, avatar_url
       FROM public.query_profile_directory($1, 50, 0)`,
      [query],
    );
    return result.rows;
  });
}

export async function getDirectoryProfile(
  userId: string,
  profileId: string,
): Promise<DirectoryPersonProfile | null> {
  return withUserDb(userId, async (client) => {
    const result = await client.query<DirectoryPersonProfile>(
      `SELECT id, full_name, nickname, grade, skills, role, avatar_url,
              bio, github_url, portfolio_url, discord_url, line_url, contact
       FROM public.get_directory_profile($1::uuid)`,
      [profileId],
    );
    if (result.rows[0]) return result.rows[0];

    // Confirmed teammates and teachers already have full-row visibility under
    // the existing RLS policy. Return the same narrow DTO for that relationship.
    const teammate = await client.query<DirectoryPersonProfile>(
      `SELECT id, full_name, nickname, grade, skills, role, avatar_url,
              bio, github_url, portfolio_url, discord_url, line_url, contact
       FROM public.profiles
       WHERE id = $1::uuid
       LIMIT 1`,
      [profileId],
    );
    return teammate.rows[0] ?? null;
  });
}
