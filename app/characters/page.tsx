"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, inputClass, titleCase } from "@/components/ui";
import { deleteCharacter, duplicateCharacter, listCharacters, saveCharacter, updateMeta, type SavedCharacter } from "@/lib/characters/store";
import { deriveSheet, totalLevel, type Character } from "@/lib/rules";

export default function Library() {
  const [list, setList] = useState<SavedCharacter[]>([]);
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [note, setNote] = useState("");
  const refresh = () => setList(listCharacters());
  // localStorage only exists in the browser, so this can't happen during server rendering.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh(); }, []);
  const folders = useMemo(() => [...new Set(list.map((c) => c.folder).filter(Boolean))] as string[], [list]);
  const shown = list.filter((c) => !!c.archived === showArchived && (!folder || c.folder === folder) && c.character.name.toLowerCase().includes(q.toLowerCase()));

  const importJson = async (file: File) => {
    try {
      const character = JSON.parse(await file.text()) as Character;
      deriveSheet(character);
      saveCharacter(character);
      setNote(`Imported ${character.name}.`);
      refresh();
    } catch { setNote("That file isn't a character from this app. To bring one from elsewhere, use Import."); }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto font-display text-2xl text-gold">Your characters</h1>
        <Link href="/characters/new"><Button variant="primary">New character</Button></Link>
        <Link href="/characters/import"><Button>Import from anywhere</Button></Link>
        <Link href="/characters/create"><Button>Create with AI</Button></Link>
        <label className="min-h-10 cursor-pointer rounded-md border border-line px-3 py-2 text-sm hover:bg-white/5">Load JSON<input type="file" accept="application/json" className="sr-only" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} /></label>
      </div>
      <p className="mt-2 text-sm text-parch/50">Saved in this browser. Clearing your browser data removes them, so export anything you want to keep.</p>
      {note && <p role="status" className="mt-2 text-sm text-gold">{note}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search by name" className={`${inputClass} max-w-xs`} />
        <select value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Folder" className={`${inputClass} max-w-48`}>
          <option value="">All folders</option>
          {folders.map((f) => <option key={f}>{f}</option>)}
        </select>
        <Button onClick={() => setShowArchived((v) => !v)}>{showArchived ? "Show active" : "Show archived"}</Button>
      </div>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {shown.map((c) => {
          let summary = "";
          try {
            const s = deriveSheet(c.character);
            summary = `Level ${totalLevel(c.character)} ${titleCase(c.character.speciesId)} ${c.character.classes.map((x) => titleCase(x.classId)).join(" / ")} · AC ${s.ac.value} · HP ${s.hpMax.value}`;
          } catch { summary = "Has data this version can't read"; }
          return (
            <li key={c.id} className="rounded-lg border border-line bg-panel p-4" style={c.character.details?.themeColor ? { borderLeft: `4px solid ${c.character.details.themeColor}` } : undefined}>
              <div className="flex gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.character.details?.portrait && <img src={c.character.details.portrait} alt="" className="h-14 w-14 rounded-full object-cover" />}
                <div className="min-w-0">
                  <Link href={`/characters/${c.id}`} className="font-display text-lg text-parch hover:text-ember">{c.character.name}</Link>
                  <p className="text-sm text-parch/60">{summary}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => { duplicateCharacter(c.id); refresh(); }}>Duplicate</Button>
                <Button onClick={() => { const f = prompt("Folder name", c.folder ?? ""); if (f !== null) { updateMeta(c.id, { folder: f || undefined }); refresh(); } }}>Folder</Button>
                <Button onClick={() => { updateMeta(c.id, { archived: !c.archived }); refresh(); }}>{c.archived ? "Restore" : "Archive"}</Button>
                {c.archived && <Button variant="danger" onClick={() => { if (confirm(`Delete ${c.character.name} for good?`)) { deleteCharacter(c.id); refresh(); } }}>Delete</Button>}
              </div>
            </li>
          );
        })}
      </ul>
      {!shown.length && <p className="mt-8 text-parch/60">{list.length ? "No characters match." : "No characters yet. Build one to get started."}</p>}
    </main>
  );
}
