import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MathExplanationProps {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
}

export function MathExplanation({ brightness, contrast, saturation, hue }: MathExplanationProps) {
  return (
    <Card className="p-6 border-border bg-card h-fit">
      <h2 className="text-xl font-semibold text-primary mb-4">Mathematical Transformations</h2>
      
      <Tabs defaultValue="brightness" className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4">
          <TabsTrigger value="brightness">Brightness</TabsTrigger>
          <TabsTrigger value="contrast">Contrast</TabsTrigger>
          <TabsTrigger value="saturation">Saturation</TabsTrigger>
          <TabsTrigger value="hue">Hue</TabsTrigger>
        </TabsList>

        <TabsContent value="brightness" className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Matrix Addition</h3>
            <p className="text-sm text-muted-foreground">
              Brightness adjustment is a simple matrix addition operation applied uniformly to all RGB channels.
            </p>
          </div>
          
          <div className="bg-muted p-4 rounded-lg font-mono text-sm">
            <div className="text-foreground">Original RGB Vector:</div>
            <div className="text-primary mt-2">
              [R, G, B] = [{Math.round(128)}, {Math.round(128)}, {Math.round(128)}]
            </div>
            
            <div className="text-foreground mt-4">Add Brightness Value:</div>
            <div className="text-primary mt-2">
              + [{brightness}, {brightness}, {brightness}]
            </div>
            
            <div className="text-foreground mt-4">Result:</div>
            <div className="text-secondary mt-2">
              = [{Math.max(0, Math.min(255, 128 + brightness))}, {Math.max(0, Math.min(255, 128 + brightness))}, {Math.max(0, Math.min(255, 128 + brightness))}]
            </div>
          </div>

          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-muted-foreground">
              For every pixel (r, g, b):
            </div>
            <div className="text-primary font-mono mt-2">
              r' = r + {brightness}<br/>
              g' = g + {brightness}<br/>
              b' = b + {brightness}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="contrast" className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Scalar Multiplication</h3>
            <p className="text-sm text-muted-foreground">
              Contrast is achieved by scaling each color channel around the midpoint (128).
            </p>
          </div>
          
          <div className="bg-muted p-4 rounded-lg font-mono text-sm">
            <div className="text-foreground">Original RGB Vector:</div>
            <div className="text-primary mt-2">
              [R, G, B] = [180, 140, 100]
            </div>
            
            <div className="text-foreground mt-4">Subtract midpoint (128):</div>
            <div className="text-primary mt-2">
              = [52, 12, -28]
            </div>
            
            <div className="text-foreground mt-4">Multiply by contrast ({contrast.toFixed(2)}):</div>
            <div className="text-primary mt-2">
              × {contrast.toFixed(2)} = [{(52 * contrast).toFixed(1)}, {(12 * contrast).toFixed(1)}, {(-28 * contrast).toFixed(1)}]
            </div>
            
            <div className="text-foreground mt-4">Add midpoint back:</div>
            <div className="text-secondary mt-2">
              + 128 = [{Math.max(0, Math.min(255, 52 * contrast + 128)).toFixed(0)}, {Math.max(0, Math.min(255, 12 * contrast + 128)).toFixed(0)}, {Math.max(0, Math.min(255, -28 * contrast + 128)).toFixed(0)}]
            </div>
          </div>

          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-muted-foreground">
              For every pixel (r, g, b):
            </div>
            <div className="text-primary font-mono mt-2">
              r' = (r - 128) × {contrast.toFixed(2)} + 128<br/>
              g' = (g - 128) × {contrast.toFixed(2)} + 128<br/>
              b' = (b - 128) × {contrast.toFixed(2)} + 128
            </div>
          </div>
        </TabsContent>

        <TabsContent value="saturation" className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Color Space Transformation</h3>
            <p className="text-sm text-muted-foreground">
              Saturation adjusts color intensity by interpolating between the pixel color and its grayscale value.
            </p>
          </div>
          
          <div className="bg-muted p-4 rounded-lg font-mono text-sm">
            <div className="text-foreground">Original RGB Vector:</div>
            <div className="text-primary mt-2">
              [R, G, B] = [200, 150, 100]
            </div>
            
            <div className="text-foreground mt-4">Calculate Luminance (weighted average):</div>
            <div className="text-primary mt-2">
              Gray = 0.299×R + 0.587×G + 0.114×B<br/>
              = 0.299×200 + 0.587×150 + 0.114×100<br/>
              = {(0.299 * 200 + 0.587 * 150 + 0.114 * 100).toFixed(1)}
            </div>
            
            <div className="text-foreground mt-4">Interpolate with saturation ({saturation.toFixed(2)}):</div>
            <div className="text-secondary mt-2">
              R' = Gray + (R - Gray) × {saturation.toFixed(2)}<br/>
              G' = Gray + (G - Gray) × {saturation.toFixed(2)}<br/>
              B' = Gray + (B - Gray) × {saturation.toFixed(2)}
            </div>
          </div>

          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-muted-foreground">
              Matrix form (weighted desaturation):
            </div>
            <div className="text-primary font-mono mt-2 text-xs">
              [R']   [0.299  0.587  0.114]   [R]<br/>
              [G'] = [0.299  0.587  0.114] × [G]<br/>
              [B']   [0.299  0.587  0.114]   [B]
            </div>
          </div>
        </TabsContent>

        <TabsContent value="hue" className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Rotation Matrix</h3>
            <p className="text-sm text-muted-foreground">
              Hue rotation is a 3D rotation in RGB color space around the gray axis.
            </p>
          </div>
          
          <div className="bg-muted p-4 rounded-lg font-mono text-sm overflow-x-auto">
            <div className="text-foreground">Rotation angle: {hue}° = {(hue * Math.PI / 180).toFixed(3)} radians</div>
            
            <div className="text-foreground mt-4">3×3 Rotation Matrix:</div>
            <div className="text-primary mt-2 text-xs">
              {(() => {
                const angle = (hue * Math.PI) / 180;
                const cosA = Math.cos(angle);
                const sinA = Math.sin(angle);
                const a = cosA + (1 - cosA) / 3;
                const b = 1/3 * (1 - cosA) - Math.sqrt(1/3) * sinA;
                const c = 1/3 * (1 - cosA) + Math.sqrt(1/3) * sinA;
                return `[${a.toFixed(3)}  ${b.toFixed(3)}  ${c.toFixed(3)}]\n[${c.toFixed(3)}  ${a.toFixed(3)}  ${b.toFixed(3)}]\n[${b.toFixed(3)}  ${c.toFixed(3)}  ${a.toFixed(3)}]`;
              })()}
            </div>
          </div>

          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-muted-foreground">
              Matrix multiplication:
            </div>
            <div className="text-primary font-mono mt-2 text-xs">
              [R']   [rotation matrix]   [R]<br/>
              [G'] = [   3 × 3      ] × [G]<br/>
              [B']   [              ]   [B]
            </div>
            <div className="text-muted-foreground mt-3 text-xs">
              This preserves luminance while rotating colors around the color wheel.
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
