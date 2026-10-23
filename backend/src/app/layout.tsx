import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CCTV Secret & Entrepreneurship",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.png", apple: "/icon.png" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b1320" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
