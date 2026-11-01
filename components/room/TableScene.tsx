"use client";
// The 3D table: the battle map lies on a table in a themed room, and dice land on it.
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useDice } from "@/components/dice/DiceProvider";
import { DiceLayer } from "@/components/dice/DiceLayer";
import { setDiceSurface, SURFACES } from "@/components/dice/sound";
import type { RoomView } from "@/lib/room/redact";
import { detectQuality } from "@/lib/settings";

type Env = { fog: string; wall: string; floor: string; table: string; light: string; ambient: number; torches: number; embers: boolean; embersColor: string; surface: keyof typeof SURFACES; sky?: string };
export const ENV_LOOK: Record<string, Env> = {
  dungeon: { fog: "#0c0a08", wall: "#3a3530", floor: "#23201c", table: "#5b3b22", light: "#ff9a4d", ambient: 0.18, torches: 4, embers: true, embersColor: "#ffb066", surface: "wood" },
  cave: { fog: "#07090b", wall: "#2b2d2e", floor: "#1b1c1d", table: "#4a4640", light: "#7fb2d6", ambient: 0.15, torches: 2, embers: false, embersColor: "#fff", surface: "stone" },
  forest: { fog: "#0a1410", wall: "#16251a", floor: "#141f14", table: "#4d3a24", light: "#c8d8ff", ambient: 0.2, torches: 2, embers: true, embersColor: "#c7f08a", surface: "wood", sky: "#07100c" },
  tavern: { fog: "#1a0f08", wall: "#54351d", floor: "#3a2415", table: "#6f4524", light: "#ffb26b", ambient: 0.35, torches: 4, embers: true, embersColor: "#ffc27a", surface: "wood" },
  castle: { fog: "#0e0f13", wall: "#4a4b52", floor: "#2a2b30", table: "#3a2518", light: "#ffd9a8", ambient: 0.25, torches: 4, embers: false, embersColor: "#fff", surface: "felt" },
  ship: { fog: "#10171d", wall: "#4b3722", floor: "#3c2b1a", table: "#5c4128", light: "#ffcf96", ambient: 0.3, torches: 2, embers: false, embersColor: "#fff", surface: "wood", sky: "#141d26" },
  desert: { fog: "#3a2a18", wall: "#7a5f3a", floor: "#6e5530", table: "#7b6a4a", light: "#ffd9a0", ambient: 0.6, torches: 0, embers: false, embersColor: "#fff", surface: "stone", sky: "#6d5a3c" },
  infernal: { fog: "#1c0604", wall: "#2c1412", floor: "#1d0b09", table: "#2b2422", light: "#ff4a1f", ambient: 0.2, torches: 4, embers: true, embersColor: "#ff6a2a", surface: "stone" },
};

function Torch({ position, color, seed }: { position: [number, number, number]; color: string; seed: number }) {
  const light = useRef<THREE.PointLight>(null);
  const flame = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + seed;
    const flicker = 0.85 + Math.sin(t * 11) * 0.08 + Math.sin(t * 23.7) * 0.05 + Math.sin(t * 3.1) * 0.06;
    if (light.current) light.current.intensity = 60 * flicker;
    if (flame.current) flame.current.scale.setScalar(0.9 + flicker * 0.25);
  });
  return (
    <group position={position}>
      <mesh position={[0, -0.6, 0]}><cylinderGeometry args={[0.07, 0.1, 1.1, 6]} /><meshStandardMaterial color="#2a1a0e" /></mesh>
      <mesh ref={flame}><sphereGeometry args={[0.2, 8, 8]} /><meshBasicMaterial color={color} /></mesh>
      <pointLight ref={light} color={color} distance={22} decay={2} />
    </group>
  );
}

function emberSeeds(count: number) {
  let v = 12345;
  const rand = () => { v = (v * 16807) % 2147483647; return v / 2147483647; };
  return Array.from({ length: count }, () => [rand() * 28 - 14, rand() * 10, rand() * 20 - 10, 0.3 + rand() * 0.7]);
}

function Embers({ color, count }: { color: string; count: number }) {
  const ref = useRef<THREE.Points>(null);
  const seeds = useMemo(() => emberSeeds(count), [count]);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
    return g;
  }, [count]);
  useFrame(({ clock }) => {
    const pos = ref.current?.geometry.getAttribute("position");
    if (!pos) return;
    const t = clock.elapsedTime;
    seeds.forEach((s, i) => pos.setXYZ(i, s[0] + Math.sin(t * s[3] + i) * 0.6, (s[1] + t * s[3] * 0.7) % 10, s[2] + Math.cos(t * s[3] + i) * 0.6));
    pos.needsUpdate = true;
  });
  return <points ref={ref} geometry={geometry}><pointsMaterial color={color} size={0.07} transparent opacity={0.85} depthWrite={false} blending={THREE.AdditiveBlending} /></points>;
}

