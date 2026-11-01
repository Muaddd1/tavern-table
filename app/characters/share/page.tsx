"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SheetView } from "@/components/CharacterSheet";
import { Button, titleCase } from "@/components/ui";
import { readShareHash, saveCharacter } from "@/lib/characters/store";
import { deriveSheet, type Character } from "@/lib/rules";

export default function SharedCharacter() {
  const router = useRouter();
  const [c, setC] = useState<Character | null | undefined>(undefined);
  // The character is in the link's #, so it can only be read in the browser.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setC(readShareHash(location.hash)); }, []);
  const sheet = useMemo(() => { try { return c ? deriveSheet(c) : null; } catch { return null; } }, [c]);
  if (c === undefined) return null;
  if (!c || !sheet) return <main className="p-8">This share link isn&apos;t complete. Ask for it again.</main>;
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <h1 className="font-display text-2xl text-gold">{c.name}</h1>
          <p className="text-sm text-parch/70">Level {sheet.level} {titleCase(c.speciesId)} {c.classes.map((x) => `${titleCase(x.classId)} ${x.level}`).join(" / ")}. Shared by its creator; any homebrew here is user-created.</p>
        </div>
        <Button variant="primary" onClick={() => router.push(`/characters/${saveCharacter(c).id}`)}>Copy to my characters</Button>
      </div>
      <div className="mt-4"><SheetView sheet={sheet} /></div>
      {c.details?.backstory && <p className="mt-4 whitespace-pre-line text-parch/80">{c.details.backstory}</p>}
    </main>
  );
}
