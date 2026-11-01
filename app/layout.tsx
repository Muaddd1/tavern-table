import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Alegreya_Sans, Cinzel } from "next/font/google";
import { DiceProvider } from "@/components/dice/DiceProvider";
import { Nav } from "@/components/Nav";
import "./globals.css";

const body = Alegreya_Sans({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "700"] });
const heading = Cinzel({ variable: "--font-heading", subsets: ["latin"], weight: ["500", "700"] });

export const metadata: Metadata = {
  title: "Tavern Table",
  description: "An online tabletop compatible with fifth edition, using the SRD 5.2.1 rules.",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { themeColor: "#120f0c", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${heading.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <DiceProvider>
          <Nav />
          <div className="flex-1">{children}</div>
        </DiceProvider>
        <footer className="border-t border-line px-4 py-5 text-xs leading-relaxed text-parch/50 sm:px-8">
          <p className="mx-auto max-w-4xl">
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