// Paints the redacted map onto a canvas for the tabletop.
function useMapTexture(view: RoomView) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024; canvas.height = 640;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  const { map, tokens } = view;
  useEffect(() => {
    const canvas = texture.image as HTMLCanvasElement;
    const c = canvas.getContext("2d")!;
    const sx = canvas.width / map.width, sy = canvas.height / map.height;
    c.fillStyle = "#d8c9a8"; c.fillRect(0, 0, canvas.width, canvas.height);
    c.strokeStyle = "rgba(60,40,20,.25)"; c.lineWidth = 1;
    for (let x = 0; x <= map.width; x++) { c.beginPath(); c.moveTo(x * sx, 0); c.lineTo(x * sx, canvas.height); c.stroke(); }
    for (let y = 0; y <= map.height; y++) { c.beginPath(); c.moveTo(0, y * sy); c.lineTo(canvas.width, y * sy); c.stroke(); }
    c.lineWidth = 5; c.lineCap = "round";
    for (const w of map.walls) { c.strokeStyle = w.door ? "#8a4a12" : "#3a2a18"; c.beginPath(); c.moveTo(w.a.x * sx, w.a.y * sy); c.lineTo(w.b.x * sx, w.b.y * sy); c.stroke(); }
    if (map.fog) {
      const seen = new Set(map.revealed);
      c.fillStyle = view.me.role === "dm" ? "rgba(20,14,8,.5)" : "#1d1610";
      for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (!seen.has(`${x},${y}`)) c.fillRect(x * sx, y * sy, sx + 1, sy + 1);
    }
    for (const t of tokens) {
      const r = (Math.min(sx, sy) * (t.size || 1)) / 2 - 2;
      c.beginPath(); c.arc((t.x + (t.size || 1) / 2) * sx, (t.y + (t.size || 1) / 2) * sy, r, 0, Math.PI * 2);
      c.fillStyle = t.color; c.globalAlpha = t.hidden ? 0.4 : 1; c.fill(); c.globalAlpha = 1;
      c.fillStyle = "#fff"; c.font = `bold ${r}px sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText(t.name.slice(0, 2), (t.x + (t.size || 1) / 2) * sx, (t.y + (t.size || 1) / 2) * sy);
    }
    // eslint-disable-next-line react-hooks/immutability
    texture.needsUpdate = true;
  }, [map, tokens, texture, view.me.role]);
  return texture;
}

function Room({ view }: { view: RoomView }) {
  const look = ENV_LOOK[view.scene.environment] ?? ENV_LOOK.dungeon;
  const high = detectQuality() === "high";
  const mapTexture = useMapTexture(view);
  const { thrown } = useDice();
  const torches: [number, number, number][] = [[-11, 5, -8], [11, 5, -8], [-11, 5, 8], [11, 5, 8]];
  return (
    <>
      <color attach="background" args={[look.sky ?? look.fog]} />
      <fog attach="fog" args={[look.fog, 14, 42]} />
      <ambientLight intensity={look.ambient * 2.2} />
      <directionalLight position={[3, 14, 5]} intensity={look.torches ? 1 : 2.4} color={look.light} castShadow={high} shadow-mapSize={[1024, 1024]} shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={9} shadow-camera-bottom={-9} />
      {torches.slice(0, high ? look.torches : Math.min(look.torches, 2)).map((p, i) => <Torch key={i} position={p} color={look.light} seed={i * 2.3} />)}
      {look.embers && <Embers color={look.embersColor} count={high ? 140 : 40} />}

      {/* Table: the physics walls sit at the rim, so dice stay on the map. */}
      <mesh position={[0, -0.25, 0]} receiveShadow><boxGeometry args={[18.6, 0.5, 12.6]} /><meshStandardMaterial color={look.table} roughness={0.75} /></mesh>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[16, 10]} /><meshStandardMaterial map={mapTexture} roughness={0.9} /></mesh>
      {([[-9.05, 0], [9.05, 0]] as const).map(([x], i) => <mesh key={i} position={[x, 0.2, 0]} castShadow><boxGeometry args={[0.5, 0.5, 12.6]} /><meshStandardMaterial color={look.table} roughness={0.7} /></mesh>)}
      {([[0, -6.05], [0, 6.05]] as const).map(([, z], i) => <mesh key={i} position={[0, 0.2, z]} castShadow><boxGeometry args={[18.6, 0.5, 0.5]} /><meshStandardMaterial color={look.table} roughness={0.7} /></mesh>)}
      {[[-8, -5.3], [8, -5.3], [-8, 5.3], [8, 5.3]].map(([x, z], i) => <mesh key={i} position={[x, -2.7, z]}><boxGeometry args={[0.8, 4.5, 0.8]} /><meshStandardMaterial color={look.table} /></mesh>)}

      <mesh position={[0, -5, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[80, 80]} /><meshStandardMaterial color={look.floor} roughness={1} /></mesh>
      {!look.sky && [[0, 5, -20, 0], [0, 5, 20, Math.PI], [-24, 5, 0, Math.PI / 2], [24, 5, 0, -Math.PI / 2]].map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]} rotation={[0, r, 0]}><planeGeometry args={[60, 24]} /><meshStandardMaterial color={look.wall} roughness={0.95} /></mesh>
      ))}
      <DiceLayer thrown={thrown} />
    </>
  );
}

export default function TableScene({ view }: { view: RoomView }) {
  const { setExternalScene } = useDice();
  const high = detectQuality() === "high";
  const look = ENV_LOOK[view.scene.environment] ?? ENV_LOOK.dungeon;
  useEffect(() => { setDiceSurface(look.surface); }, [look.surface]);
  // Dice land on this table instead of the screen overlay while it's open.
  useEffect(() => { setExternalScene(true); return () => setExternalScene(false); }, [setExternalScene]);
  return (
    <div data-testid="table-scene" className="h-[62vh] overflow-hidden rounded-md border border-line">
      <Canvas shadows={high} dpr={high ? [1, 2] : 1} gl={{ antialias: high }} camera={{ position: [0, 16, 12.5], fov: 46 }} onCreated={({ camera }) => camera.lookAt(0, 0, 0.5)}>
        <Room view={view} />
      </Canvas>
    </div>
  );
}
