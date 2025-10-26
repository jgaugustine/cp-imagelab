import { Card, CardContent } from "@/components/ui/card";

interface PixelInspectorProps {
  x: number;
  y: number;
  originalRGB: { r: number; g: number; b: number };
  transformedRGB: { r: number; g: number; b: number };
  stepByStep: {
    afterBrightness: { r: number; g: number; b: number };
    afterContrast: { r: number; g: number; b: number };
    afterSaturation: { r: number; g: number; b: number };
    afterHue: { r: number; g: number; b: number };
  };
  brightness: number;
  contrast: number;
  saturation: number;
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
  brightness,
  contrast,
  saturation,
  hue,
  cursorX,
  cursorY,
}: PixelInspectorProps) {
  const rgbToHex = (r: number, g: number, b: number) => {
    return `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  };

  const formatRGB = (rgb: { r: number; g: number; b: number }) => {
    return `(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)})`;
  };

  // Position inspector near cursor, avoiding edges
  const offsetX = 20;
  const offsetY = 20;
  const inspectorWidth = 320;
  const inspectorHeight = 400;
  
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

          {/* Step-by-step transformations */}
          <div className="space-y-2 border-t border-border pt-2">
            <div className="text-xs font-medium text-foreground">Transformation Steps</div>
            
            {brightness !== 0 && (
              <div className="space-y-1">
                <div className="text-xs text-primary">1. Brightness (+{brightness})</div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded border border-border"
                    style={{ backgroundColor: rgbToHex(stepByStep.afterBrightness.r, stepByStep.afterBrightness.g, stepByStep.afterBrightness.b) }}
                  />
                  <div className="text-xs font-mono text-muted-foreground">
                    {formatRGB(stepByStep.afterBrightness)}
                  </div>
                </div>
              </div>
            )}

            {contrast !== 1 && (
              <div className="space-y-1">
                <div className="text-xs text-primary">2. Contrast (×{contrast.toFixed(2)})</div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded border border-border"
                    style={{ backgroundColor: rgbToHex(stepByStep.afterContrast.r, stepByStep.afterContrast.g, stepByStep.afterContrast.b) }}
                  />
                  <div className="text-xs font-mono text-muted-foreground">
                    {formatRGB(stepByStep.afterContrast)}
                  </div>
                </div>
              </div>
            )}

            {saturation !== 1 && (
              <div className="space-y-1">
                <div className="text-xs text-primary">3. Saturation (×{saturation.toFixed(2)})</div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded border border-border"
                    style={{ backgroundColor: rgbToHex(stepByStep.afterSaturation.r, stepByStep.afterSaturation.g, stepByStep.afterSaturation.b) }}
                  />
                  <div className="text-xs font-mono text-muted-foreground">
                    {formatRGB(stepByStep.afterSaturation)}
                  </div>
                </div>
              </div>
            )}

            {hue !== 0 && (
              <div className="space-y-1">
                <div className="text-xs text-primary">4. Hue Rotation ({hue}°)</div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded border border-border"
                    style={{ backgroundColor: rgbToHex(stepByStep.afterHue.r, stepByStep.afterHue.g, stepByStep.afterHue.b) }}
                  />
                  <div className="text-xs font-mono text-muted-foreground">
                    {formatRGB(stepByStep.afterHue)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Final Transformed Color */}
          <div className="space-y-1 border-t border-border pt-2">
            <div className="text-xs font-medium text-foreground">Final Transformed RGB</div>
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
