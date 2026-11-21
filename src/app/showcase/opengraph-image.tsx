import { renderOgImage } from "@/lib/integrations/showcase-og";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = "ผลงานนักเรียนที่ได้รับการตรวจสอบ · TechComp Hub";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return renderOgImage({
    kicker: "TechComp Hub / Showcase",
    title: "ผลงานนักเรียน",
    subtitle: "ผลการแข่งขันเทคโนโลยีที่ผ่านการตรวจสอบโดยอาจารย์",
    footer: "ศูนย์รวมการแข่งขันเทคโนโลยีในประเทศไทย",
  });
}
