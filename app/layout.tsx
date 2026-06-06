import type { Metadata, Viewport } from "next";
import { PwaRegister } from "./pwa-register";
import { RouteTransitionIndicator } from "./route-transition-indicator";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Car Collector",
  title: "Car Collector",
  description: "Private car price monitoring panel.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Car Collector",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#020617",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body>
        <RouteTransitionIndicator />
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
