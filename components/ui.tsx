"use client";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { explain, type Explained } from "@/lib/rules";

export function Button({ variant = "plain", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "plain" | "danger" }) {
  const look = variant === "primary" ? "bg-ember text-ink hover:brightness-110 font-semibold" : variant === "danger" ? "border border-red-500/50 text-red-300 hover:bg-red-500/10" : "border border-line hover:bg-white/5";
  return <button {...props} className={`min-h-10 rounded-md px-3 py-2 text-sm transition disabled:opacity-40 disabled:cursor-not-allowed ${look} ${className}`} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-parch/80">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-parch/50">{hint}</span>}
    </label>
  );
}
export const inputClass = "w-full min-h-10 rounded-md border border-line bg-black/30 px-3 py-2 text-sm text-parch placeholder:text-parch/30";

export function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-line bg-panel p-4 ${className}`}>
      {title && <h2 className="mb-3 font-display text-sm tracking-wide text-gold">{title}</h2>}
      {children}
    </section>
  );
}

// A number with its math available on hover, focus, or as a tap target's label.
export function Num({ value, signed, suffix }: { value: Explained; signed?: boolean; suffix?: string }) {
  const n = value.value;
  const text = value.parts.length ? explain(value) : String(n);
  return <span title={text} aria-label={`${n}${suffix ?? ""}. ${text}`} tabIndex={0} className="cursor-help underline decoration-dotted decoration-parch/30 underline-offset-4">{signed && n >= 0 ? "+" : ""}{n}{suffix}</span>;
}

export const titleCase = (s: string) => s.split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
