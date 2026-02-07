import type React from "react"
import type { Metadata, Viewport } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { OBSProvider } from "@/lib/obs-context"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "DockForLife - OBS Control | v0.001 Beta",
  description: "Control OBS remotely from any device. Made with love by Daury DiCaprio. #verygoodforlife",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DockForLife",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.jpg", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
  authors: [{ name: "Daury DiCaprio", url: "https://daurydicaprio.com" }],
  keywords: ["OBS", "streaming", "control", "remote", "deck", "PWA"],
    generator: 'v0.app'
}

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var lang = 'en';
                try {
                  var saved = localStorage.getItem('dfl_lang');
                  if (saved === 'es' || saved === 'en') {
                    lang = saved;
                  } else {
                    var browser = navigator.language?.toLowerCase() || '';
                    if (browser.startsWith('es')) lang = 'es';
                  }
                } catch (e) {}
                document.documentElement.lang = lang;
              })();
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
              // Apply saved theme immediately to prevent flash
              try {
                const theme = localStorage.getItem('dfl_theme');
                if (theme === 'light') {
                  document.documentElement.classList.remove('dark');
                } else {
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <OBSProvider>
          {children}
        </OBSProvider>
        <Analytics />
      </body>
    </html>
  )
}
