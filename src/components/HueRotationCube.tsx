import { useEffect, useRef } from "react";

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

// Simple isometric-like projection from 3D (0..255) to 2D canvas coords
function project(x: number, y: number, z: number, width: number, height: number) {
  const sx = 0.707 * (x - y);
  const sy = 0.408 * (x + y) - 0.816 * z;
  const scale = Math.min(width, height) / 400; // scale cube nicely
  const px = width / 2 + sx * scale;
  const py = height * 0.7 + sy * scale;
  return { x: px, y: py };
}

// Draw line convenience
function line(ctx: CanvasRenderingContext2D, a: { x: number; y: number }, b: { x: number; y: number }) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

export function HueRotationCube({ hue, selectedRGB }: HueRotationCubeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    const mat = buildHueRotationMatrix(hue);
    const rotated = multiplyRGB(mat, original.r, original.g, original.b);

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
    const PV = V.map(([x, y, z]) => project(x, y, z, width, height));
    for (const [a, b] of E) {
      line(ctx, PV[a], PV[b]);
    }

    // Gray axis
    ctx.strokeStyle = axisColor;
    line(ctx, project(0, 0, 0, width, height), project(255, 255, 255, width, height));

    // Colored R/G/B axes from origin to unit corners
    const origin2d = project(0, 0, 0, width, height);
    const pRaxis = project(255, 0, 0, width, height);
    const pGaxis = project(0, 255, 0, width, height);
    const pBaxis = project(0, 0, 255, width, height);
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

    // Rotation arc: draw a small arc around the mid gray point to indicate angle
    const center = project(127.5, 127.5, 127.5, width, height);
    ctx.strokeStyle = arcColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const radius = Math.min(width, height) * 0.12;
    const start = -Math.PI / 3;
    const end = start + (hue * Math.PI) / 180;
    ctx.arc(center.x, center.y, radius, start, end, false);
    ctx.stroke();

    // Arrow head
    const ax = center.x + radius * Math.cos(end);
    const ay = center.y + radius * Math.sin(end);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - 6 * Math.cos(end - 0.3), ay - 6 * Math.sin(end - 0.3));
    ctx.lineTo(ax - 6 * Math.cos(end + 0.3), ay - 6 * Math.sin(end + 0.3));
    ctx.closePath();
    ctx.fillStyle = arcColor;
    ctx.fill();

    // Plot original and rotated points
    const p0 = project(original.r, original.g, original.b, width, height);
    const p1 = project(rotated.r, rotated.g, rotated.b, width, height);
    // Original point
    ctx.fillStyle = `rgb(${Math.round(original.r)}, ${Math.round(original.g)}, ${Math.round(original.b)})`;
    ctx.beginPath();
    ctx.arc(p0.x, p0.y, 4, 0, Math.PI * 2);
    ctx.fill();
    // Rotated point
    ctx.fillStyle = `rgb(${Math.round(rotated.r)}, ${Math.round(rotated.g)}, ${Math.round(rotated.b)})`;
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, 4, 0, Math.PI * 2);
    ctx.fill();

    // Vectors from origin to points
    ctx.lineWidth = 2;
    ctx.strokeStyle = vecOriginal;
    line(ctx, origin2d, p0);
    ctx.strokeStyle = vecRotated;
    line(ctx, origin2d, p1);
  }, [hue, selectedRGB]);

  // Matrix block and numbers
  const angleRad = (hue * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const mat = buildHueRotationMatrix(hue).map(v => Number(v.toFixed(3)));
  const R = selectedRGB?.r ?? 200, G = selectedRGB?.g ?? 150, B = selectedRGB?.b ?? 100;
  const out = multiplyRGB(mat, R, G, B);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-muted rounded-lg p-2 flex items-center justify-center">
        <canvas ref={canvasRef} width={width} height={height} style={{ width: '100%', height: 'auto' }} />
      </div>
      <div className="bg-muted rounded-lg p-4 text-xs font-mono space-y-2">
        <div className="text-foreground">Hue rotation: {hue}°</div>
        <div className="text-foreground">Angle and trig:</div>
        <div className="text-primary">θ = {(angleRad).toFixed(3)} rad</div>
        <div className="text-primary">cos θ = {cosA.toFixed(3)}, sin θ = {sinA.toFixed(3)}</div>
        <div className="text-foreground">Rotation matrix (3×3):</div>
        <div className="text-primary">
          [{mat[0]} {mat[1]} {mat[2]}]<br/>
          [{mat[3]} {mat[4]} {mat[5]}]<br/>
          [{mat[6]} {mat[7]} {mat[8]}]
        </div>
        <div className="text-foreground">Vector multiply (example):</div>
        <div className="text-primary">in = [{Math.round(R)}, {Math.round(G)}, {Math.round(B)}]</div>
        <div className="text-primary">out = [{Math.round(out.r)}, {Math.round(out.g)}, {Math.round(out.b)}]</div>
        <div className="text-muted-foreground">Colors: vector(orig) green, vector(rot) fuchsia, arc sky.</div>
      </div>
    </div>
  );
}

export default HueRotationCube;


