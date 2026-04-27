"use client";

import { useMemo, useState } from "react";

/**
 * Panel I — Prompt → Latent.
 *
 * Interactive: the user types a prompt; we show a deterministic 16×8
 * "latent grid" where each cell's intensity is computed from a stable
 * hash of the prompt + cell coords. As the prompt changes, the field
 * morphs in real time. No backend.
 *
 * The point: a prompt is not a string, it's a high-dimensional position
 * in a learned space. The grid is a UI proxy for that.
 */

export function PromptToLatent() {
  const [prompt, setPrompt] = useState("rain falling against a concrete tower at dusk");

  const cells = useMemo(() => {
    const W = 32;
    const H = 12;
    const arr: number[] = new Array(W * H);
    const seed = hashString(prompt);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // Each cell mixes the prompt seed with its coords and a couple of
        // sine harmonics. Output 0..1.
        const phase = (x * 0.31 + y * 0.47 + seed * 0.0003) * Math.PI;
        const v = 0.5 + 0.5 * Math.sin(phase) * Math.cos(phase * 1.7 + seed * 0.0007);
        arr[y * W + x] = v;
      }
    }
    return { arr, W, H };
  }, [prompt]);

  return (
    <Panel
      numeral="I"
      title="Prompt → Latent."
      summary="A prompt is not a string. It's a stable position in a learned space. Type to move the position; observe the latent shift."
    >
      <textarea
        rows={3}
        value={prompt}
        onChange={(e) => setPrompt(e.currentTarget.value)}
        className="w-full bg-paper border border-ink/30 px-4 py-3 text-ink resize-none font-mono text-[clamp(0.9rem,0.4vw+0.85rem,1.0625rem)] leading-snug"
        aria-label="Prompt"
        spellCheck={false}
      />
      <div
        className="mt-6 grid bg-ink/5"
        role="img"
        aria-label={`Latent representation of: ${prompt}`}
        style={{
          gridTemplateColumns: `repeat(${cells.W}, 1fr)`,
          gap: 1,
        }}
      >
        {cells.arr.map((v, i) => (
          <div
            key={i}
            className="aspect-square"
            style={{
              backgroundColor: `rgba(10, 10, 10, ${v})`,
            }}
          />
        ))}
      </div>
      <p className="mt-4 text-mono-sm text-ink/50">
        Hash seed · 0x{hashString(prompt).toString(16).padStart(8, "0")}
      </p>
    </Panel>
  );
}

/**
 * Panel II — Latent → Frame.
 *
 * Interactive: a single slider (0..1) sweeps through the "decoder"
 * latent. We render an animated dot field where the slider position
 * drives both the wave amplitude and the spacing. The point is that a
 * latent code resolves to a frame; small latent moves produce coherent
 * visual changes.
 */
export function LatentToFrame() {
  const [t, setT] = useState(0.5);

  // Render a 9×6 dot field where amplitude scales with t, spacing too.
  const W = 9;
  const H = 6;
  const amplitude = 30 * t;
  const spacing = 28 + 24 * t;
  const dots: Array<{ cx: number; cy: number }> = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const phase = (2 * Math.PI * x) / 8;
      const dy = amplitude * Math.sin(phase);
      dots.push({
        cx: spacing / 2 + x * spacing,
        cy: spacing + amplitude + y * spacing + dy,
      });
    }
  }
  const vbWidth = spacing * W;
  const vbHeight = spacing * H + 2 * amplitude + spacing;

  return (
    <Panel
      numeral="II"
      title="Latent → Frame."
      summary="A latent code decodes to a frame. The slider moves the latent along one axis. Observe how a coherent visual responds."
    >
      <div className="flex flex-col gap-3">
        <label htmlFor="l2f" className="flex justify-between text-mono-sm">
          <span className="text-ink">Latent · axis 1</span>
          <span className="text-ink/55 tabular-nums">{t.toFixed(2)}</span>
        </label>
        <input
          id="l2f"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={t}
          onChange={(e) => setT(Number(e.currentTarget.value))}
          className="accent-signal cursor-pointer"
          data-cursor="ring"
        />
      </div>

      <svg
        viewBox={`0 0 ${vbWidth} ${vbHeight}`}
        className="mt-6 w-full text-ink"
        role="img"
        aria-label={`Decoded frame at latent position ${t.toFixed(2)}`}
      >
        <g fill="currentColor">
          {dots.map((d, i) => (
            <circle key={i} cx={d.cx} cy={d.cy} r={Math.max(2, 6 * t)} />
          ))}
        </g>
      </svg>
    </Panel>
  );
}

/**
 * Panel III — Frame → Sequence.
 *
 * Interactive: the user scrubs a 24-frame sequence. We render the
 * current frame as a procedural Drift mark with a phase derived from
 * the frame number. The buttons let the user toggle the source rate
 * (24 / 30 / 60 / 120) and the displayed playhead reflects the rate.
 */
