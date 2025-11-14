import { useEffect, useRef, useState, useMemo } from "react";
import { FilterInstance, TransformationType } from "@/types/transformations";

type Mode = 'brightness' | 'contrast' | 'saturation' | 'vibrance' | 'hue' | 'all';

interface RGBCubeVisualizerProps {
  mode: Mode;
  params: {
    brightness?: number;
    contrast?: number;
    saturation?: number;
    vibrance?: number;
    hue?: number; // degrees
    linearSaturation?: boolean;
  };
  selectedRGB?: { r: number; g: number; b: number };
  // All-changes overlay controls
  showAllChanges?: boolean;
  lastChange?: Mode;
  // Optional pipeline order when computing full transformed in 'all'
  transformOrder?: TransformationType[];
  // Image upload state
  hasImage?: boolean;
  // Optional instance-based pipeline visualization
  pipeline?: FilterInstance[];
  selectedInstanceId?: string;
  // Visibility hint: when false, keep mounted but skip redraws
  isVisible?: boolean;
}

const clamp = (v: number, min = 0, max = 255) => Math.max(min, Math.min(max, v));

function buildHueRotationMatrix(degrees: number): number[] {
  const angle = (degrees * Math.PI) / 180;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  return [
    cosA + (1 - cosA) / 3,
    (1 / 3) * (1 - cosA) - Math.sqrt(1 / 3) * sinA,
    (1 / 3) * (1 - cosA) + Math.sqrt(1 / 3) * sinA,
    (1 / 3) * (1 - cosA) + Math.sqrt(1 / 3) * sinA,
    cosA + (1 / 3) * (1 - cosA),
    (1 / 3) * (1 - cosA) - Math.sqrt(1 / 3) * sinA,
    (1 / 3) * (1 - cosA) - Math.sqrt(1 / 3) * sinA,
    (1 / 3) * (1 - cosA) + Math.sqrt(1 / 3) * sinA,
    cosA + (1 / 3) * (1 - cosA),
  ];
}

function multiplyRGB(m: number[], r: number, g: number, b: number) {
  return {
    r: clamp(r * m[0] + g * m[1] + b * m[2]),
    g: clamp(r * m[3] + g * m[4] + b * m[5]),
    b: clamp(r * m[6] + g * m[7] + b * m[8]),
  };
}

