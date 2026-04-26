import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";

import "./globals.css";

const fontBody = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-body",
  display: "swap"
});

const fontDisplay = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"]
});

const APP_NAME = "MasaPayz";
const APP_DESCRIPTION = "Restoran hesabınızı QR kod ile anında bölün. POS entegrasyonu, iyzico ve PayTR desteği ile.";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: `${APP_NAME} PWA`,
    template: `%s | ${APP_NAME}`
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png", type: "image/png", sizes: "512x512" },
      { url: "/icons/icon.svg", type: "image/svg+xml", sizes: "any" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
    shortcut: [{ url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" }]
  },
  other: {
    "mobile-web-app-capable": "yes"
  }
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const localeCookie = cookies().get("dashboard-locale")?.value;
  const htmlLang = localeCookie === "en" ? "en" : "tr";

  return (
    <html lang={htmlLang} className={`${fontBody.variable} ${fontDisplay.variable}`}>
      <body className="min-h-dvh antialiased">
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
