import { dedupeCompetition } from "@/lib/ai/dedupe";
import {
  extractTechCompetitionFromText,
  fetchUrlMarkdown,
} from "@/lib/ai/extract-competition";
import { isTyphoonConfigured } from "@/lib/ai/opentyphoon";
import { TECH_CATEGORY_META } from "@/lib/constants/tech-taxonomy";
import { withSystemDb } from "@/lib/db/pool";
import { searchCompetitionListings } from "@/lib/search/index";
import { formatThaiDate, getTodayIsoBangkok } from "@/lib/utils/thai-date";
import { validatePublicHttpUrl } from "@/lib/utils/url-safety";
import type { Competition } from "@/types/database";

export interface CandidateSourceItem {
  url: string;
  sourceName: string;
  hintText?: string;
  requireFetchedContent?: boolean;
}

export interface ScoutSourceDescriptor {
  id: string;
  name: string;
  target: string;
}

export const SCOUT_SOURCES: readonly ScoutSourceDescriptor[] = [
  {
    id: "hackza",
    name: "Hackza Thailand",
    target: "https://www.hackza.org/hackathons",
  },
  {
    id: "thailandhackathons",
    name: "Hackathon Thailand",
    target: "https://thailandhackathons.com/hackathons/bangkok",
  },
  {
    id: "portcas",
    name: "PorTCAS Thailand",
    target: "https://www.portcas.com/competition",
  },
  {
    id: "contester",
    name: "Contester Thailand",
    target: "https://contester.life/",
  },
  {
    id: "ctf_th",
    name: "CTF Thailand",
    target: "https://ctf.in.th/wp-json/wp/v2/posts",
  },
  {
    id: "gnews_th",
    name: "Google News Thailand",
    target:
      "hackathon OR CTF OR NSC OR แข่งขันเขียนโปรแกรม / AI / Robotics / Cyber Top Talent",
  },
  {
    id: "web_search",
    name: "การค้นหาเว็บ",
    target: "การแข่งขันเทคโนโลยีในประเทศไทยที่ยังเปิดรับสมัคร",
  },
];

export interface ScoutIgnoredItem {
  url: string;
  title?: string;
  reason: string;
}

export interface ScoutRunSummary {
  today: string;
  closedExpiredCount: number;
  discoveredCandidates: number;
  processedCount: number;
  insertedCount: number;
  inserted: Array<{
    id: string;
    title: string;
    category: string;
    deadline: string | null;
    source_url: string | null;
  }>;
  ignored: ScoutIgnoredItem[];
  errors: Array<{ url: string; error: string }>;
}

export type ScoutProgressEvent =
  | {
      type: "start";
      today: string;
      sources: ScoutSourceDescriptor[];
    }
  | {
      type: "closed_expired";
      count: number;
    }
  | {
      type: "source_start";
      sourceId: string;
      sourceName: string;
      target: string;
    }
  | {
      type: "source_done";
      sourceId: string;
      sourceName: string;
      foundCount: number;
      ok: boolean;
    }
  | {
      type: "dedup_done";
      discoveredCandidates: number;
      alreadyInDb: number;
      toProcess: number;
    }
  | {
      type: "candidate_fetch";
      index: number;
      total: number;
      sourceName: string;
      url: string;
    }
  | {
      type: "candidate_extract";
      index: number;
      total: number;
      sourceName: string;
      url: string;
    }
  | {
      type: "candidate_result";
      index: number;
      total: number;
      url: string;
      sourceName: string;
      outcome: "inserted" | "ignored" | "duplicate" | "error";
      title?: string;
      category?: string;
      deadline?: string | null;
      reason?: string;
    }
  | {
      type: "complete";
      summary: ScoutRunSummary;
    }
  | {
      type: "error";
      message: string;
    };

