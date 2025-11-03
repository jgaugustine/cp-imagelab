import React from 'react';

interface ProductCubeProps {
  title?: string;
  products: number[][]; // dot products per cell for a single channel or axis
  size: number; // kernel size
}

// A lightweight 3D-ish visualization using CSS perspective and bar heights
export const ProductCube: React.FC<ProductCubeProps> = ({ title, products, size }) => {
  const flat = products.flat();
  const absMax = Math.max(1e-6, ...flat.map(v => Math.abs(v)));
  return (
    <div className="inline-block">
      {title && <div className="text-xs text-muted-foreground mb-1">{title}</div>}
      <div
        className="relative"
        style={{
          width: size * 22,
          height: size * 22,
          perspective: 600,
        }}
      >
        <div
          className="absolute inset-0"
          style={{ transform: 'rotateX(55deg) rotateZ(45deg) translateZ(0)' }}
        >
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${size}, 1fr)`, gap: '6px' }}
          >
            {products.flatMap((row, ri) =>
              row.map((v, ci) => {
                const hNorm = Math.min(1, Math.abs(v) / absMax);
                const height = 8 + hNorm * 36; // base + scaled height
                const sign = v >= 0 ? 1 : -1;
                const hue = sign > 0 ? 200 : 10; // blue for +, red for -
                const sat = 85;
                const light = 55 - hNorm * 15;
                const color = `hsl(${hue} ${sat}% ${light}%)`;
                return (
                  <div key={`${ri}-${ci}`} className="relative" style={{ width: 16, height: 16 }}>
                    <div
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-sm border border-border"
                      style={{
                        width: 12,
                        height,
                        background: color,
                        boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                        transform: 'translateZ(0)'
                      }}
                      title={v.toFixed(2)}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductCube;


