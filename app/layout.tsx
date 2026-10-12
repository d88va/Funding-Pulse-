import type { Metadata } from "next";
import Link from "next/link";
import { Newsreader, Inter } from "next/font/google";
import "./globals.css";

const serif = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-serif", display: "swap" });
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Funding Pulse",
  description: "A weekly digest of Indian startup funding, counted in code and sourced from live news.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <div className="wrap">
          <header className="masthead">
            <Link href="/" className="brand">Funding Pulse</Link>
            <nav className="nav">
              <Link href="/">Latest</Link>
              <Link href="/runs">Runs</Link>
            </nav>
          </header>
          {children}
          <footer className="foot">
            Amounts are taken from source articles; trends are counted, not estimated. The brief reports. It never
            recommends who to contact.
          </footer>
        </div>
      </body>
    </html>
  );
}
