// Built-in maps, drawn from walls alone: original, with no image to license.
import type { Wall } from "@/lib/map/geometry";

const w = (x1: number, y1: number, x2: number, y2: number, door?: boolean): Wall => ({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, ...(door ? { door: true } : {}) });
const box = (x: number, y: number, width: number, height: number): Wall[] => [w(x, y, x + width, y), w(x + width, y, x + width, y + height), w(x, y + height, x + width, y + height), w(x, y, x, y + height)];

export const BUILT_IN_MAPS: { id: string; name: string; width: number; height: number; walls: Wall[]; dark: boolean; fog: boolean }[] = [
  { id: "open", name: "Open ground", width: 30, height: 20, walls: [], dark: false, fog: false },
  {
    id: "crypt", name: "Three-room crypt", width: 30, height: 20, dark: true, fog: true,
    walls: [...box(2, 2, 10, 8), ...box(16, 2, 11, 7), ...box(8, 12, 14, 6), w(12, 5, 16, 5), w(12, 7, 16, 7), w(14, 5, 14, 7, true), w(9, 10, 9, 12), w(11, 10, 11, 12), w(9, 11, 11, 11, true), w(22, 9, 22, 13), w(24, 9, 24, 13), w(22, 13, 24, 13, true)],
  },
  {
    id: "arena", name: "Arena pit", width: 24, height: 24, dark: false, fog: false,
    walls: [...box(2, 2, 20, 20), w(6, 6, 8, 6), w(6, 6, 6, 8), w(16, 6, 18, 6), w(18, 6, 18, 8), w(6, 16, 6, 18), w(6, 18, 8, 18), w(18, 16, 18, 18), w(16, 18, 18, 18)],
  },
  {
    id: "village", name: "Village square", width: 32, height: 22, dark: false, fog: false,
    walls: [...box(3, 3, 7, 5), ...box(22, 2, 7, 6), ...box(4, 14, 6, 5), ...box(22, 14, 7, 6), ...box(14, 9, 4, 4), w(6, 8, 8, 8, true), w(24, 8, 26, 8, true), w(6, 14, 8, 14, true), w(24, 14, 26, 14, true)],
  },
];
