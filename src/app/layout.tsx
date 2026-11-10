import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ScribMed RO – documentare clinică asistată", template: "%s · ScribMed RO" },
  description:
    "ScribMed RO transformă conversația medic–pacient într-o fișă de consultație structurată, în terminologie medicală românească. Medicul verifică și validează fiecare fișă.",
  robots: { index: true, follow: true },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#0b1b33",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading request headers opts every page into dynamic rendering, which is
  // required so Next.js can attach the per-request CSP nonce from proxy.ts.
  await headers();
  return (
    <html lang="ro">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
