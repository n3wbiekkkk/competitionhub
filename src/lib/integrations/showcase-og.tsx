import { ImageResponse } from "next/og";

interface OgFont {
  name: string;
  data: ArrayBuffer;
  style: "normal";
  weight: 400 | 600;
}

const FONT_CSS_URL =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;600&display=swap";

let cachedFonts: Promise<OgFont[]> | null = null;

async function loadThaiFonts(): Promise<OgFont[]> {
  if (!cachedFonts) {
    cachedFonts = (async () => {
      // No browser UA: Google serves TTF, which next/og (satori) can embed.
      const cssResponse = await fetch(FONT_CSS_URL, {
        signal: AbortSignal.timeout(4_000),
      });
      if (!cssResponse.ok) return [];
      const css = await cssResponse.text();
      const urls = [...css.matchAll(/src:\s*url\((https:[^)]+\.ttf)\)/g)]
        .map((match) => match[1])
        .filter((url): url is string => Boolean(url));
      const unique = [...new Set(urls)].slice(0, 2);
      const fonts = await Promise.all(
        unique.map(async (url, index) => {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(4_000),
          });
          if (!response.ok) return null;
          return {
            name: "IBM Plex Sans Thai",
            data: await response.arrayBuffer(),
            style: "normal" as const,
            weight: (index === 0 ? 400 : 600) as 400 | 600,
          };
        }),
      );
      return fonts.filter((font): font is OgFont => font !== null);
    })().catch(() => []);
  }
  return cachedFonts;
}

export interface RenderOgImageInput {
  kicker: string;
  title: string;
  subtitle: string;
  footer?: string;
}

/** Shared 1200×630 OpenGraph card for showcase and competition pages. */
export async function renderOgImage({
  kicker,
  title,
  subtitle,
  footer = "TechComp Hub · Thailand",
}: RenderOgImageInput): Promise<ImageResponse> {
  const fonts = await loadThaiFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#FAF7F0",
          color: "#263047",
          padding: "72px",
          fontFamily: "IBM Plex Sans Thai, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              width: 40,
              height: 40,
              borderRadius: 10,
              background: "#40685F",
            }}
          />
          <div
            style={{
              display: "flex",
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            {kicker}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            borderTop: "2px solid #DCD7CA",
            paddingTop: 36,
            gap: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: title.length > 72 ? 52 : 66,
              fontWeight: 600,
              lineHeight: 1.15,
            }}
          >
            {title}
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#626B78" }}>
            {subtitle}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 22, color: "#626B78" }}>
          {footer}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: fonts.length > 0 ? fonts : undefined,
    },
  );
}
