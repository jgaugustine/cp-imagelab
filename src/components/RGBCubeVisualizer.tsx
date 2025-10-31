import { useEffect, useRef, useState } from "react";
import { TransformationType } from "@/types/transformations";
import { srgbToLinear, linearToSrgb } from "@/lib/utils";

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

export default function RGBCubeVisualizer({ mode, params, selectedRGB, showAllChanges, lastChange, transformOrder }: RGBCubeVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [yaw, setYaw] = useState<number>(-35);
  const [pitch, setPitch] = useState<number>(20);
  const [zoom, setZoom] = useState<number>(1);
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const width = 320;
  const height = 220;
  const prevParamsRef = useRef<{ brightness?: number; contrast?: number; saturation?: number; vibrance?: number; hue?: number; linearSaturation?: boolean }>({ ...params });

  const finite01 = (v: number) => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  const sanitizeLin = (c: { r: number; g: number; b: number }) => ({ r: finite01(c.r), g: finite01(c.g), b: finite01(c.b) });

  function computeTransformedForLinear(originalLin: { r: number; g: number; b: number }, forMode: Mode, customParams?: typeof params) {
    const p = customParams ?? params;
    const ref = 0.5;
    if (forMode === 'brightness') {
      const stops = (p.brightness ?? 0) / 50;
      const f = Math.pow(2, stops);
      return { r: Math.max(0, Math.min(1, originalLin.r * f)), g: Math.max(0, Math.min(1, originalLin.g * f)), b: Math.max(0, Math.min(1, originalLin.b * f)) };
    }
    if (forMode === 'contrast') {
      const c = p.contrast ?? 1;
      return { r: Math.max(0, Math.min(1, (originalLin.r - ref) * c + ref)), g: Math.max(0, Math.min(1, (originalLin.g - ref) * c + ref)), b: Math.max(0, Math.min(1, (originalLin.b - ref) * c + ref)) };
    }
    if (forMode === 'saturation') {
      const s = p.saturation ?? 1;
      const Y = 0.2126 * originalLin.r + 0.7152 * originalLin.g + 0.0722 * originalLin.b;
      return { r: Math.max(0, Math.min(1, Y + (originalLin.r - Y) * s)), g: Math.max(0, Math.min(1, Y + (originalLin.g - Y) * s)), b: Math.max(0, Math.min(1, Y + (originalLin.b - Y) * s)) };
    }
    if (forMode === 'vibrance') {
      const V = p.vibrance ?? 0;
      const maxC = Math.max(originalLin.r, originalLin.g, originalLin.b);
      const minC = Math.min(originalLin.r, originalLin.g, originalLin.b);
      const sEst = maxC === 0 ? 0 : (maxC - minC) / maxC;
      const f = 1 + V * (1 - sEst);
      const Y = 0.2126 * originalLin.r + 0.7152 * originalLin.g + 0.0722 * originalLin.b;
      return { r: Math.max(0, Math.min(1, Y + (originalLin.r - Y) * f)), g: Math.max(0, Math.min(1, Y + (originalLin.g - Y) * f)), b: Math.max(0, Math.min(1, Y + (originalLin.b - Y) * f)) };
    }
    // hue
    const hue = p.hue ?? 0;
    const M = buildHueRotationMatrix(hue);
    return {
      r: Math.max(0, Math.min(1, originalLin.r * M[0] + originalLin.g * M[1] + originalLin.b * M[2])),
      g: Math.max(0, Math.min(1, originalLin.r * M[3] + originalLin.g * M[4] + originalLin.b * M[5])),
      b: Math.max(0, Math.min(1, originalLin.r * M[6] + originalLin.g * M[7] + originalLin.b * M[8])),
    };
  }

  function computeTransformedFor(original: { r: number; g: number; b: number }, forMode: Mode, customParams?: typeof params) {
    // Keep for any consumers that expect sRGB; not used for plotting anymore
    const lin0 = { r: srgbToLinear(original.r), g: srgbToLinear(original.g), b: srgbToLinear(original.b) };
    const lin = computeTransformedForLinear(lin0, forMode, customParams);
    return { r: clamp(linearToSrgb(lin.r)), g: clamp(linearToSrgb(lin.g)), b: clamp(linearToSrgb(lin.b)) };
  }

  function computePipelineTransformedLinear(originalLin: { r: number; g: number; b: number }, customParams?: typeof params) {
    const order: Exclude<Mode, 'all'>[] = (transformOrder ?? ['brightness','contrast','saturation','vibrance','hue']) as Exclude<Mode,'all'>[];
    let lin = { ...originalLin };
    for (const step of order) {
      lin = computeTransformedForLinear(lin, step, customParams);
    }
    return lin;
  }

  function computePipelineTransformed(original: { r: number; g: number; b: number }) {
    const lin0 = { r: srgbToLinear(original.r), g: srgbToLinear(original.g), b: srgbToLinear(original.b) };
    const lin = computePipelineTransformedLinear(lin0);
    return { r: clamp(linearToSrgb(lin.r)), g: clamp(linearToSrgb(lin.g)), b: clamp(linearToSrgb(lin.b)) };
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
    try {
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

    // Compute in linear space for visualization
    let originalLin = { r: srgbToLinear(original.r), g: srgbToLinear(original.g), b: srgbToLinear(original.b) };
    originalLin = sanitizeLin(originalLin);
    let transformedLin = mode === 'all' ? computePipelineTransformedLinear(originalLin) : computeTransformedForLinear(originalLin, mode);
    transformedLin = sanitizeLin(transformedLin);

    // Projector that accepts linear [0,1] and internally scales to 0..255 for stable sizing
    const rpL = (lx: number, ly: number, lz: number) => {
      const x = finite01(lx) * 255, y = finite01(ly) * 255, z = finite01(lz) * 255;
      const cx = 127.5, cy = 127.5, cz = 127.5;
      const r = rotatePoint(x - cx, y - cy, z - cz, yaw, pitch);
      return project(r.x + cx, r.y + cy, r.z + cz, width, height, zoom);
    };

    const VERTS = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ];
    const EDGES = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];

    ctx.lineWidth = 1;
    ctx.strokeStyle = cubeColor;
    const PV = VERTS.map(([x, y, z]) => rpL(x, y, z));
    for (const [a, b] of EDGES) line(ctx, PV[a], PV[b]);

    ctx.strokeStyle = axisColor;
    line(ctx, rpL(0, 0, 0), rpL(1, 1, 1));

    const origin2d = rpL(0, 0, 0);
    const pRaxis = rpL(1, 0, 0);
    const pGaxis = rpL(0, 1, 0);
    const pBaxis = rpL(0, 0, 1);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ef4444"; line(ctx, origin2d, pRaxis);
    ctx.strokeStyle = "#22c55e"; line(ctx, origin2d, pGaxis);
    ctx.strokeStyle = "#3b82f6"; line(ctx, origin2d, pBaxis);

    const p0 = rpL(originalLin.r, originalLin.g, originalLin.b);
    const p1 = rpL(transformedLin.r, transformedLin.g, transformedLin.b);

    // Original vector (dashed)
    ctx.setLineDash([6, 4]);
    drawArrow(ctx, origin2d, p0, arrowA, 2, 8);
    ctx.setLineDash([]);
    // Transformed vector (always show, including 'all')
    drawArrow(ctx, origin2d, p1, arrowB, 2, 8);

    function drawAuxForMode(activeMode: Mode) {
      const activeTransformedLin = computeTransformedForLinear(originalLin, activeMode);
      const activeP1 = rpL(activeTransformedLin.r, activeTransformedLin.g, activeTransformedLin.b);
      ctx.strokeStyle = auxColor;
      if (activeMode === 'brightness') {
        drawArrow(ctx, p0, activeP1, auxColor, 2, 8);
      } else if (activeMode === 'contrast') {
        const mid = rpL(0.5, 0.5, 0.5);
        ctx.lineWidth = 1.5;
        line(ctx, mid, p0);
        drawArrow(ctx, mid, activeP1, auxColor, 2, 8);
      } else if (activeMode === 'saturation' || activeMode === 'vibrance') {
        const Y = 0.2126 * originalLin.r + 0.7152 * originalLin.g + 0.0722 * originalLin.b;
        const grayPt = rpL(Y, Y, Y);
        ctx.lineWidth = 1.5;
        line(ctx, grayPt, p0);
        drawArrow(ctx, grayPt, activeP1, auxColor, 2, 8);
      } else if (activeMode === 'hue') {
        // Arc around gray axis in 2D projection
        const v0x = p0.x - origin2d.x, v0y = p0.y - origin2d.y;
        const v1x = activeP1.x - origin2d.x, v1y = activeP1.y - origin2d.y;
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
      }
    }

    // Auxiliary depiction: draw relative to the last changed transform, showing its effect from the cumulative state before it was changed
    ctx.strokeStyle = auxColor;
    if (lastChange) {
      const step = lastChange as Exclude<Mode,'all'>;
      // Compute the state before the last change using linear pipeline
      const prevParams = prevParamsRef.current;
      const beforeParams = { ...params } as typeof params;
      if (step === 'brightness') (beforeParams as any).brightness = prevParams.brightness ?? 0;
      else if (step === 'contrast') (beforeParams as any).contrast = prevParams.contrast ?? 1;
      else if (step === 'saturation') (beforeParams as any).saturation = prevParams.saturation ?? 1;
      else if (step === 'vibrance') (beforeParams as any).vibrance = prevParams.vibrance ?? 0;
      else if (step === 'hue') (beforeParams as any).hue = prevParams.hue ?? 0;

      const order: Exclude<Mode, 'all'>[] = (transformOrder ?? ['brightness','contrast','saturation','vibrance','hue']) as Exclude<Mode,'all'>[];
      let beforeLin = { ...originalLin };
      for (const s of order) {
        if (s === step) break;
        beforeLin = computeTransformedForLinear(beforeLin, s, params);
      }

      const fullBeforeLin = computePipelineTransformedLinear(originalLin, beforeParams);
      const fullAfterLin = mode === 'all' ? transformedLin : computePipelineTransformedLinear(originalLin);
      
      // The update vector should show the transform effect, but we want it to terminate at the edited pixel value
      // So compute what the step does from the "before" input point
      const stepAfter = computeTransformedFor(before, step, params);
      
      // Use fullBefore as the starting point for vectors that need it (contrast, saturation), but stepAfter might not equal fullAfter
      // Actually, let's show the vector from before->stepAfter, but then we also need to show where it ends up in the full pipeline
      // Actually, I think the issue is simpler: the vector should terminate at fullAfter (the edited pixel value)
      
      // For most transforms, show from before->fullAfter, but positioned correctly
      // For transforms that have specific guides (contrast mid-point, saturation gray), use those guides but ensure termination
      
      const pBefore = rpL(beforeLin.r, beforeLin.g, beforeLin.b);
      const pFullAfter = rpL(fullAfterLin.r, fullAfterLin.g, fullAfterLin.b);
      if (step === 'hue') {
        const v0x = pBefore.x - origin2d.x, v0y = pBefore.y - origin2d.y;
        const v1x = pFullAfter.x - origin2d.x, v1y = pFullAfter.y - origin2d.y;
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
      } else if (step === 'contrast') {
        const mid = rpL(0.5, 0.5, 0.5);
        ctx.lineWidth = 1.5;
        drawArrow(ctx, mid, pFullAfter, auxColor, 2, 8);
      } else if (step === 'saturation' || step === 'vibrance') {
        const Yb = 0.2126 * beforeLin.r + 0.7152 * beforeLin.g + 0.0722 * beforeLin.b;
        const grayPt = rpL(Yb, Yb, Yb);
        ctx.lineWidth = 1.5;
        drawArrow(ctx, grayPt, pFullAfter, auxColor, 2, 8);
      } else {
        // brightness: simple arrow from before to the edited pixel value
        drawArrow(ctx, pBefore, pFullAfter, auxColor, 2, 8);
      }
    }

    // Always draw the base cyan guide for the current tab (except 'all')
    if (mode !== 'all') {
      ctx.setLineDash([]);
      drawAuxForMode(mode as Exclude<Mode, 'all'>);
      // Fallback markers: draw small cyan dots at original and mode-result to guarantee visibility
      const activeLin = computeTransformedForLinear(originalLin, mode as Exclude<Mode, 'all'>);
      const endP = rpL(activeLin.r, activeLin.g, activeLin.b);
      ctx.fillStyle = auxColor;
      ctx.beginPath();
      ctx.arc(p0.x, p0.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(endP.x, endP.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

      // Update previous params snapshot after rendering
      prevParamsRef.current = { ...params };
    } catch (err) {
      // Fail-safe: do not crash the app if the visualizer errors
      // eslint-disable-next-line no-console
      console.error('RGBCubeVisualizer render error', err);
    }
  }, [mode, params, selectedRGB, yaw, pitch, zoom, showAllChanges, lastChange, transformOrder]);

  useEffect(() => {
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
  }, []);

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


