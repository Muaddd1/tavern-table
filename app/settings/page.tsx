"use client";
import { Field, inputClass, Panel, titleCase } from "@/components/ui";
import { updateSettings, useSettings } from "@/lib/settings";

export default function SettingsPage() {
  const s = useSettings();
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-8">
      <h1 className="font-display text-2xl text-gold">Settings</h1>
      <Panel title="Dice and graphics">
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={s.fastRolls} onChange={(e) => updateSettings({ fastRolls: e.target.checked })} /> Reduced motion / fast rolls: show a quick 2D result, using the same server result</label>
        <div className="mt-2"><Field label="3D quality"><select className={inputClass} value={s.quality} onChange={(e) => updateSettings({ quality: e.target.value as typeof s.quality })}><option value="auto">Automatic</option><option value="low">Low, for slower phones</option><option value="high">High</option></select></Field></div>
      </Panel>
      <Panel title="Volume">
        {(["music", "ambience", "dice", "voice"] as const).map((k) => (
          <Field key={k} label={titleCase(k)}><input type="range" min={0} max={1} step={0.05} value={s.volume[k]} onChange={(e) => updateSettings({ volume: { ...s.volume, [k]: +e.target.value } })} className="w-full" /></Field>
        ))}
        <label className="mt-2 flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={s.narration} onChange={(e) => updateSettings({ narration: e.target.checked })} /> Read AI narration aloud, using your device&apos;s voice</label>
      </Panel>
    </main>
  );
}
