import type { Metadata } from "next";

export const metadata: Metadata = { title: "About - Tavern Table" };

export default function About() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-16 leading-relaxed text-zinc-300 sm:px-8">
      <h1 className="text-3xl font-semibold text-zinc-100">About</h1>
      <p>Tavern Table is an online tabletop compatible with fifth edition.</p>
      <h2 className="pt-4 text-xl font-semibold text-zinc-100">Rules content</h2>
      <p>
        This work includes material from the System Reference Document 5.2.1 (&quot;SRD 5.2.1&quot;) by Wizards of the Coast LLC, available at{" "}
        <a className="underline" href="https://www.dndbeyond.com/srd">https://www.dndbeyond.com/srd</a>. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at{" "}
        <a className="underline" href="https://creativecommons.org/licenses/by/4.0/legalcode">https://creativecommons.org/licenses/by/4.0/legalcode</a>.
      </p>
      <p>The SRD material has been reformatted into structured data for this app, and corrected where the source data differed from the official document.</p>
      <p>
        The structured data started from <a className="underline" href="https://github.com/5e-bits/5e-database">5e-database</a>, available under the MIT License.
      </p>
      <p>Tavern Table is not affiliated with or endorsed by Wizards of the Coast.</p>
    </main>
  );
}
