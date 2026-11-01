import Link from "next/link";

const LINKS = [
  { href: "/characters/new", title: "Build a character", text: "Step by step, in the 2024 order, with the math explained." },
  { href: "/characters/import", title: "Bring a character", text: "Paste a sheet from anywhere and check it against the rules." },
  { href: "/play", title: "Open a table", text: "One Dungeon Master and up to 8 players, each at home." },
  { href: "/tutorial", title: "Learn in one fight", text: "Ten minutes, one goblin, every basic rule." },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-14 sm:px-8">
      <h1 className="max-w-3xl font-display text-4xl leading-tight text-parch sm:text-5xl">Your table, wherever your friends are.</h1>
      <p className="mt-4 max-w-2xl text-lg text-parch/70">Roll real 3D dice on a shared table. Every roll is made by the server and shown live to the DM, so nobody can fudge it. Compatible with fifth edition, using the 2024 rules from the SRD.</p>
      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-lg border border-line bg-panel p-5 transition hover:border-ember">
            <h2 className="font-display text-lg text-gold">{l.title}</h2>
            <p className="mt-1 text-parch/70">{l.text}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