function normalizeCandidateUrl(raw: string): string | null {
  try {
    const parsed = validatePublicHttpUrl(raw);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^utm_|^(?:fbclid|gclid|ref|source|mc_cid|mc_eid)$/i.test(key)) {
        parsed.searchParams.delete(key);
      }
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Source 1: Hackza Thailand (https://www.hackza.org/hackathons)
 */
async function fetchHackzaThailandCandidates(): Promise<CandidateSourceItem[]> {
  try {
    const res = await fetch(
      "https://r.jina.ai/https://www.hackza.org/hackathons",
      {
        headers: { Accept: "text/markdown, text/plain" },
        signal: AbortSignal.timeout(14_000),
      },
    );
    if (!res.ok) return [];
    const md = await res.text();

    const items: CandidateSourceItem[] = [];
    const seen = new Set<string>();
    const headingRegex =
      /### \[([^\]]+)\]\((https:\/\/www\.hackza\.org\/hackathons\/[a-z0-9-]+)\)/gi;
    const matches = Array.from(md.matchAll(headingRegex));

    for (const m of matches) {
      const title = m[1]?.trim() ?? "";
      const rawUrl = m[2]?.trim() ?? "";
      const url = normalizeCandidateUrl(rawUrl);
      if (!url || seen.has(url)) continue;

      const startIdx = Math.max(0, (m.index ?? 0) - 200);
      const endIdx = Math.min(md.length, (m.index ?? 0) + 320);
      const snippet = md.slice(startIdx, endIdx);

      if (snippet.includes("ปิดรับสมัครแล้ว")) {
        continue;
      }

      seen.add(url);
      items.push({
        url,
        sourceName: "Hackza Thailand",
        hintText: `ชื่อรายการ: ${title}\nข้อมูลจาก Hackza Thailand:\n${snippet}`,
      });
      if (items.length >= 10) break;
    }

    return items;
  } catch {
    return [];
  }
}

/**
 * Source 2: PorTCAS Thailand (https://www.portcas.com/competition)
 */
async function fetchPortcasThailandCandidates(): Promise<CandidateSourceItem[]> {
  try {
    const res = await fetch("https://www.portcas.com/competition", {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const ignoredSlugs = new Set([
      "cover",
      "slider-prev",
      "slider-next",
    ]);
    const items: CandidateSourceItem[] = [];
    const seen = new Set<string>();

    for (const m of html.matchAll(/\/competition\/([a-z0-9-]+)/gi)) {
      const slug = m[1]?.toLowerCase() ?? "";
      if (!slug || ignoredSlugs.has(slug)) continue;
      const url = normalizeCandidateUrl(
        `https://www.portcas.com/competition/${slug}`,
      );
      if (!url || seen.has(url)) continue;
      seen.add(url);
      items.push({
        url,
        sourceName: "PorTCAS Thailand",
      });
      if (items.length >= 8) break;
    }

    return items;
  } catch {
    return [];
  }
}

/**
 * Source 3: Contester.Life Thailand (https://contester.life/)
 */
async function fetchContesterThailandCandidates(): Promise<
  CandidateSourceItem[]
> {
  try {
    const res = await fetch("https://contester.life/", {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const items: CandidateSourceItem[] = [];
    const seen = new Set<string>();

    for (const m of html.matchAll(/\/contest\/([a-z0-9-]+)/gi)) {
      const slug = m[1]?.toLowerCase() ?? "";
      if (!slug || slug === "submit") continue;
      const url = normalizeCandidateUrl(`https://contester.life/contest/${slug}`);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      items.push({
        url,
        sourceName: "Contester Thailand",
      });
      if (items.length >= 8) break;
    }

    return items;
  } catch {
    return [];
  }
}

interface WordPressPost {
  title?: { rendered?: string };
  link?: string;
  date?: string;
  excerpt?: { rendered?: string };
}

/**
 * Source 4: CTF Thailand (https://ctf.in.th)
 */
async function fetchCtfThailandCandidates(): Promise<CandidateSourceItem[]> {
  try {
    const res = await fetch(
      "https://ctf.in.th/wp-json/wp/v2/posts?per_page=10",
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return [];
    const posts = (await res.json()) as WordPressPost[];
    const items: CandidateSourceItem[] = [];

    for (const post of posts) {
      const title = stripHtmlTags(post.title?.rendered ?? "");
      const url = post.link ? normalizeCandidateUrl(post.link) : null;
      if (!url || !title) continue;
      if (!url.includes("/challenge/") && !title.includes("การแข่งขัน")) {
        continue;
      }
      if (
        title.includes("ลงนาม") ||
        title.includes("พิธี") ||
        title.includes("ประกาศผล") ||
        title.includes("ผลการแข่งขัน") ||
        title.includes("ย้อนหลัง") ||
        title.includes("CTF คืออะไร")
      ) {
        continue;
      }

      items.push({
        url,
        sourceName: "CTF Thailand",
        hintText: [
          `ชื่อรายการ: ${title}`,
          post.date ? `วันที่เผยแพร่: ${post.date}` : null,
          post.excerpt?.rendered
            ? `สรุป: ${stripHtmlTags(post.excerpt.rendered)}`
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
      });
      if (items.length >= 4) break;
    }
    return items;
  } catch {
    return [];
  }
}

/**
 * Source 6: Hackathon Thailand Directory (https://thailandhackathons.com)
 */
async function fetchThailandHackathonsDirectory(): Promise<
  CandidateSourceItem[]
> {
  try {
    const html = await fetch("https://thailandhackathons.com/hackathons/bangkok", {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!html.ok) return [];
    const text = await html.text();
    const items: CandidateSourceItem[] = [];
    const seen = new Set<string>();
    for (const m of text.matchAll(/href="(\/events\/[a-z0-9-]+)"/gi)) {
      const url = normalizeCandidateUrl(`https://thailandhackathons.com${m[1]}`);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      items.push({ url, sourceName: "Hackathon Thailand" });
      if (items.length >= 5) break;
    }
    return items;
  } catch {
    return [];
  }
}

/**
 * Source 5: Google News Thailand RSS (Thai tech competitions only)
 */
async function fetchGoogleNewsThaiTechCandidates(): Promise<
  CandidateSourceItem[]
> {
  const feeds = [
    "https://news.google.com/rss/search?q=(hackathon+OR+CTF+OR+NSC+OR+%22%E0%B9%81%E0%B8%82%E0%B9%88%E0%B8%87%E0%B8%82%E0%B8%B1%E0%B8%99%E0%B9%80%E0%B8%82%E0%B8%B5%E0%B8%A2%E0%B8%99%E0%B9%82%E0%B8%9B%E0%B8%A3%E0%B9%81%E0%B8%81%E0%B8%A3%E0%B8%A1%22)+%E0%B9%80%E0%B8%9B%E0%B8%B4%E0%B8%94%E0%B8%A3%E0%B8%B1%E0%B8%9A%E0%B8%AA%E0%B8%A1%E0%B8%B1%E0%B8%84%E0%B8%A3&hl=th&gl=TH&ceid=TH:th",
    "https://news.google.com/rss/search?q=(AI+OR+Robotics+OR+%22%E0%B8%AB%E0%B8%B8%E0%B9%88%E0%B8%99%E0%B8%A2%E0%B8%99%E0%B8%95%E0%B9%8C%22+OR+%22Cyber+Top+Talent%22)+%E0%B9%81%E0%B8%82%E0%B9%88%E0%B8%87%E0%B8%82%E0%B8%B1%E0%B8%99+%E0%B8%99%E0%B8%B1%E0%B8%81%E0%B9%80%E0%B8%A3%E0%B8%B5%E0%B8%A2%E0%B8%99+%E0%B8%99%E0%B8%B1%E0%B8%81%E0%B8%A8%E0%B8%B6%E0%B8%81%E0%B8%A9%E0%B8%B2&hl=th&gl=TH&ceid=TH:th",
  ];

  const items: CandidateSourceItem[] = [];
  const seen = new Set<string>();

  for (const feedUrl of feeds) {
    try {
      const res = await fetch(feedUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const itemBlocks = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
      let count = 0;

      for (const block of itemBlocks) {
        const inner = block[1] ?? "";
        const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(inner);
        const linkMatch = /<link>([\s\S]*?)<\/link>/i.exec(inner);
        const rawUrl = linkMatch?.[1]?.trim();
        const url = rawUrl ? normalizeCandidateUrl(rawUrl) : null;
        if (!url || seen.has(url)) continue;

        seen.add(url);
        const title =
          titleMatch?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() ?? "";
        items.push({
          url,
          sourceName: "Google News Thailand",
          hintText: title ? `หัวข้อข่าว: ${title}` : undefined,
          requireFetchedContent: true,
        });
        count += 1;
        if (count >= 3) break;
      }
    } catch {
      // Ignore individual feed failures
    }
  }

  return items;
}

async function fetchWebSearchCandidates(
  today: string,
  signal?: AbortSignal,
): Promise<CandidateSourceItem[]> {
  const year = today.slice(0, 4);
  const queries = [
    `hackathon OR CTF OR "แข่งขันเขียนโปรแกรม" OR AI OR robotics Thailand ${year} เปิดรับสมัคร`,
    `แฮกกาธอน OR CTF OR "การแข่งขันหุ่นยนต์" OR "Cyber Top Talent" ประเทศไทย ${year}`,
  ];

  const batches = await Promise.all(
    queries.map((query) =>
      searchCompetitionListings(query, { limit: 5, signal }),
    ),
  );

  const items: CandidateSourceItem[] = [];
  const seen = new Set<string>();
  for (const batch of batches) {
    for (const result of batch) {
      const url = normalizeCandidateUrl(result.url);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      items.push({
        url,
        sourceName: "การค้นหาเว็บ",
        hintText: [
          `ชื่อจากผลการค้นหา: ${result.title}`,
          result.snippet ? `สรุป: ${result.snippet}` : null,
          result.publishedAt ? `วันที่เผยแพร่: ${result.publishedAt}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        requireFetchedContent: true,
      });
      if (items.length >= 10) return items;
    }
  }
  return items;
}

async function sendDiscordDigest(
  inserted: ScoutRunSummary["inserted"],
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!webhookUrl || inserted.length === 0) {
    return;
  }

  try {
    const lines = inserted.map((item) => {
      const catLabel =
        TECH_CATEGORY_META[item.category as keyof typeof TECH_CATEGORY_META]
          ?.shortLabel ?? item.category;
      const deadlineLabel = formatThaiDate(item.deadline, "short");
      return `• **${item.title}** (${catLabel}) — ปิดรับ: ${deadlineLabel}${
        item.source_url ? ` [ลิงก์](${item.source_url})` : ""
      }`;
    });

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "TechComp Hub Scout",
        content: `🚀 พบการแข่งขันสาย Tech ในไทยใหม่รออาจารย์ตรวจสอบ ${inserted.length} รายการ:\n${lines.join("\n")}`,
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // Discord webhook is optional and non-fatal
  }
}

async function trackSourceFetch(
  descriptor: ScoutSourceDescriptor,
  fetcher: () => Promise<CandidateSourceItem[]>,
  emit?: (event: ScoutProgressEvent) => void,
): Promise<CandidateSourceItem[]> {
  emit?.({
    type: "source_start",
    sourceId: descriptor.id,
    sourceName: descriptor.name,
    target: descriptor.target,
  });

  try {
    const items = await fetcher();
    emit?.({
      type: "source_done",
      sourceId: descriptor.id,
      sourceName: descriptor.name,
      foundCount: items.length,
      ok: items.length > 0,
    });
    return items;
  } catch {
    emit?.({
      type: "source_done",
      sourceId: descriptor.id,
      sourceName: descriptor.name,
      foundCount: 0,
      ok: false,
    });
    return [];
  }
}

export async function runAutoTechScout(options?: {
  maxProcess?: number;
  onProgress?: (event: ScoutProgressEvent) => void;
  signal?: AbortSignal;
}): Promise<ScoutRunSummary> {
  const emit = options?.onProgress;
  const signal = options?.signal;
  const today = getTodayIsoBangkok();
  const maxProcess = Math.max(1, Math.min(25, options?.maxProcess ?? 8));

  emit?.({
    type: "start",
    today,
    sources: [...SCOUT_SOURCES],
  });

  // 1. Auto-close expired open competitions
  const closedExpiredCount = await withSystemDb(async (client) => {
    const res = await client.query(
      `UPDATE public.competitions
       SET status = 'closed'
       WHERE status = 'open'
         AND deadline IS NOT NULL
         AND deadline < $1::date`,
      [today],
    );
    return res.rowCount ?? 0;
  });

  emit?.({
    type: "closed_expired",
    count: closedExpiredCount,
  });

  if (!isTyphoonConfigured()) {
    const message = "ยังไม่ได้ตั้งค่าบริการวิเคราะห์อัตโนมัติ";
    emit?.({ type: "error", message });
    throw new Error(message);
  }

  // 2. Gather Thailand-only tech competition URLs from verified Thai feeds
  const [hackza, thHack, portcas, contester, ctfTh, gnews, webSearch] =
    await Promise.all([
      trackSourceFetch(SCOUT_SOURCES[0], fetchHackzaThailandCandidates, emit),
      trackSourceFetch(
        SCOUT_SOURCES[1],
        fetchThailandHackathonsDirectory,
        emit,
      ),
      trackSourceFetch(SCOUT_SOURCES[2], fetchPortcasThailandCandidates, emit),
      trackSourceFetch(
        SCOUT_SOURCES[3],
        fetchContesterThailandCandidates,
        emit,
      ),
      trackSourceFetch(SCOUT_SOURCES[4], fetchCtfThailandCandidates, emit),
      trackSourceFetch(SCOUT_SOURCES[5], fetchGoogleNewsThaiTechCandidates, emit),
      trackSourceFetch(
        SCOUT_SOURCES[6],
        () => fetchWebSearchCandidates(today, signal),
        emit,
      ),
    ]);

  const sourceBuckets = [
    hackza,
    thHack,
    portcas,
    contester,
    ctfTh,
    gnews,
    webSearch,
  ];
  const maxLen = Math.max(...sourceBuckets.map((b) => b.length));
  const allCandidatesRaw: CandidateSourceItem[] = [];
  for (let i = 0; i < maxLen; i += 1) {
    for (const bucket of sourceBuckets) {
      const item = bucket[i];
      if (item) allCandidatesRaw.push(item);
    }
  }

  const dedupedCandidates: CandidateSourceItem[] = [];
  const seenUrls = new Set<string>();

  for (const item of allCandidatesRaw) {
    if (seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);
    dedupedCandidates.push(item);
  }

  // 3. Deduplicate against existing competitions.source_url
  const candidateUrls = dedupedCandidates.map((c) => c.url);
  const existingUrls = await withSystemDb(async (client) => {
    if (candidateUrls.length === 0) return new Set<string>();
    const res = await client.query<{ source_url: string }>(
      `SELECT source_url
       FROM public.competitions
       WHERE source_url = ANY($1::text[])`,
      [candidateUrls],
    );
    return new Set(res.rows.map((r) => r.source_url));
  });

  const existingCandidates = await withSystemDb(async (client) => {
    const res = await client.query<{
      id: string;
      title: string;
      source_url: string | null;
      deadline: string | null;
    }>(
      `select id, title, source_url, deadline::text
       from public.competitions
       where status <> 'rejected'
       order by created_at desc
       limit 500`,
    );
    return res.rows;
  });

  const unseenCandidates = dedupedCandidates.filter(
    (c) => !existingUrls.has(c.url),
  );
  const newCandidates = unseenCandidates.slice(0, maxProcess);

  emit?.({
    type: "dedup_done",
    discoveredCandidates: dedupedCandidates.length,
    alreadyInDb: dedupedCandidates.length - unseenCandidates.length,
    toProcess: newCandidates.length,
  });

  const inserted: ScoutRunSummary["inserted"] = [];
  const ignored: ScoutIgnoredItem[] = [];
  const errors: Array<{ url: string; error: string }> = [];

  // 4. Fetch content -> OpenTyphoon extraction (Thailand-only) -> Auto-filter -> Insert pending_review
  for (let i = 0; i < newCandidates.length; i += 1) {
    if (signal?.aborted) {
      break;
    }

    const candidate = newCandidates[i];
    const index = i + 1;
    const total = newCandidates.length;

    try {
      emit?.({
        type: "candidate_fetch",
        index,
        total,
        sourceName: candidate.sourceName,
        url: candidate.url,
      });

      let textForAi = candidate.hintText ?? "";
      const markdownResult = await fetchUrlMarkdown(candidate.url, signal);
      if (!markdownResult.ok && candidate.requireFetchedContent) {
        const reason = "ไม่สามารถอ่านเนื้อหาข่าวต้นทาง จึงไม่สร้างรายการจากพาดหัวเพียงอย่างเดียว";
        ignored.push({ url: candidate.url, reason });
        emit?.({
          type: "candidate_result", index, total, url: candidate.url,
          sourceName: candidate.sourceName, outcome: "ignored", reason,
        });
        continue;
      }
      if (markdownResult.ok) {
        textForAi = textForAi
          ? `${textForAi}\n\n--- เนื้อหาจากหน้าเว็บ ---\n${markdownResult.markdown}`
          : markdownResult.markdown;
      }

      if (textForAi.trim().length < 40) {
        const reason = markdownResult.ok
          ? "เนื้อหาสั้นเกินไป"
          : markdownResult.messageTh;
        ignored.push({ url: candidate.url, reason });
        emit?.({
          type: "candidate_result",
          index,
          total,
          url: candidate.url,
          sourceName: candidate.sourceName,
          outcome: "ignored",
          reason,
        });
        continue;
      }

      if (signal?.aborted) {
        break;
      }

      emit?.({
        type: "candidate_extract",
        index,
        total,
        sourceName: candidate.sourceName,
        url: candidate.url,
      });

      const extracted = await extractTechCompetitionFromText(
        textForAi,
        candidate.url,
        { thailandOnly: true }, signal,
      );

      if (!extracted.is_tech_related) {
        const reason =
          extracted.rejection_reason ??
          "ไม่เข้าข่ายการแข่งขันสายคอมพิวเตอร์/เทคโนโลยีในประเทศไทย";
        ignored.push({
          url: candidate.url,
          title: extracted.title,
          reason,
        });
        emit?.({
          type: "candidate_result",
          index,
          total,
          url: candidate.url,
          sourceName: candidate.sourceName,
          outcome: "ignored",
          title: extracted.title,
          reason,
        });
        continue;
      }

      if (extracted.deadline && extracted.deadline < today) {
        const reason = `เลยวันปิดรับสมัครแล้ว (${extracted.deadline})`;
        ignored.push({
          url: candidate.url,
          title: extracted.title,
          reason,
        });
        emit?.({
          type: "candidate_result",
          index,
          total,
          url: candidate.url,
          sourceName: candidate.sourceName,
          outcome: "ignored",
          title: extracted.title,
          deadline: extracted.deadline,
          reason,
        });
        continue;
      }

      const duplicate = dedupeCompetition(
        {
          title: extracted.title,
          sourceUrl: candidate.url,
          deadline: extracted.deadline,
        },
        existingCandidates,
      );
      if (duplicate.action === "skip") {
        const reason = "รายการใกล้เคียงมีอยู่ในระบบแล้ว";
        ignored.push({ url: candidate.url, title: extracted.title, reason });
        emit?.({
          type: "candidate_result",
          index,
          total,
          url: candidate.url,
          sourceName: candidate.sourceName,
          outcome: "ignored",
          title: extracted.title,
          reason,
        });
        continue;
      }

      const created = await withSystemDb(async (client) => {
        if (signal?.aborted) return null;
        const res = await client.query<Competition>(
          `INSERT INTO public.competitions (
             title, category, deadline, min_size, max_size,
             recommended_roles, tech_stack_hints, eligibility, summary,
             source_url, source_type, status, created_by
           )
           VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, 'ai_auto', 'pending_review', NULL)
           ON CONFLICT (source_url) WHERE source_url IS NOT NULL AND btrim(source_url) <> ''
           DO NOTHING
           RETURNING id, title, category, deadline::text, source_url`,
          [
            extracted.title,
            extracted.category,
            extracted.deadline,
            extracted.min_size,
            extracted.max_size,
            extracted.recommended_roles,
            extracted.tech_stack_hints,
            extracted.eligibility,
            extracted.summary,
            candidate.url,
          ],
        );
        return res.rows[0] ?? null;
      });

      if (created) {
        inserted.push({
          id: created.id,
          title: created.title,
          category: created.category,
          deadline: created.deadline,
          source_url: created.source_url,
        });
        emit?.({
          type: "candidate_result",
          index,
          total,
          url: candidate.url,
          sourceName: candidate.sourceName,
          outcome: "inserted",
          title: created.title,
          category: created.category,
          deadline: created.deadline,
        });
      } else {
        emit?.({
          type: "candidate_result",
          index,
          total,
          url: candidate.url,
          sourceName: candidate.sourceName,
          outcome: "duplicate",
          title: extracted.title,
          reason: "มีลิงก์นี้อยู่ในฐานข้อมูลแล้ว",
        });
      }
    } catch {
      const errorMsg = "วิเคราะห์ลิงก์นี้ไม่สำเร็จ กรุณาลองใหม่ในภายหลัง";
      errors.push({
        url: candidate.url,
        error: errorMsg,
      });
      emit?.({
        type: "candidate_result",
        index,
        total,
        url: candidate.url,
        sourceName: candidate.sourceName,
        outcome: "error",
        reason: errorMsg,
      });
    }
  }

  if (!signal?.aborted) {
    await sendDiscordDigest(inserted);
  }

  const summary: ScoutRunSummary = {
    today,
    closedExpiredCount,
    discoveredCandidates: dedupedCandidates.length,
    processedCount: newCandidates.length,
    insertedCount: inserted.length,
    inserted,
    ignored,
    errors,
  };

  emit?.({ type: "complete", summary });

  return summary;
}
