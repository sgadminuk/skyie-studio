"use client";

import { useEffect, useRef } from "react";
import { useMotionEnabled } from "@/components/system/MotionPolicyProvider";

/**
 * <DriftShader /> — a 2D fragment shader rendering an animated dot
 * field driven by the four Workshop parameters. Raw WebGL, single
 * fullscreen quad, single program. Avoids R3F so we don't ship three.js
 * on the home initial bundle.
 *
 * Reduced motion: the shader paints once with `u_time` frozen and stops.
 */

export type DriftShaderParams = {
  /** 0..1 wave amplitude scale. */
  motion: number;
  /** Dot spacing in viewport-relative px. */
  density: number;
  /** Hue 0..360. */
  palette: number;
  /** Wave period in seconds. */
  time: number;
};

const VERTEX_SRC = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SRC = `
precision mediump float;
varying vec2 v_uv;

uniform vec2  u_resolution;
uniform float u_time;
uniform float u_motion;
uniform float u_density;
uniform float u_palette;
uniform float u_period;

vec3 hsl2rgb(float h, float s, float l) {
  vec3 p = abs(fract(vec3(h, h - 1.0/3.0, h + 1.0/3.0)) * 6.0 - 3.0);
  return l + s * (clamp(p - 1.0, 0.0, 1.0) - 0.5) * (1.0 - abs(2.0*l - 1.0));
}

void main() {
  vec2 frag = v_uv * u_resolution;
  float spacing = max(u_density, 6.0);

  // Grid coordinates
  vec2 cell = floor(frag / spacing);
  vec2 centre = (cell + 0.5) * spacing;

  // Wave phase: column N at time t — same math as src/lib/drift.ts
  float col = cell.x;
  float phase = 6.2831853 * (col / 8.0 - u_time / u_period);
  float dy = u_motion * spacing * 0.55 * sin(phase);

  vec2 displaced = centre + vec2(0.0, -dy);
  float r = spacing * 0.18;

  float d = length(frag - displaced);
  float alpha = smoothstep(r + 1.0, r - 1.0, d);

  // Background — paper-ish. Foreground — chosen palette colour.
  vec3 bg = vec3(0.957, 0.949, 0.926); // --paper #F4F2EC
  float h = u_palette / 360.0;
  vec3 dotCol = hsl2rgb(h, 0.95, 0.45);

  vec3 col_out = mix(bg, dotCol, alpha);
  gl_FragColor = vec4(col_out, 1.0);
}
`;

export function DriftShader({
  params,
  className,
  ariaLabel,
}: {
  params: DriftShaderParams;
  className?: string;
  ariaLabel?: string;
}) {
  const motionEnabled = useMotionEnabled();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paramsRef = useRef(params);

  // Keep latest params in a ref so the rAF loop reads them without re-creating.
  paramsRef.current = params;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ??
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);
    if (!gl) return;

    const program = createProgram(gl, VERTEX_SRC, FRAGMENT_SRC);
    if (!program) return;
    gl.useProgram(program);

    // Fullscreen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "u_resolution");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uMotion = gl.getUniformLocation(program, "u_motion");
    const uDensity = gl.getUniformLocation(program, "u_density");
    const uPalette = gl.getUniformLocation(program, "u_palette");
    const uPeriod = gl.getUniformLocation(program, "u_period");

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fit = () => {
      const w = canvas.clientWidth | 0;
      const h = canvas.clientHeight | 0;
      const realW = (w * dpr) | 0;
      const realH = (h * dpr) | 0;
      if (canvas.width !== realW || canvas.height !== realH) {
        canvas.width = realW;
        canvas.height = realH;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    fit();

    const ro = new ResizeObserver(fit);
    ro.observe(canvas);

    const start = performance.now();
    let raf = 0;

    const draw = (now: number) => {
      const t = motionEnabled ? (now - start) / 1000 : 0;
      const p = paramsRef.current;
      gl.uniform1f(uTime, t);
      gl.uniform1f(uMotion, p.motion);
      gl.uniform1f(uDensity, p.density * dpr);
      gl.uniform1f(uPalette, p.palette);
      gl.uniform1f(uPeriod, p.time);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (motionEnabled) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.deleteProgram(program);
      gl.deleteBuffer(buf);
    };
  }, [motionEnabled]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={ariaLabel ?? "Drift fragment shader preview"}
      className={className}
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}

function createProgram(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string) {
  const compile = (type: number, src: string): WebGLShader | null => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      // eslint-disable-next-line no-console
      console.error("shader compile failed", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  };
  const vs = compile(gl.VERTEX_SHADER, vsSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    // eslint-disable-next-line no-console
    console.error("program link failed", gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}
