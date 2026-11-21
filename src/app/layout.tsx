import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { IBM_Plex_Sans_Thai, JetBrains_Mono } from "next/font/google";
import { CommandPaletteProvider } from "@/components/command/command-palette-provider";
import { AppShell } from "@/components/layout/app-shell";
import { ThemeProvider } from "@/components/theme/theme-provider";
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
              <AppShell>{children}</AppShell>
            </TooltipProvider>
          </CommandPaletteProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
