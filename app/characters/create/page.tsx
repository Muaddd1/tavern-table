"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, inputClass, Panel } from "@/components/ui";

export default function CreateWithAi() {
  const router = useRouter();
  const [concept, setConcept] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    setBusy(true); setError("");
    const r = await fetch("/api/ai/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ concept }) }).catch(() => null);
    const body = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok || !body) { setError(body?.error ?? "Couldn't reach the server."); return; }
    sessionStorage.setItem("tavern.draft", JSON.stringify(body.character));
    router.push("/characters/new");
  };
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-8">
      <h1 className="font-display text-2xl text-gold">Create with AI</h1>
      <Panel>
        <p className="text-sm text-parch/70">Describe a character in your own words. The AI suggests a full legal build and a backstory, which opens in the builder for you to change.</p>
        <textarea aria-label="Your concept" rows={4} className={`${inputClass} mt-3`} placeholder="A cursed knight who sold his soul" value={concept} onChange={(e) => setConcept(e.target.value)} />
        <Button variant="primary" className="mt-2" disabled={busy || concept.trim().length < 3} onClick={go}>{busy ? "Thinking..." : "Suggest a character"}</Button>
        {error && <p role="alert" className="mt-2 text-sm text-gold">{error}</p>}
      </Panel>
    </main>
  );
}
