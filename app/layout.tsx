import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Funding Pulse",
  description: "A weekly digest of Indian startup funding, counted in code and sourced from live news.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <div className="wrap">
          <nav className="nav">
            <Link href="/" className="brand">Funding Pulse</Link>
            <Link href="/">Latest</Link>
            <Link href="/runs">Runs</Link>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
