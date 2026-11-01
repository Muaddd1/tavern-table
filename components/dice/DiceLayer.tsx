"use client";
// Draws thrown dice inside any R3F scene: the overlay, or the 3D table.
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { frameAt, frameCount, type DieFrames } from "@/lib/dice/physics";
import { assignLabels, dieShape, type DieShape } from "@/lib/dice/shapes";

export const SKINS: Record<string, { color: string; text: string; roughness: number; metalness: number; opacity?: number }> = {
  bone: { color: "#e8dcc2", text: "#2a2118", roughness: 0.55, metalness: 0 },
  obsidian: { color: "#17151c", text: "#e8d9a8", roughness: 0.18, metalness: 0.3 },
  gold: { color: "#c9a23f", text: "#3a2a08", roughness: 0.28, metalness: 0.9 },
  glass: { color: "#7fb7d6", text: "#ffffff", roughness: 0.08, metalness: 0.1, opacity: 0.72 },
  wood: { color: "#7a4e2a", text: "#f3e3c6", roughness: 0.8, metalness: 0 },
};

function faceGeometry(shape: DieShape) {
  const g = new THREE.BufferGeometry();
  const pos: number[] = [], normals: number[] = [], uvs: number[] = [];
  shape.faces.forEach((f, i) => {
    const n = new THREE.Vector3(...f.normal);
    const c = new THREE.Vector3(...f.center);
    // Label "up" points to the first vertex, so numbers read outward from a face's tip.
    const up = new THREE.Vector3(...f.vertices[0]).sub(c).normalize();
    const right = new THREE.Vector3().crossVectors(up, n).normalize();
    const size = Math.max(...f.vertices.map((v) => new THREE.Vector3(...v).sub(c).length())) * 2.1;
    const uv = (v: [number, number, number]) => {
      const d = new THREE.Vector3(...v).sub(c);
      return [0.5 + d.dot(right) / size, 0.5 + d.dot(up) / size];
    };
    const start = pos.length / 3;
    for (let t = 1; t < f.vertices.length - 1; t++) {
      for (const v of [f.vertices[0], f.vertices[t], f.vertices[t + 1]]) {
        pos.push(...v); normals.push(...f.normal); uvs.push(...uv(v));
      }
    }
    g.addGroup(start, pos.length / 3 - start, i);
  });
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return g;
}

const geometries = new Map<number, THREE.BufferGeometry>();
const geometryFor = (sides: number) => {
  if (!geometries.has(sides)) geometries.set(sides, faceGeometry(dieShape(sides)));
  return geometries.get(sides)!;
};

const textures = new Map<string, THREE.CanvasTexture>();
function labelTexture(text: string, skin: string, tint: string, underline: boolean) {
  const key = `${text}|${skin}|${tint}|${underline}`;
  const hit = textures.get(key);
  if (hit) return hit;
  const s = SKINS[skin] ?? SKINS.bone;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = s.text;
  ctx.font = `bold ${text.length > 1 ? 44 : 54}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 64, 64);
  if (underline) ctx.fillRect(44, 90, 40, 5);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  textures.set(key, t);
  return t;
}

export type ThrownDie = { frames: DieFrames; label: string[]; skin: string; tint?: string; dimmed?: boolean; highlight?: "gold" | "red" };
export type DieLabels = { value: number; kind?: "tens" | "ones" };

// Text for each face after relabeling, so the landing face shows the server's value.
export function faceLabels(frames: DieFrames, d: DieLabels): string[] {
  const { sides, topFace } = frames;
  // A d4 rests on its result, so every face that can be seen shows it, as a real d4's top corner does.
  if (sides === 4) return assignLabels(4, topFace, d.value).map((n, i) => String(i === topFace ? n : d.value));
  const shown = sides === 10 && d.value === 0 ? 10 : d.value;
  return assignLabels(sides, topFace, shown).map((n) => {
    if (sides !== 10) return String(n);
    if (d.kind === "tens") return `${(n % 10) * 10}`.padStart(2, "0");
    return String(n % 10);
  });
}

function Die({ die, startedAt, speed = 1 }: { die: ThrownDie; startedAt: number; speed?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const materials = useMemo(() => {
    const s = SKINS[die.skin] ?? SKINS.bone;
    const tint = die.tint ?? s.color;
    return die.label.map((text) => new THREE.MeshStandardMaterial({
      map: labelTexture(text, die.skin, tint, die.frames.sides >= 8 && (text === "6" || text === "9")),
      roughness: s.roughness, metalness: s.metalness, transparent: s.opacity !== undefined || !!die.dimmed, opacity: die.dimmed ? 0.45 : s.opacity ?? 1,
      emissive: die.highlight === "gold" ? new THREE.Color("#a87b12") : die.highlight === "red" ? new THREE.Color("#7a1818") : new THREE.Color("#000"), emissiveIntensity: 0,
    }));
  }, [die]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  // eslint-disable-next-line react-hooks/immutability
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const step = Math.floor(((performance.now() - startedAt) / 1000) * 60 * speed);
    const { p, q } = frameAt(die.frames, step);
    // Three.js objects are meant to be changed every frame, outside React.
    m.position.set(p[0], p[1], p[2]);
    m.quaternion.set(q[0], q[1], q[2], q[3]);
    // eslint-disable-next-line react-hooks/immutability
    if (die.highlight && step >= frameCount(die.frames)) for (const mat of materials) mat.emissiveIntensity = 0.5 + Math.sin(performance.now() / 180) * 0.25;
  });
  return <mesh ref={ref} geometry={geometryFor(die.frames.sides)} material={materials} castShadow />;
}

export function DiceLayer({ thrown }: { thrown: { id: string; dice: ThrownDie[]; startedAt: number }[] }) {
  return <>{thrown.flatMap((t) => t.dice.map((die, i) => <Die key={`${t.id}:${i}`} die={die} startedAt={t.startedAt} />))}</>;
}
