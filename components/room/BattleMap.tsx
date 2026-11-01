"use client";
// The top-down map, drawn with PixiJS. It only ever draws what the server's redacted view holds.
import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { distanceFeet, templateCells, visibilityPolygon, type Point, type Template } from "@/lib/map/geometry";
import type { RoomView } from "@/lib/room/redact";
import { detectQuality } from "@/lib/settings";
import { Button, inputClass } from "../ui";

const CELL = 40;
const FLOORS: Record<string, number> = { dungeon: 0x3a342e, cave: 0x2e2b28, forest: 0x25381f, tavern: 0x45331f, castle: 0x3a3a40, ship: 0x3f301f, desert: 0x4a3b24, infernal: 0x421c14 };
type Tool = "move" | "wall" | "door" | "reveal" | "hide" | "template";

export function BattleMap({ view, send, onSelect, selectedTarget }: { view: RoomView; send: (i: Record<string, unknown>) => Promise<boolean>; onSelect?: (tokenId: string) => void; selectedTarget?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const app = useRef<Application | null>(null);
  const layer = useRef<Container | null>(null);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<Tool>("move");
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [wallStart, setWallStart] = useState<Point | null>(null);
  const [shape, setShape] = useState<Template["shape"]>("sphere");
  const [feet, setFeet] = useState(20);
  const [fail, setFail] = useState(false);
  const isDm = view.me.role === "dm";
  // Snapshots arrive as new objects, even when nothing on the map changed.
  const drawKey = JSON.stringify([view.map, view.tokens, view.scene.environment, view.scene.backgroundImage]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { map, tokens, scene } = useMemo(() => view, [drawKey]);

  useEffect(() => {
    let cancelled = false;
    const a = new Application();
    // Draws only when something changes, which saves battery on phones.
    a.init({ autoStart: false, background: 0x000000, antialias: detectQuality() === "high", resolution: Math.min(devicePixelRatio, 2), autoDensity: true, width: 320, height: 240 }).then(() => {
      if (cancelled) { a.destroy(true); return; }
      host.current?.appendChild(a.canvas);
      a.canvas.style.touchAction = "none";
      a.canvas.setAttribute("aria-label", "Battle map");
      app.current = a;
      layer.current = new Container();
      a.stage.addChild(layer.current);
      setReady(true);
    }).catch(() => setFail(true));
    return () => { cancelled = true; if (app.current) { app.current.destroy(true, { children: true }); app.current = null; } };
  }, []);

  useEffect(() => {
    const a = app.current, root = layer.current;
    if (!ready || !a || !root) return;
    let stale = false;
    (async () => {
      const width = map.width * CELL, height = map.height * CELL;
      a.renderer.resize(width, height);
      const bg = map.image ? await Assets.load<Texture>(map.image).catch(() => null) : null;
      const sceneBg = !bg && scene.backgroundImage ? await Assets.load<Texture>(scene.backgroundImage).catch(() => null) : null;
      const portraits = new Map<string, Texture>();
      for (const t of tokens) if (t.image) { const p = await Assets.load<Texture>(t.image).catch(() => null); if (p) portraits.set(t.id, p); }
      if (stale) return;
      for (const child of root.removeChildren()) child.destroy({ children: true });

      const floor = new Graphics().rect(0, 0, width, height).fill(FLOORS[scene.environment] ?? 0x26221f);
      root.addChild(floor);
      const image = bg ?? sceneBg;
      if (image) { const s = new Sprite(image); s.width = width; s.height = height; root.addChild(s); }
      const grid = new Graphics();
      for (let x = 0; x <= map.width; x++) grid.moveTo(x * CELL, 0).lineTo(x * CELL, height);
      for (let y = 0; y <= map.height; y++) grid.moveTo(0, y * CELL).lineTo(width, y * CELL);
      grid.stroke({ color: 0xffffff, alpha: 0.08, width: 1 });
      root.addChild(grid);

      const walls = new Graphics();
      for (const w of map.walls) {
        walls.moveTo(w.a.x * CELL, w.a.y * CELL).lineTo(w.b.x * CELL, w.b.y * CELL).stroke({ color: w.door ? (w.open ? 0x7bc47f : 0xd9b36c) : 0xbfb5a3, width: w.door ? 6 : 5, cap: "round" });
      }
      root.addChild(walls);

      for (const entry of map.templates) {
        const g = new Graphics();
        for (const c of templateCells(entry.template, map.width, map.height)) g.rect(c.x * CELL, c.y * CELL, CELL, CELL).fill({ color: 0xe0803a, alpha: 0.32 });
        g.eventMode = "static"; g.cursor = "pointer";
        g.on("pointertap", () => { void send({ type: "template_remove", id: entry.id }); });
        root.addChild(g);
      }

      for (const t of tokens) {
        const size = (t.size || 1) * CELL;
        const c = new Container();
        c.position.set(t.x * CELL, t.y * CELL);
        const r = size / 2 - 3;
        const ring = new Graphics().circle(size / 2, size / 2, r).fill(0x15110d).stroke({ color: Number(`0x${t.color.replace("#", "")}`), width: t.id === selected || t.id === selectedTarget ? 5 : 3 });
        c.addChild(ring);
        const portrait = portraits.get(t.id);
        if (portrait) {
          const s = new Sprite(portrait);
          s.width = s.height = r * 2 - 4; s.position.set(size / 2 - r + 2, size / 2 - r + 2);
          const mask = new Graphics().circle(size / 2, size / 2, r - 2).fill(0xffffff);
          s.mask = mask; c.addChild(mask, s);
        } else {
          const label = new Text({ text: t.name.slice(0, 2), style: { fill: 0xece2cf, fontSize: size * 0.34, fontWeight: "700" } });
          label.anchor.set(0.5); label.position.set(size / 2, size / 2); c.addChild(label);
        }
        if (t.hp !== undefined && t.hpMax) {
          const pct = Math.max(0, t.hp / t.hpMax);
          c.addChild(new Graphics().rect(3, size - 6, size - 6, 4).fill(0x000000).rect(3, size - 6, (size - 6) * pct, 4).fill(pct > 0.5 ? 0x7bc47f : pct > 0.25 ? 0xe5c07b : 0xe06c75));
        }
        if (t.hidden) c.alpha = 0.45;
        root.addChild(c);
      }

      // Lighting: darkness everywhere, cut away where lights and darkvision reach.
      if (map.dark) {
        const sources = tokens.flatMap((t) => {
          const out: { p: Point; r: number }[] = [];
          const mine = isDm || t.memberId === view.me.id;
          if (t.light) out.push({ p: { x: t.x + 0.5, y: t.y + 0.5 }, r: t.light / 5 });
          if (mine && t.darkvision) out.push({ p: { x: t.x + 0.5, y: t.y + 0.5 }, r: t.darkvision / 5 });
          return out;
        });
        const dark = new Graphics().rect(0, 0, width, height).fill({ color: 0x000000, alpha: isDm ? 0.2 : 0.92 });
        for (const src of sources) {
          const poly = visibilityPolygon(src.p, map.walls, src.r).flatMap((q) => [q.x * CELL, q.y * CELL]);
          dark.poly(poly).cut();
        }
        root.addChild(dark);
      }

      if (map.fog) {
        const seen = new Set(map.revealed);
        const fog = new Graphics();
        for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) if (!seen.has(`${x},${y}`)) fog.rect(x * CELL, y * CELL, CELL + 0.5, CELL + 0.5).fill({ color: 0x050403, alpha: isDm ? 0.3 : 1 });
        root.addChild(fog);
      }

      if (map.weather !== "none") {
        const count = detectQuality() === "high" ? 300 : 90;
        const w = new Graphics();
        for (let i = 0; i < count; i++) {
          const x = Math.random() * width, y = Math.random() * height;
          if (map.weather === "rain") w.moveTo(x, y).lineTo(x - 3, y + 14).stroke({ color: 0x9ac4e6, alpha: 0.4, width: 1 });
          else if (map.weather === "snow") w.circle(x, y, 2).fill({ color: 0xffffff, alpha: 0.7 });
          else w.circle(x, y, 60).fill({ color: 0xcfd6dc, alpha: 0.025 });
        }
        root.addChild(w);
      }
      a.render();
    })();
    return () => { stale = true; };
  }, [ready, map, tokens, scene.environment, scene.backgroundImage, selected, selectedTarget, isDm, view.me.id, send]);

  const cell = (e: React.PointerEvent): Point => {
    const box = (e.currentTarget as HTMLElement).querySelector("canvas")!.getBoundingClientRect();
    return { x: Math.floor(((e.clientX - box.left) / box.width) * map.width), y: Math.floor(((e.clientY - box.top) / box.height) * map.height) };
  };
  const corner = (e: React.PointerEvent): Point => {
    const box = (e.currentTarget as HTMLElement).querySelector("canvas")!.getBoundingClientRect();
    return { x: Math.round(((e.clientX - box.left) / box.width) * map.width), y: Math.round(((e.clientY - box.top) / box.height) * map.height) };
  };
  const tokenAt = (p: Point) => tokens.find((t) => p.x >= t.x && p.x < t.x + (t.size || 1) && p.y >= t.y && p.y < t.y + (t.size || 1));
  const selectedToken = tokens.find((t) => t.id === selected);

  const click = (e: React.PointerEvent) => {
    const p = cell(e);
    if (tool === "wall" || tool === "door") {
      const c = corner(e);
      if (!wallStart) { setWallStart(c); return; }
      void send({ type: "map_set", walls: [...map.walls, { a: wallStart, b: c, ...(tool === "door" ? { door: true } : {}) }] });
      setWallStart(null);
      return;
    }
    if (tool === "reveal" || tool === "hide") { void send({ type: "fog_reveal", cells: square(p, 2, map.width, map.height), hide: tool === "hide" }); return; }
    if (tool === "template") {
      const template: Template = shape === "sphere" ? { shape, center: { x: p.x + 0.5, y: p.y + 0.5 }, radiusFeet: feet } : shape === "cube" ? { shape, origin: p, sizeFeet: feet } : { shape, origin: { x: p.x + 0.5, y: p.y + 0.5 }, direction: selectedToken ? Math.atan2(selectedToken.y - p.y, selectedToken.x - p.x) : 0, lengthFeet: feet };
      void send({ type: "template_place", template });
      return;
    }
    const hit = tokenAt(p);
    if (hit) { setSelected(hit.id === selected ? null : hit.id); onSelect?.(hit.id); return; }
    if (selectedToken) { void send({ type: "token_move", id: selectedToken.id, x: p.x, y: p.y }); setSelected(null); }
  };
  const feetAway = selectedToken && hover ? distanceFeet(selectedToken, hover) : null;

  if (fail) return <p className="p-4 text-sm text-red-300">This device couldn&apos;t start the map. The rest of the game still works.</p>;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1 text-sm">
        <Button aria-pressed={tool === "move"} className={tool === "move" ? "border-ember bg-ember/10" : ""} onClick={() => setTool("move")}>Move</Button>
        <Button aria-pressed={tool === "template"} className={tool === "template" ? "border-ember bg-ember/10" : ""} onClick={() => setTool("template")}>Area</Button>
        {tool === "template" && (
          <>
            <select aria-label="Area shape" className={`${inputClass} w-24`} value={shape} onChange={(e) => setShape(e.target.value as Template["shape"])}>{["sphere", "cube", "cone", "line"].map((s) => <option key={s}>{s}</option>)}</select>
            <input aria-label="Size in feet" type="number" step={5} min={5} className={`${inputClass} w-20`} value={feet} onChange={(e) => setFeet(+e.target.value)} />
            <span className="text-xs text-parch/50">Cones and lines point at your selected token. Tap an area to clear it.</span>
          </>
        )}
        {isDm && (["wall", "door", "reveal", "hide"] as Tool[]).map((t) => <Button key={t} aria-pressed={tool === t} className={tool === t ? "border-ember bg-ember/10" : ""} onClick={() => { setTool(t); setWallStart(null); }}>{t === "reveal" ? "Reveal fog" : t === "hide" ? "Hide fog" : t === "wall" ? "Draw wall" : "Draw door"}</Button>)}
        <span className="ml-auto text-xs text-parch/60" aria-live="polite">{feetAway !== null ? `${feetAway} ft. away` : hover ? `Square ${hover.x}, ${hover.y}` : ""}{wallStart ? " · Tap the wall's other end" : ""}</span>
      </div>
      <div ref={host} data-testid="battle-map" className="overflow-hidden rounded-md border border-line [&_canvas]:block [&_canvas]:!h-auto [&_canvas]:!w-full" onPointerUp={click} onPointerMove={(e) => setHover(cell(e))} onPointerLeave={() => setHover(null)} />
      {/* A keyboard and screen-reader way to see and use the map. */}
      <details className="mt-2 text-sm">
        <summary className="min-h-8 cursor-pointer text-parch/60">List of tokens on the map ({tokens.length})</summary>
        <ul className="mt-1 space-y-1">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2">
              <button onClick={() => { setSelected(t.id); onSelect?.(t.id); }} className="min-h-8 underline">{t.name}</button>
              <span className="text-parch/50">square {t.x}, {t.y}{t.hp !== undefined ? ` · HP ${t.hp}/${t.hpMax}` : ""}{t.conditions.length ? ` · ${t.conditions.join(", ")}` : ""}{t.hidden ? " · hidden" : ""}</span>
              {(isDm || t.memberId === view.me.id) && (["up", "down", "left", "right"] as const).map((d) => <button key={d} aria-label={`Move ${t.name} ${d}`} className="min-h-8 rounded border border-line px-2" onClick={() => void send({ type: "token_move", id: t.id, x: Math.max(0, t.x + (d === "left" ? -1 : d === "right" ? 1 : 0)), y: Math.max(0, t.y + (d === "up" ? -1 : d === "down" ? 1 : 0)) })}>{d}</button>)}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

const square = (p: Point, r: number, w: number, h: number) => {
  const out: Point[] = [];
  for (let y = Math.max(0, p.y - r); y <= Math.min(h - 1, p.y + r); y++) for (let x = Math.max(0, p.x - r); x <= Math.min(w - 1, p.x + r); x++) out.push({ x, y });
  return out;
};
