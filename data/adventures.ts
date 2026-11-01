// Three short one-shots, written from scratch for this app. The AI DM runs them; a human DM can
// read them too. Monster names are from the SRD. Fights scale with party size and level.
export type Adventure = { id: string; title: string; hook: string; environment: string; mapId: string; brief: string };

const SCALING = "Scale every fight: choose monsters with the XP Budget for a Moderate fight at this party's size and level (the app gives you those numbers), and a High one for the finale. Swap in stronger or more monsters from the SRD as needed.";

export const ADVENTURES: Adventure[] = [
  {
    id: "lamplighters-crypt", title: "The Lamplighter's Crypt", environment: "dungeon", mapId: "crypt",
    hook: "Every lamp in Harrowby went out at once, and the old lamplighter's tomb stands open.",
    brief: `The village of Harrowby has kept one rule for a century: the lamps stay lit. Last night they all died, and the crypt of Oswin the Lamplighter stands open. Villagers beg the party to relight the Mother Flame, kept in Oswin's tomb.
Room 1, the Antechamber: skeletons stand in the alcoves holding dead lanterns. They attack anyone who enters without a light. A Perception check spots a loose flagstone hiding a pit (DC 13 Dexterity save, 2d6 bludgeoning).
Room 2, the Oil Vault: casks of lamp oil and a Giant Spider nest. Fire here is dangerous and useful: burning oil deals 2d6 fire to anything nearby. A journal explains Oswin bound something in the dark, and the flame kept it asleep.
Room 3, the Tomb: Oswin's Specter or Wraith tends the guttering Mother Flame, convinced the village forgot him. He can be fought, or talked down with a Persuasion check (DC 15) by promising to remember his name. Relighting the flame banishes the shadows and ends the fight.
Reward: Harrowby's thanks, a Potion of Healing per character, and an Everburning lantern (light 30 feet, no fuel). ${SCALING}`,
  },
  {
    id: "the-quiet-in-marrowfen", title: "The Quiet in Marrowfen", environment: "forest", mapId: "village",
    hook: "The people of Marrowfen stopped talking three days ago. They still smile.",
    brief: `Marrowfen is a marsh village where nobody speaks. They write notes begging for help, then eat the notes. The party arrives at dusk. Tone is eerie rather than gory.
Clues: every home has its mirrors turned to the wall. Children draw a tall figure at the well. A Medicine check shows no illness. An Insight check shows the villagers are terrified. Bells in the chapel have had their clappers removed.
The truth: the priest, Father Aldous, made a bargain for his dying daughter with a Ghost drowned in the well. It feeds on voices, and it has hers. Each night it takes another. Shadows gather near anyone who speaks aloud after dark, so the party should notice that talking draws danger.
Finale at the well, at midnight: Shadows and Specters rise around the ghost. Defeat it, or free it by bringing up its bones from the well (Athletics DC 14) and speaking its name, found in the chapel's old records (Investigation DC 13). Voices return all at once, and the whole village screams, then weeps.
Reward: Aldous's silver holy symbol, a Scroll of Protection from Evil and Good, and a village that will shelter the party always. ${SCALING}`,
  },
  {
    id: "ashfall-games", title: "The Ashfall Games", environment: "desert", mapId: "arena",
    hook: "Win three bouts in the Ashfall arena and the Sand Queen grants one wish of gold. Nobody mentions what happened to last year's winners.",
    brief: `The city of Ashfall holds its yearly games in a sunken pit. Characters may enter as a team. Tone is loud, bright and fun: a roaring crowd, a showy announcer called Velvet Tam, and bets on everything.
Between bouts: the crowd favors style. A good Performance check (DC 13) before a fight earns the team Advantage on their first attack. Rival team: the Brass Sisters, friendly and fair, who warn the party the final bout is rigged.
Bout 1: Giant Hyenas or Wolves, released from gates at the four corners. Bout 2: Gladiators or Veterans, the Brass Sisters' team if the party has been rude to them. The arena pillars give cover. Sand pits are Difficult Terrain.
Bout 3: Sand Queen Ysolde sends a Bulette or Young Dragon into the pit and bars the gates, since last year's winners are chained under the arena as her servants. The party can win by force, or expose her cheating to the crowd with a Persuasion or Intimidation check (DC 15), which makes the crowd riot and open the gates.
Reward: 200 GP per character, freed prisoners who owe the party, and the Brass Sisters as friends. ${SCALING}`,
  },
];
