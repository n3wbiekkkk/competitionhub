import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { IBM_Plex_Sans_Thai, JetBrains_Mono } from "next/font/google";
import { CommandPaletteProvider } from "@/components/command/command-palette-provider";
import { Footer } from "@/components/layout/footer";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { Navbar } from "@/components/layout/navbar";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";
import { ThemedToaster, ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import "./globals.css";

const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-sans-thai",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "TechComp Hub — ศูนย์รวมการแข่งขันเทคโนโลยีในไทย",
    template: "%s · TechComp Hub",
  },
  description:
    "แพลตฟอร์มรวมการแข่งขันสายคอมพิวเตอร์ ซอฟต์แวร์ AI ความมั่นคงปลอดภัยไซเบอร์ หุ่นยนต์ และนวัตกรรมดิจิทัลในประเทศไทย พร้อมระบบจัดทีมโดยอาจารย์",
  applicationName: "TechComp Hub",
  robots: { index: false, follow: false },
};

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('techcomp-theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`;

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const hasSession = cookieStore.has(SESSION_COOKIE_NAME);

  return (
    <html
      lang="th"
      suppressHydrationWarning
      className={`${ibmPlexSansThai.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body
        data-auth={hasSession ? "true" : "false"}
        className="flex min-h-screen flex-col bg-background font-sans text-foreground"
      >
        <ThemeProvider>
          <CommandPaletteProvider>
            <TooltipProvider>
              <a
                href="#main-content"
                className="fixed left-4 top-3 z-[100] -translate-y-24 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg transition-transform focus:translate-y-0"
              >
                ข้ามไปยังเนื้อหาหลัก
              </a>
              <OfflineBanner />
              <Navbar />
              <div
                id="main-content"
                tabIndex={-1}
                className="flex-1 pb-24 outline-none md:pb-0"
              >
                {children}
              </div>
              <div className="pb-16 md:pb-0">
                <Footer />
              </div>
              <MobileBottomNav />
              <ServiceWorkerRegistrar />
              <ThemedToaster />
            </TooltipProvider>
          </CommandPaletteProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
