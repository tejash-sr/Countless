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
    // A coin with an open "C": money passes through, and the green dot is the $0 Countless keeps.
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
      <circle cx="14" cy="14" r="13" fill="#1c1a16" />
      <circle cx="14" cy="14" r="10.4" fill="none" stroke="#f9f7f2" strokeOpacity="0.25" strokeWidth="1" />
      <path d="M18.6 9.4A6.5 6.5 0 1 0 18.6 18.6" fill="none" stroke="#f9f7f2" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="20.6" cy="14" r="1.9" fill="#3fb37a" />
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
