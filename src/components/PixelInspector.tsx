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
