"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, inputClass, Panel } from "@/components/ui";
import { saveCharacter } from "@/lib/characters/store";
import { buildReview, type Imported, type Review } from "@/lib/import/review";
import { deriveSheet, type Character } from "@/lib/rules";

const TONE = { green: "border-green-500/50 bg-green-500/10", yellow: "border-gold/50 bg-gold/10", red: "border-red-500/50 bg-red-500/10" };
const MAX_FILE = 4 * 1024 * 1024;

export default function ImportPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<Review | null>(null);
  const [name, setName] = useState("");

  // Photos are shrunk in the browser to stay within the request limit.
  const encode = async (f: File) => {
    if (f.type === "application/pdf") {
      if (f.size > MAX_FILE) throw new Error("That PDF is over 4 MB.");
      const buf = new Uint8Array(await f.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode(...buf.subarray(i, i + 32768));
      return { mediaType: "application/pdf", data: btoa(bin) };
    }
    const img = await createImageBitmap(f);
    const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = img.width * scale; c.height = img.height * scale;
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return { mediaType: "image/jpeg", data: c.toDataURL("image/jpeg", 0.85).split(",")[1] };
  };

  const read = async () => {
    setBusy(true); setError(""); setReview(null);
    try {
      // JSON from this app needs no AI at all.
      if (text.trim().startsWith("{")) {
        try {
          const character = JSON.parse(text) as Character;
          deriveSheet(character);
          setReview({ character, rows: [{ key: "json", field: "JSON", status: "green", message: "A character from this app. Everything was recalculated." }], homebrew: [], sheet: deriveSheet(character), editionQuestion: false });
          setName(character.name);
          return;
        } catch { /* Not ours: read it as ordinary text. */ }
      }
      const r = await fetch("/api/ai/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.trim() || undefined, file: file ? await encode(file) : undefined }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "Couldn't read that.");
      const rv = buildReview(body.imported as Imported);
      setReview(rv); setName(rv.character.name);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't read that."); } finally { setBusy(false); }
  };

  const confirm = () => {
    if (!review) return;
    const { id } = saveCharacter({ ...review.character, name: name.trim() || "Imported character" });
    router.push(`/characters/${id}`);
  };

  const order = { red: 0, yellow: 1, green: 2 };
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-8">
      <h1 className="font-display text-2xl text-gold">Paste your character</h1>
      <Panel>
        <p className="text-sm text-parch/70">Paste any sheet: from another AI, another app, your notes or a forum post, in any language. Or add a photo, screenshot or PDF. What you send here goes to Anthropic&apos;s AI to be read, and nothing is saved until you confirm.</p>
        <textarea aria-label="Your character" rows={10} className={`${inputClass} mt-3`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Kael Ashford, Orc Fighter 4. STR 18, DEX 13, CON 16..." />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="min-h-10 cursor-pointer rounded-md border border-line px-3 py-2 text-sm hover:bg-white/5">{file ? file.name : "Add a photo or PDF"}<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
          {file && <Button onClick={() => setFile(null)}>Remove</Button>}
          <Button variant="primary" className="ml-auto" disabled={busy || (!text.trim() && !file)} onClick={read}>{busy ? "Reading..." : "Read it"}</Button>
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
      </Panel>
      {review && (
        <Panel title="Check it over">
          <Field label="Name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <ul className="mt-3 space-y-1">
            {[...review.rows].sort((a, b) => order[a.status] - order[b.status]).map((r) => (
              <li key={r.key} data-status={r.status} className={`rounded border px-3 py-2 text-sm ${TONE[r.status]}`}><strong>{r.field}:</strong> {r.message}</li>
            ))}
          </ul>
          {review.homebrew.length > 0 && <p className="mt-2 text-sm text-parch/70">Saved privately as homebrew: {review.homebrew.join(", ")}.</p>}
          <p className="mt-2 text-sm text-parch/60">Confirming keeps the calculated numbers. You can change anything on the character&apos;s page afterwards.</p>
          <Button variant="primary" className="mt-2" disabled={!review.sheet} onClick={confirm}>Confirm and save</Button>
        </Panel>
      )}
    </main>
  );
}
