import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Car Collector",
  description: "Private car price monitoring panel.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
