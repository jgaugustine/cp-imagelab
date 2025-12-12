import { Card, CardContent } from "@/components/ui/card";
import { TransformationType, RGB, FilterKind } from "@/types/transformations";
// Kernel visuals are shown in MathExplanation; inspector shows neighborhood pixels and result only.

interface PixelInspectorProps {
  x: number;
  y: number;
  originalRGB: RGB;
  transformedRGB: RGB;
  stepByStep: Record<TransformationType, RGB>;
  transformOrder: TransformationType[];
  // New optional step array for instance-based pipeline
  steps?: { id: string; kind: FilterKind; inputRGB: RGB; outputRGB: RGB }[];
  onSelectInstance?: (id: string) => void;
  brightness: number;
  contrast: number;
  saturation: number;
  vibrance: number;
  hue: number;
  whites?: number;
  blacks?: number;
  cursorX: number;
  cursorY: number;
  linearSaturation?: boolean;
  activeConv?: { kind: 'blur' | 'sharpen' | 'edge' | 'denoise'; kernel?: number[][]; edgeKernels?: { kx: number[][]; ky: number[][] }; padding: 'zero' | 'reflect' | 'edge' };
  convWindow?: { size: number; pixels: RGB[][] };
}

export function PixelInspector({
  x,
  y,
  originalRGB,
  transformedRGB,
  stepByStep,
  transformOrder,
  steps,
  onSelectInstance,
  brightness,
  contrast,
  saturation,
  vibrance,
  hue,
  whites = 0,
  blacks = 0,
  cursorX,
  cursorY,
  linearSaturation = false,
  activeConv,
  convWindow,
}: PixelInspectorProps) {
  const rgbToHex = (r: number, g: number, b: number) => {
    return `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  };

  const formatRGB = (rgb: RGB) => {
    return `(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)})`;
  };

  const getTransformLabel = (type: TransformationType): string => {
    const labels: Record<TransformationType, string> = {
      brightness: 'Brightness',
      contrast: 'Contrast',
      saturation: 'Saturation',
      vibrance: 'Vibrance',
      hue: 'Hue',
      whites: 'Whites',
      blacks: 'Blacks'
    };
    return labels[type];
  };

  const getTransformValue = (type: TransformationType): string => {
    switch (type) {
      case 'brightness': return brightness > 0 ? `+${brightness}` : `${brightness}`;
      case 'contrast': return `×${contrast.toFixed(2)}`;
      case 'saturation': return `×${saturation.toFixed(2)}`;
      case 'vibrance': return `${vibrance.toFixed(2)}`;
      case 'hue': return `${hue}°`;
      case 'whites': return whites > 0 ? `+${whites}` : `${whites}`;
      case 'blacks': return blacks > 0 ? `+${blacks}` : `${blacks}`;
    }
  };

  const shouldShowStep = (type: TransformationType): boolean => {
    switch (type) {
      case 'brightness': return brightness !== 0;
      case 'contrast': return contrast !== 1;
      case 'saturation': return saturation !== 1;
      case 'vibrance': return vibrance !== 0;
      case 'hue': return hue !== 0;
    }
  };

  // Helpers to re-simulate pipeline up to a step to compute Gray/Y for that input
  const clamp = (val: number): number => Math.max(0, Math.min(255, val));
  const toLin = (c: number) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const toSRGB = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255;

  const applyBrightnessLoc = (rgb: RGB): RGB => ({ r: clamp(rgb.r + brightness), g: clamp(rgb.g + brightness), b: clamp(rgb.b + brightness) });
  const applyContrastLoc = (rgb: RGB): RGB => ({ r: clamp((rgb.r - 128) * contrast + 128), g: clamp((rgb.g - 128) * contrast + 128), b: clamp((rgb.b - 128) * contrast + 128) });
  const applySaturationLoc = (rgb: RGB, sat: number, vib: number): RGB => {
    const gray = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
    const maxC = Math.max(rgb.r, rgb.g, rgb.b);
    const minC = Math.min(rgb.r, rgb.g, rgb.b);
    const s = maxC === 0 ? 0 : (maxC - minC) / maxC;
    const factor = sat + vib * (1 - s);
    return { r: clamp(gray + (rgb.r - gray) * factor), g: clamp(gray + (rgb.g - gray) * factor), b: clamp(gray + (rgb.b - gray) * factor) };
  };
  const applySaturationLinearLoc = (rgb: RGB, sat: number, vib: number): RGB => {
    const rl = toLin(rgb.r), gl = toLin(rgb.g), bl = toLin(rgb.b);
    const Y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
    const maxL = Math.max(rl, gl, bl);
    const minL = Math.min(rl, gl, bl);
    const s = maxL === 0 ? 0 : (maxL - minL) / maxL;
    const factor = sat + vib * (1 - s);
    const rlin = Y + (rl - Y) * factor;
    const glin = Y + (gl - Y) * factor;
    const blin = Y + (bl - Y) * factor;
    return { r: clamp(toSRGB(rlin)), g: clamp(toSRGB(glin)), b: clamp(toSRGB(blin)) };
  };
  const applyHueLoc = (rgb: RGB): RGB => {
    if (hue === 0) return rgb;
    const angle = (hue * Math.PI) / 180;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const m = [
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
    return {
      r: clamp(rgb.r * m[0] + rgb.g * m[1] + rgb.b * m[2]),
      g: clamp(rgb.r * m[3] + rgb.g * m[4] + rgb.b * m[5]),
      b: clamp(rgb.r * m[6] + rgb.g * m[7] + rgb.b * m[8]),
    };
  };
  const smoothstep = (edge0: number, edge1: number, x: number): number => {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  };
  const applyWhitesLoc = (rgb: RGB): RGB => {
    if (whites === 0) return rgb;
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    const weight = smoothstep(0.4, 0.8, luminance);
    const adjustment = whites * weight;
    return { r: clamp(rgb.r + adjustment), g: clamp(rgb.g + adjustment), b: clamp(rgb.b + adjustment) };
  };
  const applyBlacksLoc = (rgb: RGB): RGB => {
    if (blacks === 0) return rgb;
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    const weight = smoothstep(0.8, 0.2, luminance);
    const adjustment = blacks * weight;
    return { r: clamp(rgb.r + adjustment), g: clamp(rgb.g + adjustment), b: clamp(rgb.b + adjustment) };
  };

  const simulateUpToIndex = (targetIndex: number): RGB => {
    let color = originalRGB;
    for (let i = 0; i < targetIndex; i++) {
      const t = transformOrder[i];
      if (t === 'brightness') color = applyBrightnessLoc(color);
      else if (t === 'contrast') color = applyContrastLoc(color);
      else if (t === 'saturation') color = linearSaturation ? applySaturationLinearLoc(color, saturation, vibrance) : applySaturationLoc(color, saturation, vibrance);
      else if (t === 'vibrance') color = linearSaturation ? applySaturationLinearLoc(color, 1, vibrance) : applySaturationLoc(color, 1, vibrance);
      else if (t === 'hue') color = applyHueLoc(color);
      else if (t === 'whites') color = applyWhitesLoc(color);
      else if (t === 'blacks') color = applyBlacksLoc(color);
    }
    return color;
  };


  // Position inspector near cursor, avoiding edges
  const offsetX = 20;
  const offsetY = 20;
  const inspectorWidth = 320;
  const inspectorHeight = 500;
  
  const left = cursorX + offsetX + inspectorWidth > window.innerWidth 
    ? cursorX - inspectorWidth - offsetX 
    : cursorX + offsetX;
  
  const top = cursorY + offsetY + inspectorHeight > window.innerHeight
    ? cursorY - inspectorHeight - offsetY
    : cursorY + offsetY;

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{ left: `${left}px`, top: `${top}px` }}
    >
      <div className="flex gap-3 items-start">
      <Card className="w-80 shadow-lg border-primary/20">
        <CardContent className="p-4 space-y-3">
          {/* Header */}
          <div className="border-b border-border pb-2">
            <h4 className="text-sm font-semibold text-primary">Pixel Inspector</h4>
            <p className="text-xs text-muted-foreground">Position: ({x}, {y})</p>
          </div>

          {/* Original Color */}
          <div className="space-y-1">
            <div className="text-xs font-medium text-foreground">Original RGB</div>
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded border border-border"
                style={{ backgroundColor: rgbToHex(originalRGB.r, originalRGB.g, originalRGB.b) }}
              />
              <div className="text-xs font-mono text-muted-foreground">
                {formatRGB(originalRGB)}
              </div>
            </div>
          </div>

          {/* Step-by-step transformations - DYNAMIC */}
          <div className="space-y-2 border-t border-border pt-2">
            <div className="text-xs font-medium text-foreground">Transformation Steps</div>
            {Array.isArray(steps) && steps.length > 0 ? (
              <div className="space-y-1">
                {steps.map((s, idx) => (
                  <div key={s.id} className="space-y-1">
                    <div className="text-xs text-primary cursor-pointer" onClick={() => onSelectInstance?.(s.id)}>
                      {idx + 1}. {getTransformLabel(s.kind as TransformationType)}
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded border border-border"
                        style={{ backgroundColor: rgbToHex(s.outputRGB.r, s.outputRGB.g, s.outputRGB.b) }}
                      />
                      <div className="text-xs font-mono text-muted-foreground">
                        {formatRGB(s.outputRGB)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              transformOrder.map((transformType, index) => {
              if (!shouldShowStep(transformType)) return null;
              const stepRGB = stepByStep[transformType];
              return (
                <div key={transformType} className="space-y-1">
                  <div className="text-xs text-primary">
                    {index + 1}. {getTransformLabel(transformType)} ({getTransformValue(transformType)})
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded border border-border"
                      style={{ backgroundColor: rgbToHex(stepRGB.r, stepRGB.g, stepRGB.b) }}
                    />
                    <div className="text-xs font-mono text-muted-foreground">
                      {formatRGB(stepRGB)}
                    </div>
                  </div>
                </div>
              );
              })
            )}
          </div>

          {/* Final Transformed Color */}
          <div className="space-y-1 border-t border-border pt-2">
            <div className="text-xs font-medium text-foreground">
              Final Transformed RGB
              <span className="text-muted-foreground ml-1">
                (After Step {Array.isArray(steps) && steps.length > 0 ? steps.length : (transformOrder.filter((t) => shouldShowStep(t)).length || transformOrder.length)})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded border border-border"
                style={{ backgroundColor: rgbToHex(transformedRGB.r, transformedRGB.g, transformedRGB.b) }}
              />
              <div className="text-xs font-mono text-muted-foreground">
                {formatRGB(transformedRGB)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
        {activeConv && (
          <Card className="shadow-lg border-primary/20">
            <CardContent className="p-3 space-y-2">
              <div className="text-[10px] text-muted-foreground">Padding: {activeConv.padding}</div>
              {/* Neighborhood pixels under the kernel */}
              {convWindow && (
                <div className="mt-1 space-y-1">
                  <div className="text-xs font-semibold text-primary">Neighborhood</div>
                  <div className="inline-grid" style={{ gridTemplateColumns: `repeat(${convWindow.size}, minmax(0, 1fr))`, gap: '2px' }}>
                    {convWindow.pixels.flatMap((row, ri) => row.map((pix, ci) => {
                      const hex = `#${[pix.r, pix.g, pix.b].map(v => Math.round(v).toString(16).padStart(2,'0')).join('')}`;
                      return <div key={`${ri}-${ci}`} className="w-4 h-4 rounded border border-border" style={{ backgroundColor: hex }} />;
                    }))}
                  </div>
                </div>
              )}
              {/* Resulting pixel from the active convolution step */}
              {Array.isArray(steps) && steps.length > 0 && (() => {
                const convKinds = new Set(['blur','sharpen','edge','denoise']);
                const convStep = [...steps].reverse().find(s => convKinds.has(s.kind as any));
                if (!convStep) return null;
                const rgb = convStep.outputRGB;
                const rgbHex = `#${[rgb.r, rgb.g, rgb.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
                return (
                  <div className="mt-2 space-y-1">
                    <div className="text-xs font-semibold text-primary">Result</div>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded border border-border" style={{ backgroundColor: rgbHex }} />
                      <div className="text-xs font-mono text-muted-foreground">({Math.round(rgb.r)}, {Math.round(rgb.g)}, {Math.round(rgb.b)})</div>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
