import { useEffect, useRef, useState } from "react";

interface HueRotationCubeProps {
  hue: number; // degrees
  selectedRGB?: { r: number; g: number; b: number };
}

// Clamp helper
const clamp = (v: number, min = 0, max = 255) => Math.max(min, Math.min(max, v));

// Build the hue rotation 3x3 matrix (same form used in ImageCanvas)
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

// Multiply 3x3 matrix by RGB vector
function multiplyRGB(m: number[], r: number, g: number, b: number) {
  return {
    r: clamp(r * m[0] + g * m[1] + b * m[2]),
    g: clamp(r * m[3] + g * m[4] + b * m[5]),
    b: clamp(r * m[6] + g * m[7] + b * m[8]),
  };
}

// Rotate a point by yaw (around Y) and pitch (around X) in degrees
function rotatePoint(x: number, y: number, z: number, yawDeg: number, pitchDeg: number) {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  // Yaw around Y
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
  let rx = cosY * x + sinY * z;
  let ry = y;
  let rz = -sinY * x + cosY * z;
  // Pitch around X
  const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
  const ry2 = cosP * ry - sinP * rz;
  const rz2 = sinP * ry + cosP * rz;
  return { x: rx, y: ry2, z: rz2 };
}

// Simple projection from 3D (0..255) to 2D canvas coords using a fixed axonometric basis
function project(x: number, y: number, z: number, width: number, height: number) {
  const sx = 0.707 * (x - y);
  const sy = 0.408 * (x + y) - 0.816 * z;
  const scale = Math.min(width, height) / 380; // scale cube to fit panel
  const px = width / 2 + sx * scale;
  const py = height / 2 + sy * scale; // center vertically
  return { x: px, y: py };
}

// Draw line convenience
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

