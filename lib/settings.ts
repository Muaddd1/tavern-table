"use client";
import { useSyncExternalStore } from "react";

export type Settings = { fastRolls: boolean; quality: "auto" | "low" | "high"; volume: { music: number; ambience: number; dice: number; voice: number }; diceSkin: string; narration: boolean };
const DEFAULTS: Settings = { fastRolls: false, quality: "auto", volume: { music: 0.5, ambience: 0.6, dice: 0.7, voice: 0.8 }, diceSkin: "bone", narration: false };
const KEY = "tavern.settings.v1";

let current: Settings = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();
function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try { current = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { /* use defaults */ }
}
export function getSettings(): Settings { load(); return current; }
export function updateSettings(patch: Partial<Settings>) {
  load();
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* still applies this visit */ }
  listeners.forEach((l) => l());
}
export const useSettings = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getSettings, () => DEFAULTS);

// Fast 2D results on request, with reduced-motion preferences, or on weak devices.
export function wantsFastRolls() {
  const s = getSettings();
  if (s.fastRolls) return true;
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}
export function detectQuality(): "low" | "high" {
  const s = getSettings();
  if (s.quality !== "auto") return s.quality;
  if (typeof navigator === "undefined") return "high";
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency ?? 8) <= 4 || /Mobi/.test(navigator.userAgent) ? "low" : "high";
}
