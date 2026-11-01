// Audits the shipped data in data/srd against text from the official SRD 5.2.1 PDF:
//   pdftotext SRD_CC_v5.2.1.pdf srd.txt && node scripts/audit-srd.mjs srd.txt
// Exits non-zero if anything differs, so it can gate a data update.
import fs from "node:fs";
const txtPath = process.argv[2];
const L = (f) => JSON.parse(fs.readFileSync(`data/srd/${f}.json`, "utf8"));
const lines = fs.readFileSync(txtPath, "latin1").split(/\r?\n/).map((s) => s.trim());
const norm = (s) => s.toLowerCase().replace(/[’'\x92]/g, "'").replace(/\s+/g, " ").trim();
const flat = norm(lines.join(" "));
let problems = 0;
const report = (label, list) => { console.log(`${label}: ${list.length}`); for (const x of list.slice(0, 60)) console.log("   ", x); problems += list.length; };

// Spells: every PDF spell is in the data, with the same level, school, concentration and ritual.
const spells = new Map(L("spells").map((s) => [norm(s.name), s]));
const spellDiffs = [], seenSpells = new Set();
for (let i = 1; i < lines.length; i++) {
  const m = lines[i].match(/^(?:Level ([1-9]) ([A-Z][a-z]+)|([A-Z][a-z]+) Cantrip) \(/);
  if (!m) continue;
  let j = i - 1;
  while (j > 0 && !lines[j]) j--;
  const s = spells.get(norm(lines[j]));
  if (!s) { spellDiffs.push(`not in data: ${lines[j]}`); continue; }
  seenSpells.add(s.id);
  const level = m[1] ? +m[1] : 0, school = (m[2] || m[3]).toLowerCase();
  if (s.level !== level) spellDiffs.push(`${s.name}: level ${s.level} vs PDF ${level}`);
  if (s.school !== school) spellDiffs.push(`${s.name}: school ${s.school} vs PDF ${school}`);
  const head = lines.slice(i, i + 8).join(" ");
  const headTop = head.slice(0, head.indexOf("Duration:") + 40);
  if (/Duration: Concentration/.test(headTop) !== s.concentration) spellDiffs.push(`${s.name}: concentration ${s.concentration}`);
  if (/\bor Ritual\b|Ritual/.test(head.split("Range:")[0]) !== s.ritual) spellDiffs.push(`${s.name}: ritual ${s.ritual}`);
}
for (const s of spells.values()) if (!seenSpells.has(s.id)) spellDiffs.push(`not found in PDF: ${s.name}`);
report("spell differences", spellDiffs);

// Monsters: every PDF stat block is in the data, with the same AC, HP and ability scores.
const monsters = new Map(L("monsters").map((m) => [norm(m.name), m]));
const formOf = (name) => monsters.get(norm(`${name}, ${name === "Vampire" ? "Vampire" : "Human"} Form`));
const monDiffs = [];
let compared = 0;
const size = /^(Tiny|Small|Medium|Large|Huge|Gargantuan)( or (Small|Medium))? [A-Z]/;
for (let i = 1; i < lines.length; i++) {
  if (!size.test(lines[i])) continue;
  const name = lines[i - 1];
  const block = lines.slice(i, i + 40).join(" ");
  const ac = block.match(/AC (\d+)/), hp = block.match(/HP (\d+)/);
  if (!/^AC |\bAC \d/.test(block)) continue;
  const m = monsters.get(norm(name)) ?? formOf(name);
  if (!m) { monDiffs.push(`not in data: ${name}`); continue; }
  compared++;
  if (m.ac !== null && ac && m.ac !== +ac[1]) monDiffs.push(`${name}: AC ${m.ac} vs PDF ${ac[1]}`);
  if (m.hp !== null && hp && m.hp !== +hp[1]) monDiffs.push(`${name}: HP ${m.hp} vs PDF ${hp[1]}`);
  for (const [k, abbr] of [["str", "Str"], ["dex", "Dex"], ["con", "Con"], ["int", "Int"], ["wis", "Wis"], ["cha", "Cha"]]) {
    const v = block.match(new RegExp(`${abbr} (\\d+)`));
    if (v && m.scores[k] !== +v[1]) monDiffs.push(`${name}: ${abbr} ${m.scores[k]} vs PDF ${v[1]}`);
  }
}
console.log(`stat blocks compared: ${compared}`);
report("monster differences", monDiffs);

// Names: anything here isn't in the SRD, or is named differently. Scroll tiers are table rows.
const NAME_OK = new Set(["Spell Scroll, Cantrip", "Spell Scroll, Level 1"]);
for (const f of ["items", "feats", "species", "backgrounds", "subclasses"]) {
  report(`${f} names not in PDF`, L(f).filter((x) => !NAME_OK.has(x.name) && !flat.includes(norm(x.name))).map((x) => x.name));
}
console.log(problems ? `\n${problems} item(s) to review` : "\nclean");
process.exit(problems ? 1 : 0);
