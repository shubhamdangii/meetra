import type { Metadata, Viewport } from "next";
import { Newsreader, Schibsted_Grotesk } from "next/font/google";
import { AppProvider } from "@/components/AppProvider";
import { AuthProvider } from "@/components/AuthProvider";
import { Footer, Header } from "@/components/Chrome";
import { ScrollFX, ScrollProgress, ScrollUpFX } from "@/components/fx";
import { InstallBanner, PwaSetup } from "@/components/InstallApp";
import { CONFIG } from "@/lib/config";
import "./globals.css";

// Fonts are downloaded at build time and served from our own site (no Google Fonts requests from visitors).
// Schibsted Grotesk + Newsreader (both free Google Fonts, SIL Open Font License).
const display = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const serif = Newsreader({ subsets: ["latin"], style: ["italic"], weight: ["400", "500"], variable: "--font-serif", display: "swap" });

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const live = Object.values(CONFIG.cities).filter((c) => c.live).map((c) => c.name).join(" & ");

export const metadata: Metadata = {
  title: { default: `${CONFIG.brand} · Hosted meetups in ${live}`, template: `%s · ${CONFIG.brand}` },
  description: `Small hosted meetups for people coming solo: dinners, games nights, walks, sports and trips in ${live}.`,
  openGraph: { title: `${CONFIG.brand} · Hosted meetups for people coming solo`, description: "100+ small hosted plans every month. Come alone, leave with a group chat." },
  icons: { apple: `${BASE}/icons/apple-touch-icon.png`, icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='24' fill='%2316122B'/><text x='50' y='72' font-size='64' text-anchor='middle' fill='%23FFC93C' font-family='Arial' font-weight='900'>m</text></svg>" },
  referrer: "strict-origin-when-cross-origin",
  manifest: `${BASE}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: CONFIG.brand, statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#FFF7EC", width: "device-width", initialScale: 1 };

// Content Security Policy: the browser refuses anything not listed here (blocks injected
// scripts, unknown trackers, framing tricks). GitHub Pages can't send security headers,
// so it goes in a <meta> tag. Only in production builds (the dev server needs eval).
const supabase = CONFIG.supabaseUrl.replace(/\/$/, "");
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://*.razorpay.com",   // Next.js startup data + Razorpay Checkout
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://*.googleusercontent.com https://tile.openstreetmap.org https://*.razorpay.com",
  "font-src 'self'",
  `connect-src 'self' ${supabase} ${supabase.replace("https://", "wss://")} https://*.razorpay.com`,
  "frame-src https://api.razorpay.com https://checkout.razorpay.com https://*.razorpay.com https://maps.google.com https://www.google.com",   // payment window + exact-location map
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${serif.variable}`}>
      <head>
        {process.env.NODE_ENV === "production" && <meta httpEquiv="Content-Security-Policy" content={CSP} />}
      </head>
      <body>
        <AuthProvider>
          <AppProvider>
            <ScrollProgress />
            <ScrollFX />
            <ScrollUpFX />
            <Header />
            <main id="main">{children}</main>
            <Footer />
            <PwaSetup />
            <InstallBanner />
          </AppProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
