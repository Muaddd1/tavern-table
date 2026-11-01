# Tavern Table

An online tabletop compatible with fifth edition, using the SRD 5.2.1 rules. "Tavern Table" is a working name. See [PLAN.md](PLAN.md) for the full design.

**Status:** Phase 1 of 9 is done: SRD data and the rules engine. There's no playable app yet.

## Setup

Needs Node 24.

```bash
npm install
npm test        # rules engine and data checks
npm run dev     # placeholder page, at http://localhost:3000
```

## Rules engine

All game math is pure TypeScript in `lib/rules`, with no React and no I/O.

| File | Covers |
|---|---|
| `sheet.ts` | `deriveSheet(character)`: scores, saves, skills, AC, HP, speed, attacks, spellcasting, resources, jumps, carrying |
| `state.ts` | Session state: damage, healing, temporary HP, death saves, concentration, resources, slots, rests |
| `conditions.ts` | Advantage and Disadvantage, automatic failures and critical hits, from the 15 conditions |
| `turn.ts` | Per-turn limits: action, Bonus Action, Reaction, movement, one slot spell |
| `spells.ts` | Cantrip scaling, upcasting, ritual rules |
| `validate.ts` | Legality checks, with a DM override |
| `companions.ts` | Mini stat blocks from the bestiary |

Every derived number is `{ value, parts }`, so tooltips come from the math: `explain()` gives "+6 = +4 Strength + +2 proficiency".

Features are data. `data/srd/mechanics.ts` maps SRD features to effects, and homebrew uses the same format. A feature without an effect appears as text for the player and DM to apply, so not every feature is automated.

## SRD data

```
data/srd/raw/          5e-database 2024 data (MIT, license alongside)
scripts/import-srd.mjs builds data/srd/*.json, with the fixes below
scripts/audit-srd.mjs  compares the shipped data with the official PDF
```

To re-audit, download the [SRD 5.2.1 PDF](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf). The PDF isn't kept in this repo.

```bash
pdftotext SRD_CC_v5.2.1.pdf srd.txt
node scripts/audit-srd.mjs srd.txt
```

Fixes made to the source data after comparing it with the PDF:

| Problem in 5e-database | Fix |
|---|---|
| Dulcimer isn't in the SRD | Removed |
| Wizard prepared spells wrong at levels 14-20 | Corrected, up to 25 |
| Druid cantrips wrong at levels 7 and 16 | Corrected |
| Protection from Evil and Good missing Concentration | Corrected |
| Rogues given longsword training | Removed |
| 6 stat blocks missing | Added from the PDF |
| "Half-Plate Armor", "Two Weapon Fighting" | Renamed to match the PDF |
| Words split by hyphens, API urls, hosted images | Cleaned up or removed |

## Tests

| File | Covers |
|---|---|
| `tests/unit/characters.test.ts` | 37 characters checked against hand-calculated numbers, plus Kael and a companion |
| `tests/unit/rules.test.ts` | Armor, weapons, multiclassing, damage, rests, conditions, turn limits, legality |
| `tests/unit/srd-data.test.ts` | Licensing checks on shipped data, and class tables against the PDF |

`tests/fixtures/characters.ts` holds a homebrew Kael Ashford, as numbers only, to prove that homebrew runs through the same format as SRD content.

## Licensing

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
