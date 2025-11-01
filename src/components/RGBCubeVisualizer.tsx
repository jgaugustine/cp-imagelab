import { useEffect, useRef, useState, useMemo } from "react";
import { TransformationType } from "@/types/transformations";

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

export default function RGBCubeVisualizer({ mode, params, selectedRGB, showAllChanges, lastChange, transformOrder, hasImage }: RGBCubeVisualizerProps) {
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
    // Use provided order if available; otherwise default
    const order: Exclude<Mode, 'all'>[] = (transformOrder ?? ['brightness','contrast','saturation','vibrance','hue']) as Exclude<Mode,'all'>[];
    let rgb = { ...original };
    for (const step of order) {
      rgb = computeTransformedFor(rgb, step);
    }
    return rgb;
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

    const transformed = mode === 'all' ? computePipelineTransformed(original) : computeTransformedFor(original, mode);

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

    const p0 = rp(original.r, original.g, original.b);
    const p1 = rp(transformed.r, transformed.g, transformed.b);

    // Original vector (dashed)
    ctx.setLineDash([6, 4]);
    drawArrow(ctx, origin2d, p0, arrowA, 2, 8);
    ctx.setLineDash([]);
    // Transformed vector (always show, including 'all')
    drawArrow(ctx, origin2d, p1, arrowB, 2, 8);

    function drawAuxForMode(activeMode: Mode) {
      const activeTransformed = computeTransformedFor(original, activeMode);
      const activeP1 = rp(activeTransformed.r, activeTransformed.g, activeTransformed.b);
      ctx.strokeStyle = auxColor;
      if (activeMode === 'brightness') {
        drawArrow(ctx, p0, activeP1, auxColor, 2, 8);
      } else if (activeMode === 'contrast') {
        const mid = rp(128, 128, 128);
        ctx.lineWidth = 1.5;
        line(ctx, mid, p0);
        drawArrow(ctx, mid, activeP1, auxColor, 2, 8);
      } else if (activeMode === 'saturation' || activeMode === 'vibrance') {
        const linear = params.linearSaturation ?? false;
        const wR = linear ? 0.2126 : 0.299;
        const wG = linear ? 0.7152 : 0.587;
        const wB = linear ? 0.0722 : 0.114;
        const gray = wR * original.r + wG * original.g + wB * original.b;
        const grayPt = rp(gray, gray, gray);
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
      // Compute the state before the last change: full pipeline with previous value for lastChange, current for all others
      const prevParams = prevParamsRef.current;
      const beforeParams = { ...params };
      if (step === 'brightness') (beforeParams as any).brightness = prevParams.brightness ?? 0;
      else if (step === 'contrast') (beforeParams as any).contrast = prevParams.contrast ?? 1;
      else if (step === 'saturation') (beforeParams as any).saturation = prevParams.saturation ?? 1;
      else if (step === 'vibrance') (beforeParams as any).vibrance = prevParams.vibrance ?? 0;
      else if (step === 'hue') (beforeParams as any).hue = prevParams.hue ?? 0;

      // Compute the input to the last-changed step by applying all transforms that come before it in the pipeline
      const order: Exclude<Mode, 'all'>[] = (transformOrder ?? ['brightness','contrast','saturation','vibrance','hue']) as Exclude<Mode,'all'>[];
      let before = original;
      // Apply all transforms up to (but not including) the last-changed step, using current params (since those haven't changed)
      for (const s of order) {
        if (s === step) break;
        before = computeTransformedFor(before, s, params);
      }
      
      // Compute the full pipeline result with beforeParams (old value for step) - this is where we were before the change
      const fullBefore = computePipelineWithParams(beforeParams, original);
      // Compute the full pipeline result with current params - this is where we are now (the edited pixel value)
      const fullAfter = mode === 'all' ? transformed : computePipelineTransformed(original);
      
      // The update vector should show the transform effect, but we want it to terminate at the edited pixel value
      // So compute what the step does from the "before" input point
      const stepAfter = computeTransformedFor(before, step, params);
      
      // Use fullBefore as the starting point for vectors that need it (contrast, saturation), but stepAfter might not equal fullAfter
      // Actually, let's show the vector from before->stepAfter, but then we also need to show where it ends up in the full pipeline
      // Actually, I think the issue is simpler: the vector should terminate at fullAfter (the edited pixel value)
      
      // For most transforms, show from before->fullAfter, but positioned correctly
      // For transforms that have specific guides (contrast mid-point, saturation gray), use those guides but ensure termination
      
      const pBefore = rp(before.r, before.g, before.b);
      const pFullAfter = rp(fullAfter.r, fullAfter.g, fullAfter.b);
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
        const mid = rp(128, 128, 128);
        ctx.lineWidth = 1.5;
        drawArrow(ctx, mid, pFullAfter, auxColor, 2, 8);
      } else if (step === 'saturation' || step === 'vibrance') {
        const linear = params.linearSaturation ?? false;
        const wR = linear ? 0.2126 : 0.299;
        const wG = linear ? 0.7152 : 0.587;
        const wB = linear ? 0.0722 : 0.114;
        const grayBefore = wR * before.r + wG * before.g + wB * before.b;
        const grayPt = rp(grayBefore, grayBefore, grayBefore);
        ctx.lineWidth = 1.5;
        drawArrow(ctx, grayPt, pFullAfter, auxColor, 2, 8);
      } else {
        // brightness: simple arrow from before to the edited pixel value
        drawArrow(ctx, pBefore, pFullAfter, auxColor, 2, 8);
      }
    } else if (mode !== 'all') {
      drawAuxForMode(mode as Exclude<Mode, 'all'>);
    }

    // Update previous params snapshot after rendering
    prevParamsRef.current = { ...params };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, paramsBrightness, paramsContrast, paramsSaturation, paramsVibrance, paramsHue, paramsLinearSaturation, selectedRGB, yaw, pitch, zoom, showAllChanges, lastChange, transformOrder, hasImage]);

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


