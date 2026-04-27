"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { workshopParameters } from "@/content/marketing/home";

/**
 * §5 Workshop — interactive parameter panel + Drift fragment shader.
 *
 * Sliders are native <input type="range"> for accessibility. The shader
 * is dynamically imported and only mounts when the section enters the
 * viewport (per DECISIONS.md performance plan).
 */

// Lazy-load the WebGL component so three.js... wait, we don't import three
// here, but we still want to keep the canvas + rAF loop out of the
// initial bundle until the user scrolls to this section.
const DriftShader = dynamic(
  () => import("@/components/marketing/shaders/DriftShader").then((m) => m.DriftShader),
  { ssr: false },
);

type Values = Record<(typeof workshopParameters)[number]["id"], number>;

export function Workshop() {
  const [values, setValues] = useState<Values>(() => {
    const initial: Partial<Values> = {};
    for (const p of workshopParameters) initial[p.id] = p.initial;
    return initial as Values;
  });

  const [armed, setArmed] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Mount the shader only once the section is near the viewport.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || armed) return;
    const ob = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setArmed(true);
          ob.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [armed]);

  const onChange = (id: keyof Values, v: number) =>
    setValues((prev) => ({ ...prev, [id]: v }));

  return (
    <section
      ref={wrapRef}
      aria-labelledby="workshop-heading"
      className="px-[var(--gutter)] py-[clamp(64px,12vh,160px)] flex flex-col gap-10"
      data-cv="auto"
    >
      <header className="flex items-baseline gap-4">
        <span className="text-mono-sm text-ink/40">§05</span>
        <h2 id="workshop-heading" className="text-h2">
          Workshop.
        </h2>
      </header>

      <div className="grid grid-cols-12 gap-x-[var(--gutter)] gap-y-8 items-start">
        {/* Shader preview, columns 1–8 */}
        <div className="col-span-12 lg:col-span-8 aspect-[16/10] bg-paper border border-ink/15 overflow-hidden">
          {armed ? (
            <DriftShader
              params={values}
              ariaLabel="Live preview of a Drift dot field driven by the four parameters on the right"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-mono-sm text-ink/45">
              shader idle · scroll to mount
            </div>
          )}
        </div>

        {/* Sliders, columns 9–12 */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          {workshopParameters.map((p) => (
            <Slider
              key={p.id}
              id={p.id}
              label={p.label}
              unit={p.unit}
              min={p.min}
              max={p.max}
              step={p.step}
              value={values[p.id]}
              onChange={(v) => onChange(p.id, v)}
            />
          ))}
          <p className="text-mono-sm text-ink/45 mt-4 max-w-[36ch]">
            Pure WebGL. No backend. The preview is genuinely Drift —
            the same sine displacement the brand mark uses, parametrically.
          </p>
        </div>
      </div>
    </section>
  );
}

function Slider({
  id,
  label,
  unit,
  min,
  max,
  step,
  value,
  onChange,
}: {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-2" htmlFor={`ws-${id}`}>
      <span className="flex items-baseline justify-between">
        <span className="text-mono-sm text-ink">{label}</span>
        <span className="text-mono-sm text-ink/55 tabular-nums">
          {Number.isInteger(step) ? value : value.toFixed(2)} {unit}
        </span>
      </span>
      <input
        id={`ws-${id}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="w-full accent-signal cursor-pointer"
        data-cursor="ring"
      />
    </label>
  );
}
