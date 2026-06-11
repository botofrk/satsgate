import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIPP - AI Payment Protocol",
  description: "AIPP - Lightning Network L402 paywall for AI agents. Monetize your AI endpoints globally.",
  icons: {
    icon: [
      { url: '/assets/favicon.svg', type: 'image/svg+xml' },
      { url: '/assets/favicon.ico' }
    ]
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
