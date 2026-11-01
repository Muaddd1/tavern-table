// Guest storage: everything is saved in this browser. Wrapped in try/catch because storage can
// be unavailable or full, and the app should keep working for the current visit.
import type { Character } from "@/lib/rules";

export type SavedCharacter = { id: string; character: Character; folder?: string; archived?: boolean; updatedAt: number; versions: { at: number; character: Character }[] };

const KEY = "tavern.characters.v1";
const MAX_VERSIONS = 30;

function read(): SavedCharacter[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
function write(list: SavedCharacter[]): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}

export const listCharacters = () => read().sort((a, b) => b.updatedAt - a.updatedAt);
export const getCharacter = (id: string) => read().find((c) => c.id === id) ?? null;

export function saveCharacter(character: Character, id: string = crypto.randomUUID()): { id: string; saved: boolean } {
  const list = read();
  const existing = list.find((c) => c.id === id);
  if (existing) {
    if (JSON.stringify(existing.character) !== JSON.stringify(character)) {
      existing.versions = [{ at: existing.updatedAt, character: existing.character }, ...existing.versions].slice(0, MAX_VERSIONS);
    }
    existing.character = character;
    existing.updatedAt = Date.now();
  } else list.push({ id, character, updatedAt: Date.now(), versions: [] });
  return { id, saved: write(list) };
}
export function updateMeta(id: string, patch: Partial<Pick<SavedCharacter, "folder" | "archived">>) {
  write(read().map((c) => (c.id === id ? { ...c, ...patch } : c)));
}
export const deleteCharacter = (id: string) => write(read().filter((c) => c.id !== id));
export const duplicateCharacter = (id: string) => {
  const c = getCharacter(id);
  return c ? saveCharacter({ ...c.character, name: `${c.character.name} (copy)` }).id : null;
};
export const restoreVersion = (id: string, at: number) => {
  const c = getCharacter(id);
  const v = c?.versions.find((x) => x.at === at);
  if (v) saveCharacter(v.character, id);
};

// Sharing without an account: the character travels inside the link, after the #, which browsers
// don't send to the server.
export function shareLink(character: Character, origin: string) {
  const { details, ...rest } = character;
  const { portrait: _omit, ...lightDetails } = details ?? {};
  void _omit;
  const json = JSON.stringify({ ...rest, details: lightDetails });
  const bytes = new TextEncoder().encode(json);
  return `${origin}/characters/share#${btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}
export function readShareHash(hash: string): Character | null {
  try {
    const b64 = hash.replace(/^#/, "").replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; }
}
