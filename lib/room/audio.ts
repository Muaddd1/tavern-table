"use client";
// Scene sound: ambience and music that cross-fade together on every device, at the time the
// server gave. Browsers only allow sound after a tap, so the room shows a button until then.
import { Howl } from "howler";
import { getSettings } from "@/lib/settings";

const FADE_MS = 2500;
let ambience: { src: string; howl: Howl } | null = null;
let music: { src: string; howl: Howl } | null = null;

function swap(current: { src: string; howl: Howl } | null, src: string | null, volume: number, startAt: number) {
  if (current?.src === src) { current?.howl.volume(volume); return current; }
  const wait = Math.max(0, startAt - Date.now());
  const old = current;
  if (old) setTimeout(() => { old.howl.fade(old.howl.volume(), 0, FADE_MS); setTimeout(() => old.howl.unload(), FADE_MS + 100); }, wait);
  if (!src) return null;
  const howl = new Howl({ src: [src], loop: true, volume: 0, html5: false });
  setTimeout(() => { howl.play(); howl.fade(0, volume, FADE_MS); }, wait);
  return { src, howl };
}

export function playScene(environment: string, track: string | undefined, startAt: number, customTrack?: string) {
  const { volume } = getSettings();
  ambience = swap(ambience, `/audio/ambience-${environment}.mp3`, volume.ambience, startAt);
  music = swap(music, customTrack || (track && track !== "none" ? `/audio/music-${track}.mp3` : null), volume.music, startAt);
}
export function applyVolumes() {
  const { volume } = getSettings();
  ambience?.howl.volume(volume.ambience);
  music?.howl.volume(volume.music);
}
export function stopScene() {
  ambience?.howl.unload(); music?.howl.unload();
  ambience = music = null;
}
