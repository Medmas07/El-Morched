import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GeoAI Risk Engine",
  description: "Flood and urban heat vulnerability mapping",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <head>
        <meta name="referrer" content="no-referrer" />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
