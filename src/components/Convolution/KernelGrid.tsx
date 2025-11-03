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


