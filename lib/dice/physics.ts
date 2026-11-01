// Simulates a throw silently, records the frames, and notes which face lands up. Playing the
// recording back after relabeling a die looks natural and always shows the server's number.
import RAPIER from "@dimforge/rapier3d-compat";
import { dieShape, faceAlong, type Vec3 } from "./shapes";

export type DieFrames = { sides: number; frames: Float32Array; topFace: number; settled: boolean };
export type SimResult = { dice: DieFrames[]; steps: number; ms: number; impacts: number[] };

const FRAME_SIZE = 7; // position (3) + quaternion (4)
const MAX_STEPS = 360;
const BOUNDS = { x: 8, z: 5 };

let ready: Promise<void> | null = null;
export const initPhysics = () => (ready ??= RAPIER.init());

// Small seeded generator, so a throw replays the same on every screen given the same seed.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rotateByInverse(q: { x: number; y: number; z: number; w: number }, v: Vec3): Vec3 {
  const ix = -q.x, iy = -q.y, iz = -q.z, w = q.w;
  const tx = 2 * (iy * v[2] - iz * v[1]), ty = 2 * (iz * v[0] - ix * v[2]), tz = 2 * (ix * v[1] - iy * v[0]);
  return [v[0] + w * tx + (iy * tz - iz * ty), v[1] + w * ty + (iz * tx - ix * tz), v[2] + w * tz + (ix * ty - iy * tx)];
}

export async function simulateThrow(sides: number[], throwVector: [number, number], seed: number): Promise<SimResult> {
  await initPhysics();
  const started = performance.now();
  const rand = mulberry32(seed);
  const world = new RAPIER.World({ x: 0, y: -28, z: 0 });
  const fixed = (x: number, y: number, z: number, hx: number, hy: number, hz: number) =>
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setRestitution(0.35).setFriction(0.6));
  fixed(0, -0.5, 0, 30, 0.5, 30);
  fixed(BOUNDS.x + 0.5, 5, 0, 0.5, 10, 30); fixed(-BOUNDS.x - 0.5, 5, 0, 0.5, 10, 30);
  fixed(0, 5, BOUNDS.z + 0.5, 30, 10, 0.5); fixed(0, 5, -BOUNDS.z - 0.5, 30, 10, 0.5);

  const length = Math.hypot(...throwVector) || 1;
  const dir: [number, number] = [throwVector[0] / length, throwVector[1] / length];
  const power = Math.min(16, 8 + length * 0.04);
  const bodies = sides.map((s, i) => {
    const shape = dieShape(s);
    const spread = (i - (sides.length - 1) / 2) * 1.3;
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(-dir[0] * 5 - dir[1] * spread, 3 + rand() * 1.5, -dir[1] * 3.5 + dir[0] * spread)
        .setRotation(randomQuaternion(rand))
        .setLinvel(dir[0] * power + (rand() - 0.5) * 3, -2 - rand() * 2, dir[1] * power + (rand() - 0.5) * 3)
        .setAngvel({ x: (rand() - 0.5) * 30, y: (rand() - 0.5) * 30, z: (rand() - 0.5) * 30 })
        .setCcdEnabled(true).setLinearDamping(0.1).setAngularDamping(0.2),
    );
    const collider = RAPIER.ColliderDesc.convexHull(new Float32Array(shape.hull.flat()))!;
    world.createCollider(collider.setRestitution(0.4).setFriction(0.5).setDensity(1.2), body);
    return { body, shape, frames: [] as number[] };
  });

  const impacts: number[] = [];
  let steps = 0;
  let quiet = 0;
  let prevSpeed = bodies.map(() => 0);
  for (; steps < MAX_STEPS && quiet < 20; steps++) {
    world.step();
    let moving = false;
    const speeds = bodies.map(({ body, frames }) => {
      const t = body.translation(), r = body.rotation(), v = body.linvel(), w = body.angvel();
      frames.push(t.x, t.y, t.z, r.x, r.y, r.z, r.w);
      const speed = Math.hypot(v.x, v.y, v.z);
      if (speed > 0.08 || Math.hypot(w.x, w.y, w.z) > 0.15) moving = true;
      return speed;
    });
    if (speeds.some((sp, i) => prevSpeed[i] - sp > 2.5)) impacts.push(steps);
    prevSpeed = speeds;
    quiet = moving ? 0 : quiet + 1;
  }
  const dice: DieFrames[] = bodies.map(({ body, shape, frames }) => {
    const r = body.rotation();
    const up = rotateByInverse(r, [0, 1, 0]);
    // A d4 has no top face, so its number is read from the face it rests on.
    const topFace = faceAlong(shape, shape.sides === 4 ? [-up[0], -up[1], -up[2]] : up);
    return { sides: shape.sides, frames: new Float32Array(frames), topFace, settled: quiet >= 20 };
  });
  world.free();
  return { dice, steps, ms: performance.now() - started, impacts };
}

export const frameAt = (d: DieFrames, step: number) => {
  const total = d.frames.length / FRAME_SIZE;
  const i = Math.min(step, total - 1) * FRAME_SIZE;
  return { p: [d.frames[i], d.frames[i + 1], d.frames[i + 2]] as Vec3, q: [d.frames[i + 3], d.frames[i + 4], d.frames[i + 5], d.frames[i + 6]] as [number, number, number, number] };
};
export const frameCount = (d: DieFrames) => d.frames.length / FRAME_SIZE;

function randomQuaternion(rand: () => number) {
  const u = rand(), v = rand(), w = rand();
  return { x: Math.sqrt(1 - u) * Math.sin(2 * Math.PI * v), y: Math.sqrt(1 - u) * Math.cos(2 * Math.PI * v), z: Math.sqrt(u) * Math.sin(2 * Math.PI * w), w: Math.sqrt(u) * Math.cos(2 * Math.PI * w) };
}
