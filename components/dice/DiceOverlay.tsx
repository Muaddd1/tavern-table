"use client";
import { Canvas } from "@react-three/fiber";
import { detectQuality } from "@/lib/settings";
import { DiceLayer, type ThrownDie } from "./DiceLayer";

export default function DiceOverlay({ thrown }: { thrown: { id: string; dice: ThrownDie[]; startedAt: number }[] }) {
  const high = detectQuality() === "high";
  return (
    <div className="pointer-events-none fixed inset-0 z-40" aria-hidden>
      <Canvas shadows={high} dpr={high ? [1, 2] : 1} gl={{ alpha: true, antialias: high }} camera={{ position: [0, 13, 6], fov: 45 }} onCreated={({ camera }) => camera.lookAt(0, 0, 0)}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[4, 12, 5]} intensity={2} castShadow={high} shadow-mapSize={[1024, 1024]} shadow-camera-left={-10} shadow-camera-right={10} shadow-camera-top={8} shadow-camera-bottom={-8} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[40, 40]} /><shadowMaterial opacity={0.35} /></mesh>
        <DiceLayer thrown={thrown} />
      </Canvas>
    </div>
  );
}