export function FrameToSequence() {
  const [frame, setFrame] = useState(0);
  const [fps, setFps] = useState<24 | 30 | 60 | 120>(24);
  const totalFrames = fps; // 1 second of clip

  const phase = (2 * Math.PI * frame) / totalFrames;

  const W = 9;
  const H = 6;
  const amp = 22;
  const spacing = 40;
  const dots: Array<{ cx: number; cy: number }> = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dy = amp * Math.sin((2 * Math.PI * x) / 8 - phase);
      dots.push({
        cx: spacing / 2 + x * spacing,
        cy: spacing + amp + y * spacing + dy,
      });
    }
  }

  return (
    <Panel
      numeral="III"
      title="Frame → Sequence."
      summary="Frames are not resampled into a sequence — they are rendered for it. Choose the rate; scrub the playhead."
    >
      <div className="flex items-center gap-6 mb-6 flex-wrap">
        <span className="text-mono-sm text-ink/40">Source rate</span>
        <div className="flex gap-1">
          {([24, 30, 60, 120] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setFps(r);
                setFrame(0);
              }}
              aria-pressed={r === fps}
              className={[
                "text-mono-sm tracking-[0.18em] uppercase px-3 py-1 border",
                r === fps
                  ? "bg-ink text-paper border-ink"
                  : "bg-transparent text-ink/65 border-ink/20 hover:border-ink/60",
              ].join(" ")}
              data-cursor="ring"
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${spacing * W} ${spacing * H + 2 * amp + spacing}`}
        className="w-full text-ink mb-6"
        role="img"
        aria-label={`Frame ${frame + 1} of ${totalFrames} at ${fps} fps`}
      >
        <g fill="currentColor">
          {dots.map((d, i) => (
            <circle key={i} cx={d.cx} cy={d.cy} r={6} />
          ))}
        </g>
      </svg>

      <div className="flex flex-col gap-2">
        <input
          type="range"
          min={0}
          max={totalFrames - 1}
          step={1}
          value={frame}
          onChange={(e) => setFrame(Number(e.currentTarget.value))}
          className="accent-signal cursor-pointer"
          aria-label="Playhead"
          data-cursor="ring"
        />
        <div className="flex justify-between text-mono-sm text-ink/55">
          <span>frame {String(frame + 1).padStart(3, "0")} / {totalFrames}</span>
          <span>{(frame / fps).toFixed(3)} s</span>
        </div>
      </div>
    </Panel>
  );
}

/**
 * Panel IV — Sequence → Output.
 *
 * Interactive: the user picks a container (mp4/webm) and an aspect ratio.
 * We compute the output filename, payload size estimate, and a fake
 * checksum, deterministic by inputs. The point is that the output is
 * a discrete artefact with stable identity.
 */
export function SequenceToOutput() {
  const [container, setContainer] = useState<"mp4" | "webm" | "av1">("mp4");
  const [aspect, setAspect] = useState<"16:9" | "21:9" | "1:1" | "9:16">("16:9");
  const [fps, setFps] = useState(60);

  const filename = `REND-${(hashString(container + aspect + fps) >>> 0)
    .toString(16)
    .padStart(8, "0")
    .toUpperCase()
    .slice(0, 6)}.${container}`;
  const sizeKb = Math.round(
    fps * (aspect === "21:9" ? 18 : aspect === "1:1" ? 9 : 12) * (container === "av1" ? 0.6 : container === "webm" ? 0.85 : 1),
  );
  const checksum = hashString(filename + sizeKb).toString(16).padStart(8, "0");

  return (
    <Panel
      numeral="IV"
      title="Sequence → Output."
      summary="The sequence resolves to a file. The file ships its prompt, its model, its seed, its render time, and its checksum."
    >
      <div className="flex flex-col gap-4">
        <Field label="Container">
          <Toggle
            options={["mp4", "webm", "av1"] as const}
            value={container}
            onChange={setContainer}
          />
        </Field>
        <Field label="Aspect">
          <Toggle
            options={["16:9", "21:9", "1:1", "9:16"] as const}
            value={aspect}
            onChange={setAspect}
          />
        </Field>
        <Field label="Frame rate">
          <input
            type="range"
            min={24}
            max={120}
            step={6}
            value={fps}
            onChange={(e) => setFps(Number(e.currentTarget.value))}
            className="accent-signal cursor-pointer w-full"
            data-cursor="ring"
          />
          <span className="text-mono-sm text-ink/55 tabular-nums">{fps} fps</span>
        </Field>
      </div>

      <pre className="mt-6 bg-ink text-paper p-4 text-mono-sm overflow-auto whitespace-pre">
{`> skyie render finalize
filename : ${filename}
duration : 1.000 s · ${fps} frames
aspect   : ${aspect}
size     : ~${sizeKb} KB
sha-256  : 0x${checksum}…`}
      </pre>
    </Panel>
  );
}

/* ---------------------------------------------------------------- */
/* Shared internals                                                  */
/* ---------------------------------------------------------------- */

function Panel({
  numeral,
  title,
  summary,
  children,
}: {
  numeral: string;
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-ink/15 pt-12 pb-16 flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <span className="text-mono-sm text-ink/40">{numeral}</span>
        <h2 className="text-h2">{title}</h2>
        <p className="text-ink/75 max-w-[60ch]">{summary}</p>
      </header>
      <div>{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-mono-sm text-ink/45">{label}</span>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}

function Toggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={[
            "text-mono-sm tracking-[0.18em] uppercase px-3 py-1 border",
            value === o
              ? "bg-ink text-paper border-ink"
              : "bg-transparent text-ink/65 border-ink/20 hover:border-ink/60",
          ].join(" ")}
          data-cursor="ring"
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/** Stable 32-bit string hash (FNV-1a). Pure. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
