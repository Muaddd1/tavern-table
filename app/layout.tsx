import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tavern Table",
  description: "An online tabletop compatible with fifth edition, using the SRD 5.2.1 rules.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-white/10 px-4 py-6 text-xs leading-relaxed text-zinc-400 sm:px-8">
          <p className="mx-auto max-w-3xl">
            This work includes material from the System Reference Document 5.2.1 (&quot;SRD 5.2.1&quot;) by Wizards of the Coast LLC, available at{" "}
            <a className="underline" href="https://www.dndbeyond.com/srd">https://www.dndbeyond.com/srd</a>. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at{" "}
            <a className="underline" href="https://creativecommons.org/licenses/by/4.0/legalcode">https://creativecommons.org/licenses/by/4.0/legalcode</a>.{" "}
            <Link className="underline" href="/about">About</Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