export function HueRotationCube({ hue, selectedRGB }: HueRotationCubeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [yaw, setYaw] = useState<number>(-35);   // initial view
  const [pitch, setPitch] = useState<number>(20);
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  // Size chosen to fit the math panel; canvas scales with parent width via CSS
  const width = 320;
  const height = 220;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    // Colors
    const axisColor = "#94a3b8"; // slate-400
    const cubeColor = "#475569"; // slate-600
    const arcColor = "#0ea5e9"; // sky-500
    const vecOriginal = "#22c55e"; // green-500
    const vecRotated = "#d946ef"; // fuchsia-500
    const original = selectedRGB ?? { r: 200, g: 150, b: 100 };
    const matExact = buildHueRotationMatrix(hue);
    const rotated = multiplyRGB(matExact, original.r, original.g, original.b);

    // Helper to rotate then project
    const rp = (x: number, y: number, z: number) => {
      const r = rotatePoint(x, y, z, yaw, pitch);
      return project(r.x, r.y, r.z, width, height);
    };

    // Cube vertices
    const V = [
      [0, 0, 0],
      [255, 0, 0],
      [255, 255, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 0, 255],
      [255, 255, 255],
      [0, 255, 255],
    ];
    // Edges by vertex indices
    const E = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];

    // Draw cube
    ctx.lineWidth = 1;
    ctx.strokeStyle = cubeColor;
    const PV = V.map(([x, y, z]) => rp(x, y, z));
    for (const [a, b] of E) {
      line(ctx, PV[a], PV[b]);
    }

    // Gray axis
    ctx.strokeStyle = axisColor;
    line(ctx, rp(0, 0, 0), rp(255, 255, 255));

    // Colored R/G/B axes from origin to unit corners
    const origin2d = rp(0, 0, 0);
    const pRaxis = rp(255, 0, 0);
    const pGaxis = rp(0, 255, 0);
    const pBaxis = rp(0, 0, 255);
    ctx.lineWidth = 3;
    // R axis (red)
    ctx.strokeStyle = "#ef4444"; // red-500
    line(ctx, origin2d, pRaxis);
    // G axis (green)
    ctx.strokeStyle = "#22c55e"; // green-500
    line(ctx, origin2d, pGaxis);
    // B axis (blue)
    ctx.strokeStyle = "#3b82f6"; // blue-500
    line(ctx, origin2d, pBaxis);
    // Axis endpoint labels
    ctx.fillStyle = "#e2e8f0"; // slate-200
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("R", pRaxis.x + 10, pRaxis.y);
    ctx.fillText("G", pGaxis.x - 10, pGaxis.y);
    ctx.fillText("B", pBaxis.x, pBaxis.y - 10);

    // Plot original and rotated points first (for arrow overlays later)

    const p0 = rp(original.r, original.g, original.b);
    const p1 = rp(rotated.r, rotated.g, rotated.b);
    // Points removed; use arrows only

    // Vectors from origin to points with arrowheads
    drawArrow(ctx, origin2d, p0, vecOriginal, 2, 8);
    drawArrow(ctx, origin2d, p1, vecRotated, 2, 8);

    // Angle arc between projected vectors around the origin
    const v0x = p0.x - origin2d.x, v0y = p0.y - origin2d.y;
    const v1x = p1.x - origin2d.x, v1y = p1.y - origin2d.y;
    const a0 = Math.atan2(v0y, v0x);
    const a1 = Math.atan2(v1y, v1x);
    // Normalize to shortest CCW arc from a0 to a1
    let delta = a1 - a0;
    while (delta <= -Math.PI) delta += 2 * Math.PI;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    const radius = Math.min(width, height) * 0.12;
    ctx.strokeStyle = arcColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(origin2d.x, origin2d.y, radius, a0, a0 + delta, delta < 0);
    ctx.stroke();
    // Arrow head at arc end
    const endAngle = a0 + delta;
    const ax = origin2d.x + radius * Math.cos(endAngle);
    const ay = origin2d.y + radius * Math.sin(endAngle);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - 6 * Math.cos(endAngle - Math.PI / 6), ay - 6 * Math.sin(endAngle - Math.PI / 6));
    ctx.lineTo(ax - 6 * Math.cos(endAngle + Math.PI / 6), ay - 6 * Math.sin(endAngle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = arcColor;
    ctx.fill();
  }, [hue, selectedRGB, yaw, pitch]);

  // Matrix block and numbers (exact and display)
  const angleRad = (hue * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const matExact = buildHueRotationMatrix(hue);
  const matDisp = matExact.map(v => Number(v.toFixed(3)));
  const R = selectedRGB?.r ?? 200, G = selectedRGB?.g ?? 150, B = selectedRGB?.b ?? 100;
  const out = multiplyRGB(matExact, R, G, B);

  // Drag handlers
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
    const onUp = () => {
      isDraggingRef.current = false;
      lastPosRef.current = null;
    };
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    // Touch
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
    const onTUp = () => {
      isDraggingRef.current = false;
      lastPosRef.current = null;
    };
    canvas.addEventListener('touchstart', onTDown, { passive: true });
    window.addEventListener('touchmove', onTMove, { passive: true });
    window.addEventListener('touchend', onTUp);

    return () => {
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('touchstart', onTDown);
      window.removeEventListener('touchmove', onTMove);
      window.removeEventListener('touchend', onTUp);
    };
  }, []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-muted rounded-lg p-2 flex items-center justify-center">
        <canvas ref={canvasRef} width={width} height={height} style={{ width: '100%', height: 'auto', cursor: 'grab' }} />
      </div>
      <div className="bg-muted rounded-lg p-4 text-xs font-mono space-y-2">
        <div className="text-foreground">Hue rotation: {hue}°</div>
        <div className="text-foreground">Angle and trig:</div>
        <div className="text-primary">θ = {(angleRad).toFixed(3)} rad</div>
        <div className="text-primary">cos θ = {cosA.toFixed(3)}, sin θ = {sinA.toFixed(3)}</div>
        <div className="text-foreground">Rotation matrix (3×3):</div>
        <div className="text-primary">
          [{matDisp[0]} {matDisp[1]} {matDisp[2]}]<br/>
          [{matDisp[3]} {matDisp[4]} {matDisp[5]}]<br/>
          [{matDisp[6]} {matDisp[7]} {matDisp[8]}]
        </div>
        <div className="text-foreground">Vector multiply (example):</div>
        <div className="text-primary">in = [{Math.round(R)}, {Math.round(G)}, {Math.round(B)}]</div>
        <div className="text-primary">out = [{Math.round(out.r)}, {Math.round(out.g)}, {Math.round(out.b)}]</div>
        <div className="text-muted-foreground">Drag to rotate view. Colors: vector(orig) green, vector(rot) fuchsia, arc sky.</div>
      </div>
    </div>
  );
}

export default HueRotationCube;


