import { z } from "zod";
import { withUserDb } from "@/lib/db/pool";
import { loadCompetitionOgMeta } from "@/lib/integrations/showcase";
import { renderOgImage } from "@/lib/integrations/showcase-og";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "การแข่งขัน · TechComp Hub";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const meta = z.string().uuid().safeParse(id).success
    ? await withUserDb(null, (client) => loadCompetitionOgMeta(client, id))
    : null;

  return renderOgImage({
    kicker: "TechComp Hub / Competition",
    title: meta?.title ?? "การแข่งขันเทคโนโลยี",
    subtitle: meta?.summary?.slice(0, 120) ?? "ดูรายละเอียดการแข่งขันใน TechComp Hub",
  });
}
