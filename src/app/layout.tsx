import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import { themeScript } from "@/ui/theme-script";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "trip.io",
    template: "%s · trip.io",
  },
  description:
    "A travel companion that builds your trip, then watches weather, roads, transport and local events along it — and tells you only what actually affects your days.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      className={`${dmSans.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed, first-party string that must run before paint */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