function toLinear(c: number) {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function toSRGB(c: number) {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function rotatePoint(x: number, y: number, z: number, yawDeg: number, pitchDeg: number) {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  let rx = cosY * x + sinY * z;
  let ry = y;
  let rz = -sinY * x + cosY * z;
  const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
  const ry2 = cosP * ry - sinP * rz;
  const rz2 = sinP * ry + cosP * rz;
  return { x: rx, y: ry2, z: rz2 };
}

function project(x: number, y: number, z: number, width: number, height: number, zoom: number) {
  const sx = 0.707 * (x - y);
  const sy = 0.408 * (x + y) - 0.816 * z;
  const scale = (Math.min(width, height) / 380) * zoom;
  const px = width / 2 + sx * scale;
  const py = height / 2 + sy * scale;
  return { x: px, y: py };
}

function line(ctx: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  color: string,
  width = 2,
  headSize = 8
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  line(ctx, a, b);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - headSize * Math.cos(angle - Math.PI / 6), b.y - headSize * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(b.x - headSize * Math.cos(angle + Math.PI / 6), b.y - headSize * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export default function RGBCubeVisualizer({ mode, params, selectedRGB, showAllChanges, lastChange, transformOrder, hasImage, pipeline, selectedInstanceId, isVisible = true }: RGBCubeVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [yaw, setYaw] = useState<number>(-35);
  const [pitch, setPitch] = useState<number>(20);
  const [zoom, setZoom] = useState<number>(1);
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const width = 320;
  const height = 220;
  const prevParamsRef = useRef<{ brightness?: number; contrast?: number; saturation?: number; vibrance?: number; hue?: number; linearSaturation?: boolean }>({ ...params });

  // Extract individual params for dependency tracking (prevents unnecessary recalculations)
  // This ensures the effect only runs when actual param values change, not just the object reference
  const paramsBrightness = params.brightness;
  const paramsContrast = params.contrast;
  const paramsSaturation = params.saturation;
  const paramsVibrance = params.vibrance;
  const paramsHue = params.hue;
  const paramsLinearSaturation = params.linearSaturation;

  function computeTransformedFor(original: { r: number; g: number; b: number }, forMode: Mode, customParams?: typeof params) {
    const p = customParams ?? params;
    if (forMode === 'brightness') {
      const b = p.brightness ?? 0;
      return { r: clamp(original.r + b), g: clamp(original.g + b), b: clamp(original.b + b) };
    }
    if (forMode === 'contrast') {
      const c = p.contrast ?? 1;
      return { r: clamp((original.r - 128) * c + 128), g: clamp((original.g - 128) * c + 128), b: clamp((original.b - 128) * c + 128) };
    }
    if (forMode === 'saturation') {
      const s = p.saturation ?? 1;
      const linear = p.linearSaturation ?? false;
      if (!linear) {
        const wR = 0.299, wG = 0.587, wB = 0.114;
        const gray = wR * original.r + wG * original.g + wB * original.b;
        return { r: clamp(gray + (original.r - gray) * s), g: clamp(gray + (original.g - gray) * s), b: clamp(gray + (original.b - gray) * s) };
      } else {
        const rl = toLinear(original.r), gl = toLinear(original.g), bl = toLinear(original.b);
        const wR = 0.2126, wG = 0.7152, wB = 0.0722;
        const Y = wR * rl + wG * gl + wB * bl;
        const rlinP = Y + (rl - Y) * s;
        const glinP = Y + (gl - Y) * s;
        const blinP = Y + (bl - Y) * s;
        return { r: clamp(toSRGB(rlinP) * 255), g: clamp(toSRGB(glinP) * 255), b: clamp(toSRGB(blinP) * 255) };
      }
    }
    if (forMode === 'vibrance') {
      const V = p.vibrance ?? 0;
      const linear = p.linearSaturation ?? false;
      const R = original.r, G = original.g, B = original.b;
      const toLinLocal = (c: number) => {
        const x = c / 255;
        return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      };
      const Rm = linear ? toLinLocal(R) : R;
      const Gm = linear ? toLinLocal(G) : G;
      const Bm = linear ? toLinLocal(B) : B;
      const maxC = Math.max(Rm, Gm, Bm);
      const minC = Math.min(Rm, Gm, Bm);
      const sEst = maxC === 0 ? 0 : (maxC - minC) / maxC;
      const f = 1 + V * (1 - sEst);
      const wR = linear ? 0.2126 : 0.299;
      const wG = linear ? 0.7152 : 0.587;
      const wB = linear ? 0.0722 : 0.114;
      const gray = wR * R + wG * G + wB * B;
      return { r: clamp(gray + (R - gray) * f), g: clamp(gray + (G - gray) * f), b: clamp(gray + (B - gray) * f) };
    }
    // hue
    const hue = p.hue ?? 0;
    const M = buildHueRotationMatrix(hue);
    return multiplyRGB(M, original.r, original.g, original.b);
  }

  function computePipelineTransformed(original: { r: number; g: number; b: number }) {
    // If we have a pipeline with instance params, use it for accuracy
    if (pipeline && pipeline.length > 0) {
      let rgb = { ...original };
      // Reverse pipeline so bottom item (brightness, last in array) is applied first
      for (const inst of [...pipeline].reverse()) {
        if (!inst.enabled) continue;
        rgb = computeInstanceStep(rgb, inst);
      }
      return rgb;
    }
    // Otherwise use the legacy param-based order
    const order: Exclude<Mode, 'all'>[] = (transformOrder ?? ['brightness','contrast','saturation','vibrance','hue']) as Exclude<Mode,'all'>[];
    let rgb = { ...original };
    for (const step of order) {
      rgb = computeTransformedFor(rgb, step);
    }
    return rgb;
  }

  function computeInstanceStep(original: { r: number; g: number; b: number }, inst: FilterInstance) {
    const linear = params.linearSaturation ?? false;
    if (inst.kind === 'brightness') {
      const v = (inst.params as { value: number }).value;
      return { r: clamp(original.r + v), g: clamp(original.g + v), b: clamp(original.b + v) };
    }
    if (inst.kind === 'contrast') {
      const v = (inst.params as { value: number }).value;
      return { r: clamp((original.r - 128) * v + 128), g: clamp((original.g - 128) * v + 128), b: clamp((original.b - 128) * v + 128) };
    }
    if (inst.kind === 'saturation') {
      const s = (inst.params as { value: number }).value;
      if (!linear) {
        const wR = 0.299, wG = 0.587, wB = 0.114;
        const gray = wR * original.r + wG * original.g + wB * original.b;
        return { r: clamp(gray + (original.r - gray) * s), g: clamp(gray + (original.g - gray) * s), b: clamp(gray + (original.b - gray) * s) };
      } else {
        const rl = toLinear(original.r), gl = toLinear(original.g), bl = toLinear(original.b);
        const wR = 0.2126, wG = 0.7152, wB = 0.0722;
        const Y = wR * rl + wG * gl + wB * bl;
        const rlinP = Y + (rl - Y) * s;
        const glinP = Y + (gl - Y) * s;
        const blinP = Y + (bl - Y) * s;
        return { r: clamp(toSRGB(rlinP) * 255), g: clamp(toSRGB(glinP) * 255), b: clamp(toSRGB(blinP) * 255) };
      }
    }
    if (inst.kind === 'vibrance') {
      const V = (inst.params as { vibrance: number }).vibrance;
      const R = original.r, G = original.g, B = original.b;
      const toLinLocal = (c: number) => {
        const x = c / 255;
        return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      };
      const Rm = (params.linearSaturation ?? false) ? toLinLocal(R) : R;
      const Gm = (params.linearSaturation ?? false) ? toLinLocal(G) : G;
      const Bm = (params.linearSaturation ?? false) ? toLinLocal(B) : B;
      const maxC = Math.max(Rm, Gm, Bm);
      const minC = Math.min(Rm, Gm, Bm);
      const sEst = maxC === 0 ? 0 : (maxC - minC) / maxC;
      const f = 1 + V * (1 - sEst);
      const wR = (params.linearSaturation ?? false) ? 0.2126 : 0.299;
      const wG = (params.linearSaturation ?? false) ? 0.7152 : 0.587;
      const wB = (params.linearSaturation ?? false) ? 0.0722 : 0.114;
      const gray = wR * R + wG * G + wB * B;
      return { r: clamp(gray + (R - gray) * f), g: clamp(gray + (G - gray) * f), b: clamp(gray + (B - gray) * f) };
    }
    // hue
    const deg = (inst.params as { hue: number }).hue;
    const M = buildHueRotationMatrix(deg);
    return multiplyRGB(M, original.r, original.g, original.b);
  }

  function computePipelineWithParams(customParams: typeof params, start: { r: number; g: number; b: number }) {
    const order: Exclude<Mode, 'all'>[] = (transformOrder ?? ['brightness','contrast','saturation','vibrance','hue']) as Exclude<Mode,'all'>[];
    let rgb = { ...start };
    for (const step of order) {
      rgb = computeTransformedFor(rgb, step, customParams);
    }
    return rgb;
  }

  useEffect(() => {
    if (!hasImage || isVisible === false) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const axisColor = "#94a3b8";
    const cubeColor = "#475569";
    const arrowA = "#22c55e"; // original
    const arrowB = "#d946ef"; // transformed
    const auxColor = "#0ea5e9"; // auxiliary like add vector or arc

    const original = selectedRGB ?? { r: 200, g: 150, b: 100 };

    // For single-mode views, green vector = output from the step immediately BEFORE
    // the current filter; magenta = result of applying ONLY the current filter to that base.
    let baseForMode = original;
    let transformed = original;
    if (mode === 'all') {
      transformed = computePipelineTransformed(original);
    } else {
      if (pipeline && pipeline.length > 0) {
        // Prefer an instance that matches the current mode. If the selected instance is of another kind,
        // fall back to the latest enabled instance of this mode so the tab shows immediately relevant state.
        const selectedIdx = selectedInstanceId ? pipeline.findIndex(p => p.id === selectedInstanceId) : -1;
        const selectedMatchesMode = selectedIdx !== -1 && (pipeline[selectedIdx].kind as Mode) === mode;
        const idx = selectedMatchesMode
          ? selectedIdx
          : (() => {
              // choose the last enabled instance of this mode
              for (let i = pipeline.length - 1; i >= 0; i--) {
                const inst = pipeline[i];
                if (!inst.enabled) continue;
                if ((inst.kind as Mode) === mode) return i;
              }
              return -1;
            })();
        if (idx !== -1) {
          // accumulate up to (but not including) selected
          let before = original;
          for (let i = 0; i < idx; i++) {
            const inst = pipeline[i];
            if (!inst.enabled) continue;
            before = computeInstanceStep(before, inst);
          }
          baseForMode = before;
          // apply only the selected instance to get transformed
          transformed = computeInstanceStep(before, pipeline[idx]);
        } else {
          // fallback to param order if selected not found
          if (transformOrder && transformOrder.length > 0) {
            const order = transformOrder as Exclude<Mode,'all'>[];
            for (const step of order) {
              if (step === mode) break;
              baseForMode = computeTransformedFor(baseForMode, step);
            }
          }
          transformed = computeTransformedFor(baseForMode, mode);
        }
      } else {
        // legacy param-based fallback
        if (transformOrder && transformOrder.length > 0) {
          const order = transformOrder as Exclude<Mode,'all'>[];
          for (const step of order) {
            if (step === mode) break;
            baseForMode = computeTransformedFor(baseForMode, step);
          }
        }
        transformed = computeTransformedFor(baseForMode, mode);
      }
    }

    const rp = (x: number, y: number, z: number) => {
      const cx = 127.5, cy = 127.5, cz = 127.5;
      const r = rotatePoint(x - cx, y - cy, z - cz, yaw, pitch);
      return project(r.x + cx, r.y + cy, r.z + cz, width, height, zoom);
    };

    const VERTS = [
      [0, 0, 0],
      [255, 0, 0],
      [255, 255, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 0, 255],
      [255, 255, 255],
      [0, 255, 255],
    ];
    const EDGES = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];

    ctx.lineWidth = 1;
    ctx.strokeStyle = cubeColor;
    const PV = VERTS.map(([x, y, z]) => rp(x, y, z));
    for (const [a, b] of EDGES) line(ctx, PV[a], PV[b]);

    ctx.strokeStyle = axisColor;
    line(ctx, rp(0, 0, 0), rp(255, 255, 255));

    const origin2d = rp(0, 0, 0);
    const pRaxis = rp(255, 0, 0);
    const pGaxis = rp(0, 255, 0);
    const pBaxis = rp(0, 0, 255);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ef4444"; line(ctx, origin2d, pRaxis);
    ctx.strokeStyle = "#22c55e"; line(ctx, origin2d, pGaxis);
    ctx.strokeStyle = "#3b82f6"; line(ctx, origin2d, pBaxis);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("R", pRaxis.x + 10, pRaxis.y);
    ctx.fillText("G", pGaxis.x - 10, pGaxis.y);
    ctx.fillText("B", pBaxis.x, pBaxis.y - 10);

    const p0 = rp((mode === 'all' ? original : baseForMode).r, (mode === 'all' ? original : baseForMode).g, (mode === 'all' ? original : baseForMode).b);
    const p1 = rp(transformed.r, transformed.g, transformed.b);

    // Original vector (dashed)
    ctx.setLineDash([6, 4]);
    drawArrow(ctx, origin2d, p0, arrowA, 2, 8);
    ctx.setLineDash([]);
    // Transformed vector (always show, including 'all')
    drawArrow(ctx, origin2d, p1, arrowB, 2, 8);

    // remove drawAuxForMode: we'll draw a single cyan guide per view below

    // Auxiliary depiction: exactly one cyan vector per render
    ctx.strokeStyle = auxColor;
    if (mode === 'all' && pipeline && selectedInstanceId) {
      const idx = pipeline.findIndex(p => p.id === selectedInstanceId);
      if (idx !== -1) {
        // Compute color before the selected instance
        let before = original;
        for (let i = 0; i < idx; i++) {
          const inst = pipeline[i];
          if (!inst.enabled) continue;
          before = computeInstanceStep(before, inst);
        }
        // After applying ONLY the selected instance
        const after = computeInstanceStep(before, pipeline[idx]);
        const pBefore = rp(before.r, before.g, before.b);
        const pAfter = rp(after.r, after.g, after.b);
        drawArrow(ctx, pBefore, pAfter, auxColor, 2, 8);
      }
    } else if (mode !== 'all') {
      // Always draw a single cyan guide from base (green) to transformed (magenta)
      if (mode === 'hue') {
        const v0x = p0.x - origin2d.x, v0y = p0.y - origin2d.y;
        const v1x = p1.x - origin2d.x, v1y = p1.y - origin2d.y;
        const a0 = Math.atan2(v0y, v0x);
        const a1 = Math.atan2(v1y, v1x);
        let delta = a1 - a0;
        while (delta <= -Math.PI) delta += 2 * Math.PI;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        const radius = Math.min(width, height) * 0.12 * zoom;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(origin2d.x, origin2d.y, radius, a0, a0 + delta, delta < 0);
        ctx.stroke();
        const endAngle = a0 + delta;
        const ax = origin2d.x + radius * Math.cos(endAngle);
        const ay = origin2d.y + radius * Math.sin(endAngle);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - 6 * Math.cos(endAngle - Math.PI / 6), ay - 6 * Math.sin(endAngle - Math.PI / 6));
        ctx.lineTo(ax - 6 * Math.cos(endAngle + Math.PI / 6), ay - 6 * Math.sin(endAngle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = auxColor;
        ctx.fill();
      } else if (mode === 'contrast') {
        const mid = rp(128, 128, 128);
        ctx.lineWidth = 1.5;
        drawArrow(ctx, mid, p1, auxColor, 2, 8);
      } else if (mode === 'saturation' || mode === 'vibrance') {
        const linear = params.linearSaturation ?? false;
        const wR = linear ? 0.2126 : 0.299;
        const wG = linear ? 0.7152 : 0.587;
        const wB = linear ? 0.0722 : 0.114;
        const gray = wR * (mode === 'saturation' ? baseForMode.r : baseForMode.r) + wG * (mode === 'saturation' ? baseForMode.g : baseForMode.g) + wB * (mode === 'saturation' ? baseForMode.b : baseForMode.b);
        const grayPt = rp(gray, gray, gray);
        ctx.lineWidth = 1.5;
        drawArrow(ctx, grayPt, p1, auxColor, 2, 8);
      } else {
        drawArrow(ctx, p0, p1, auxColor, 2, 8);
      }
    }

    // Update previous params snapshot after rendering
    prevParamsRef.current = { ...params };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, paramsBrightness, paramsContrast, paramsSaturation, paramsVibrance, paramsHue, paramsLinearSaturation, selectedRGB, yaw, pitch, zoom, showAllChanges, lastChange, transformOrder, hasImage, pipeline, selectedInstanceId, isVisible]);

  useEffect(() => {
    // Only set up event listeners when we have an image (canvas exists)
    if (!hasImage) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      lastPosRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !lastPosRef.current) return;
      const dx = e.clientX - lastPosRef.current.x;
      const dy = e.clientY - lastPosRef.current.y;
      lastPosRef.current = { x: e.clientX, y: e.clientY };
      setYaw(prev => prev + dx * 0.4);
      setPitch(prev => Math.max(-89, Math.min(89, prev - dy * 0.3)));
    };
    const onUp = () => { isDraggingRef.current = false; lastPosRef.current = null; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      setZoom(prev => Math.max(0.5, Math.min(3, prev * factor)));
    };
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    const onTDown = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      isDraggingRef.current = true;
      lastPosRef.current = { x: t.clientX, y: t.clientY };
    };
    const onTMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || !lastPosRef.current || e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - lastPosRef.current.x;
      const dy = t.clientY - lastPosRef.current.y;
      lastPosRef.current = { x: t.clientX, y: t.clientY };
      setYaw(prev => prev + dx * 0.4);
      setPitch(prev => Math.max(-89, Math.min(89, prev - dy * 0.3)));
    };
    const onTUp = () => { isDraggingRef.current = false; lastPosRef.current = null; };
    canvas.addEventListener('touchstart', onTDown, { passive: true });
    window.addEventListener('touchmove', onTMove, { passive: true });
    window.addEventListener('touchend', onTUp);
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTDown);
      window.removeEventListener('touchmove', onTMove);
      window.removeEventListener('touchend', onTUp);
    };
  }, [hasImage]);

  if (!hasImage) {
    return (
      <div className="space-y-2">
        <div className="bg-muted rounded-lg p-8 flex items-center justify-center min-h-[220px]">
          <div className="text-center text-muted-foreground">
            <p className="text-sm">Please upload an image to view the RGB cube visualization</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="bg-muted rounded-lg p-2 flex items-center justify-center">
        <canvas ref={canvasRef} width={width} height={height} style={{ width: '100%', height: 'auto', cursor: 'grab' }} />
      </div>
      <div className="text-[11px] font-mono text-muted-foreground">
        Drag to rotate view. Scroll to zoom. Legend: original vector = green, transformed = fuchsia, auxiliary guides = cyan, gray axis = slate.
      </div>
    </div>
  );
}


