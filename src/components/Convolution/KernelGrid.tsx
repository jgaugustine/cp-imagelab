import React from 'react';

interface KernelGridProps {
  kernel: number[][];
  title?: string;
}

export const KernelGrid: React.FC<KernelGridProps> = ({ kernel, title }) => {
  const size = kernel.length;
  return (
    <div className="inline-block">
      {title && <div className="text-xs text-muted-foreground mb-1">{title}</div>}
      <div className="grid" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`, gap: '4px' }}>
        {kernel.flatMap((row, ri) =>
          row.map((v, ci) => (
            <div key={`${ri}-${ci}`} className="px-2 py-1 text-xs font-mono rounded border border-border bg-muted text-foreground text-center">
              {Math.abs(v) < 1e-6 ? '0' : v.toFixed(3)}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default KernelGrid;

interface KernelPreviewProps {
  kernel: number[][];
  scale?: number; // pixel size per kernel cell
  title?: string;
}

export const KernelPreview: React.FC<KernelPreviewProps> = ({ kernel, scale = 16, title }) => {
  const size = kernel.length;
  const width = size * scale;
  const height = size * scale;
  const min = Math.min(...kernel.flat());
  const max = Math.max(...kernel.flat());
  const isConstant = Math.abs(max - min) < 1e-12;
  const range = isConstant ? 1 : (max - min);
  return (
    <div className="inline-block">
      {title && <div className="text-xs text-muted-foreground mb-1">{title}</div>}
      <canvas
        width={width}
        height={height}
        ref={(el) => {
          if (!el) return;
          const ctx = el.getContext('2d');
          if (!ctx) return;
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              const v = kernel[y][x];
              const t = isConstant ? 0.5 : (v - min) / range; // use mid-gray for constant kernels
              const g = Math.max(0, Math.min(255, Math.round(t * 255)));
              ctx.fillStyle = `rgb(${g},${g},${g})`;
              ctx.fillRect(x * scale, y * scale, scale, scale);
            }
          }
          // draw grid lines
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          for (let i = 1; i < size; i++) {
            ctx.beginPath();
            ctx.moveTo(i * scale + 0.5, 0);
            ctx.lineTo(i * scale + 0.5, height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * scale + 0.5);
            ctx.lineTo(width, i * scale + 0.5);
            ctx.stroke();
          }
        }}
        className="border border-border rounded"
      />
    </div>
  );
};


