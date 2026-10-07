import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Inter, Newsreader } from "next/font/google";
import "./globals.css";

// DESIGN.md: a light serif for display copy and Inter for everything else.
// Newsreader stands in for the licensed Waldenburg.
const sans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const serif = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});

// Only for what is copied letter by letter: addresses and transaction hashes.
const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const DESCRIPTION =
  "Cancela lo que debes con lo que te deben, sin esperar a que te paguen. Nodus encuentra los círculos de deuda entre negocios y los liquida en una sola transacción sobre Stellar.";

/** Where the app is published, for absolute links in shared cards. */
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);

export const metadata: Metadata = {
  metadataBase: APP_URL ? new URL(APP_URL) : undefined,
  title: { default: "Nodus", template: "%s · Nodus" },
  description: DESCRIPTION,
  applicationName: "Nodus",
  openGraph: { type: "website", siteName: "Nodus", title: "Nodus", description: DESCRIPTION, locale: "es_CL" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#f5f5f5",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${sans.variable} ${serif.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
