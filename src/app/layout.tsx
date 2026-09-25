import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Trajectory", template: "%s · Trajectory" },
  description: "Where am I financially, where will I be, and what happens if I spend today?",
  applicationName: "Trajectory",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Trajectory" },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#08080a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${GeistSans.variable} ${GeistMono.variable} dark`} suppressHydrationWarning>
      <body className="font-sans">
        {children}
        <Toaster
          position="top-center"
          theme="dark"
          mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
          toastOptions={{
            classNames: {
              toast: "!bg-[#15151a] !border !border-white/10 !text-fg !shadow-2xl !rounded-2xl",
              description: "!text-fg-muted",
            },
          }}
        />
      </body>
    </html>
  );
}
