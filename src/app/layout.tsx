import type { Metadata } from "next";
import { Public_Sans, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import { CHECKED_ON } from "@/lib/ssi/rules";
import { shortDate } from "@/lib/format";
import "./globals.css";

const sans = Public_Sans({ variable: "--font-public-sans", subsets: ["latin"] });
const serif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Countless", template: "%s · Countless" },
  description:
    "Friends and family pay a disabled person's bills straight to the vendor, so their SSI is never cut.",
};

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" className="shrink-0">
      <rect x="1" y="4" width="20" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <line x1="6.5" y1="4.8" x2="6.5" y2="17.2" stroke="currentColor" strokeWidth="1.2" strokeDasharray="1.6 1.6" />
      <path d="M10.5 11.2l2.2 2.2 4.3-4.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <header className="border-b border-rule bg-paper/95">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2 text-ink">
              <Mark />
              <span className="font-serif text-xl font-semibold tracking-tight">Countless</span>
            </Link>
            <p className="flex items-center gap-2 text-xs text-ink-3">
              <span className="inline-block size-2 rounded-full bg-warn" aria-hidden="true" />
              <span>
                PayPal sandbox <span className="hidden sm:inline">· test money only</span>
              </span>
            </p>
          </div>
        </header>
        <main id="main" className="flex-1">
          {children}
        </main>
        <footer className="border-t border-rule">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs leading-relaxed text-ink-3 sm:px-6">
            Countless is a hackathon prototype, not legal advice. SSI rules were checked against the
            Social Security Administration on {shortDate(CHECKED_ON)}; confirm big decisions with a
            benefits counselor.
          </div>
        </footer>
      </body>
    </html>
  );
}
