import type { MetadataRoute } from "next";

const THEME_COLOR = "#0C5B4C";
const BACKGROUND_COLOR = "#FBF8F1";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TechComp Hub — ศูนย์รวมการแข่งขันเทคโนโลยีในไทย",
    short_name: "TechComp Hub",
    description:
      "ค้นหารายการแข่งขันเทคโนโลยีในประเทศไทย จัดทีม และติดตามข่าวสารการแข่งขันสำหรับนักเรียนและอาจารย์",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: BACKGROUND_COLOR,
    theme_color: THEME_COLOR,
    lang: "th",
    dir: "ltr",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
