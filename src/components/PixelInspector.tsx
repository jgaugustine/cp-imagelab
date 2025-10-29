import { Card, CardContent } from "@/components/ui/card";
import { TransformationType, RGB } from "@/types/transformations";

interface PixelInspectorProps {
  x: number;
  y: number;
  originalRGB: RGB;
  transformedRGB: RGB;
  stepByStep: Record<TransformationType, RGB>;
  transformOrder: TransformationType[];
  brightness: number;
  contrast: number;
  saturation: number;
  vibrance: number;
  hue: number;
  cursorX: number;
  cursorY: number;
  linearSaturation?: boolean;
}

export function PixelInspector({
  x,
  y,
  originalRGB,
  transformedRGB,
  stepByStep,
  transformOrder,
  brightness,
  contrast,
  saturation,
  vibrance,
  hue,
  cursorX,
  cursorY,
  linearSaturation = false,
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
      hue: 'Hue'
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
  const applySaturationGammaLoc = (rgb: RGB, sat: number, vib: number): RGB => {
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

  const simulateUpToIndex = (targetIndex: number): RGB => {
    let color = originalRGB;
    for (let i = 0; i < targetIndex; i++) {
      const t = transformOrder[i];
      if (t === 'brightness') color = applyBrightnessLoc(color);
      else if (t === 'contrast') color = applyContrastLoc(color);
      else if (t === 'saturation') color = linearSaturation ? applySaturationLinearLoc(color, saturation, vibrance) : applySaturationGammaLoc(color, saturation, vibrance);
      else if (t === 'vibrance') color = linearSaturation ? applySaturationLinearLoc(color, 1, vibrance) : applySaturationGammaLoc(color, 1, vibrance);
      else if (t === 'hue') color = applyHueLoc(color);
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
      <Card className="w-80 shadow-lg border-primary/20">
        <CardContent className="p-4 space-y-3">
          {/* Header */}
          <div className="border-b border-border pb-2">
            <h4 className="text-sm font-semibold text-primary">Pixel Inspector</h4>
            <p className="text-xs text-muted-foreground">Position: ({x}, {y})</p>
          </div>

          {/* Pipeline Order Indicator */}
          <div className="space-y-1 text-xs border-b border-border pb-2">
            <div className="text-muted-foreground">Pipeline Order:</div>
            <div className="flex items-center gap-1 text-primary font-mono flex-wrap">
              {transformOrder.map((type, idx) => (
                <span key={type}>
                  {getTransformLabel(type)}
                  {idx < transformOrder.length - 1 && ' → '}
                </span>
              ))}
            </div>
          </div>

          {/* Original Color */}
          <div className="space-y-1">
            <div className="text-xs font-medium text-foreground">Original RGB</div>
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded border border-border"
                style={{ backgroundColor: rgbToHex(originalRGB.r, originalRGB.g, originalRGB.b) }}
              />
              <div className="text-xs font-mono text-muted-foreground">
                {formatRGB(originalRGB)}
              </div>
            </div>
            <div className="text-xs font-mono text-muted-foreground">
              {rgbToHex(originalRGB.r, originalRGB.g, originalRGB.b)}
            </div>
          </div>

          {/* Step-by-step transformations - DYNAMIC */}
          <div className="space-y-2 border-t border-border pt-2">
            <div className="text-xs font-medium text-foreground">Transformation Steps</div>
            
            {transformOrder.map((transformType, index) => {
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
                  {/* Gray/Y readout intentionally omitted per requirements */}
                </div>
              );
            })}
          </div>

          {/* Final Transformed Color */}
          <div className="space-y-1 border-t border-border pt-2">
            <div className="text-xs font-medium text-foreground">
              Final Transformed RGB
              <span className="text-muted-foreground ml-1">
                (After Step {transformOrder.filter((t, idx) => shouldShowStep(t)).length || transformOrder.length})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded border border-border"
                style={{ backgroundColor: rgbToHex(transformedRGB.r, transformedRGB.g, transformedRGB.b) }}
              />
              <div className="text-xs font-mono text-muted-foreground">
                {formatRGB(transformedRGB)}
              </div>
            </div>
            <div className="text-xs font-mono text-muted-foreground">
              {rgbToHex(transformedRGB.r, transformedRGB.g, transformedRGB.b)}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
