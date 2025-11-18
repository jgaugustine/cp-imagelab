import React from 'react';

interface KernelCellData {
  r: number;
  g: number;
  b: number;
  weight: number;
}

interface KernelMultiplicationDiagramProps {
  title: string;
  size: number;
  cells: KernelCellData[];
  totals?: { r: number; g: number; b: number };
  highlightColor?: { r: number; g: number; b: number };
}

const formatWeight = (value: number) => {
  if (Math.abs(value) < 1e-6) return '0';
  if (Math.abs(value) >= 10) return value.toFixed(0);
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(3);
};

const formatVector = (r: number, g: number, b: number) =>
  `(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

export const KernelMultiplicationDiagram: React.FC<KernelMultiplicationDiagramProps> = ({
  title,
  size,
  cells,
  totals,
  highlightColor,
}) => {
  const gridTemplate = { gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` };

  const highlight =
    highlightColor &&
    `rgba(${highlightColor.r}, ${highlightColor.g}, ${highlightColor.b}, 0.15)`;

  return (
    <div className="space-y-2 w-full">
      <div className="text-xs font-semibold text-foreground">{title}</div>
      <div className="grid gap-2 w-full" style={gridTemplate}>
        {cells.map((cell, idx) => (
          <div key={idx} className="relative">
            <div
              className="rounded border border-border bg-card/60 px-2 py-1 text-center shadow-sm flex flex-col gap-1 justify-between items-stretch"
              style={{
                backgroundColor: highlight ?? undefined,
                minHeight: 70,
              }}
            >
              <div className="text-[10px] font-mono text-foreground whitespace-nowrap">
                {formatVector(cell.r, cell.g, cell.b)}
              </div>
              <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                × {formatWeight(cell.weight)}
              </div>
              <div
                className="h-3 w-full rounded border border-border/40"
                style={{
                  backgroundColor: `rgb(${cell.r}, ${cell.g}, ${cell.b})`,
                }}
              />
            </div>
            {idx !== cells.length - 1 && (
              <span className="pointer-events-none absolute -right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-white">
                +
              </span>
            )}
          </div>
        ))}
      </div>
      {totals && (
        <div className="text-xs font-mono text-right text-foreground">
          = {formatVector(totals.r, totals.g, totals.b)}
        </div>
      )}
    </div>
  );
};

export default KernelMultiplicationDiagram;


