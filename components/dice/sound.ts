// Dice clicks synthesized on the spot, so there's no audio file to license.
// Harder surfaces ring higher and longer than soft ones.
export const SURFACES = { wood: { freq: 900, decay: 0.05 }, stone: { freq: 2100, decay: 0.03 }, felt: { freq: 400, decay: 0.09 } };
let ctx: AudioContext | null = null;
let surface: keyof typeof SURFACES = "wood";
export const setDiceSurface = (s: keyof typeof SURFACES) => { surface = s; };

function click(at: number, gain: number) {
  if (!ctx) return;
  const { freq, decay } = SURFACES[surface];
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = freq * (0.8 + Math.random() * 0.4);
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  osc.connect(g).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + decay);
}

export function playDiceClicks(frames: number, volume: number) {
  if (volume <= 0 || typeof AudioContext === "undefined") return;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") ctx.resume().catch(() => undefined);
  const duration = Math.min(frames / 60, 2.5);
  const now = ctx.currentTime;
  // Bounces come fast and loud at first, then slow and quiet as the die settles.
  for (let t = 0.12, gap = 0.09, g = 0.25; t < duration; t += gap, gap *= 1.25, g *= 0.82) click(now + t, g * volume);
}
