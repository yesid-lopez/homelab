import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yesid's Homelab",
  description:
    "A detailed Next.js overview of Yesid Lopez's K3s homelab: hardware, GitOps, networking, storage, observability, apps, secrets, and automation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
