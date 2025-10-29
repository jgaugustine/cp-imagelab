import { Card } from "@/components/ui/card";
import RGBCubeVisualizer from "@/components/RGBCubeVisualizer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface MathExplanationProps {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  vibrance?: number;
  linearSaturation?: boolean;
  onToggleLinearSaturation?: (checked: boolean) => void;
  selectedRGB?: { r: number; g: number; b: number };
}

export function MathExplanation({ brightness, contrast, saturation, hue, vibrance = 0, linearSaturation = false, onToggleLinearSaturation, selectedRGB }: MathExplanationProps) {
  return (
    <Card className="p-6 border-border bg-card h-fit">
      <h2 className="text-xl font-semibold text-primary mb-4">Mathematical Transformations</h2>
      
      <Tabs defaultValue="brightness" className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:grid-cols-5">
          <TabsTrigger value="brightness">Brightness</TabsTrigger>
          <TabsTrigger value="contrast">Contrast</TabsTrigger>
          <TabsTrigger value="saturation">Saturation</TabsTrigger>
          <TabsTrigger value="vibrance">Vibrance</TabsTrigger>
          <TabsTrigger value="hue">Hue</TabsTrigger>
        </TabsList>

        <TabsContent value="brightness" className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Matrix Addition</h3>
            <p className="text-sm text-muted-foreground">
              Brightness adjustment is a simple matrix addition operation applied uniformly to all RGB channels.
            </p>
          </div>

          <Card className="p-4 border-border bg-card">
            <h4 className="text-sm font-semibold text-foreground mb-2">RGB Cube: Brightness (addition)</h4>
            <RGBCubeVisualizer mode="brightness" params={{ brightness }} selectedRGB={selectedRGB} />
          </Card>
          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">Geometric intuition</div>
            <div className="text-muted-foreground mt-2 text-xs">
              Translation along the gray diagonal (R=G=B): the point moves parallel to the gray axis by the same
              amount in each channel, so hue and chroma stay the same while position shifts.
            </div>
          </div>
          
          <div className="bg-muted p-4 rounded-lg font-mono text-sm">
            <div className="text-foreground">Original RGB Vector:</div>
            <div className="text-primary mt-2">
              {(() => {
                const R = selectedRGB?.r ?? 200;
                const G = selectedRGB?.g ?? 150;
                const B = selectedRGB?.b ?? 100;
                return `[R, G, B] = [${Math.round(R)}, ${Math.round(G)}, ${Math.round(B)}]`;
              })()}
            </div>
            
            <div className="text-foreground mt-4">Add Brightness Value:</div>
            <div className="text-primary mt-2">
              + [{brightness}, {brightness}, {brightness}]
            </div>
            
            <div className="text-foreground mt-4">Result:</div>
            <div className="text-secondary mt-2">
              {(() => {
                const R = selectedRGB?.r ?? 200;
                const G = selectedRGB?.g ?? 150;
                const B = selectedRGB?.b ?? 100;
                const Rp = Math.max(0, Math.min(255, R + brightness));
                const Gp = Math.max(0, Math.min(255, G + brightness));
                const Bp = Math.max(0, Math.min(255, B + brightness));
                return `= [${Rp.toFixed(0)}, ${Gp.toFixed(0)}, ${Bp.toFixed(0)}]`;
              })()}
            </div>
          </div>

          <div className="bg-muted p-4 rounded-lg font-mono text-sm">
            <div className="text-foreground">Projection onto gray axis</div>
            <div className="text-primary mt-2 text-xs">
              {(() => {
                const R = selectedRGB?.r ?? 200, G = selectedRGB?.g ?? 150, B = selectedRGB?.b ?? 100;
                const linear = !!linearSaturation;
                const toLin = (c: number) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
                const Rm = linear ? toLin(R) : R;
                const Gm = linear ? toLin(G) : G;
                const Bm = linear ? toLin(B) : B;
                const wR = linear ? 0.2126 : 0.299; const wG = linear ? 0.7152 : 0.587; const wB = linear ? 0.0722 : 0.114;
                const Gray = wR * R + wG * G + wB * B;
                const dR = R - Gray, dG = G - Gray, dB = B - Gray;
                const dist = Math.sqrt(dR*dR + dG*dG + dB*dB);
                return (
                  <>
                    <div>Gray point: [{Gray.toFixed(2)}, {Gray.toFixed(2)}, {Gray.toFixed(2)}]</div>
                    <div>Chroma vector: [R−Gray, G−Gray, B−Gray] = [{dR.toFixed(2)}, {dG.toFixed(2)}, {dB.toFixed(2)}]</div>
                    <div>Distance to gray axis: ||x − Gray·1||₂ ≈ {dist.toFixed(2)}</div>
                  </>
                );
              })()}
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
          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">What this means</div>
            <div className="text-muted-foreground mt-2 text-xs">
              Brightness simply shifts all three channels by the same amount. Think of moving a point in the RGB cube
              straight along the gray diagonal. Results are clamped to [0,255] so values don’t wrap.
            </div>
          </div>
        </TabsContent>

        <TabsContent value="vibrance" className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Adaptive Chroma Adjustment</h3>
            <p className="text-sm text-muted-foreground">
              Vibrance adjusts saturation adaptively: positive values boost low‑chroma pixels more than high‑chroma ones; negative values reduce low‑chroma pixels more gently, preserving skin tones and avoiding clipping.
            </p>
          </div>

          <Card className="p-4 border-border bg-card">
            <h4 className="text-sm font-semibold text-foreground mb-2">RGB Cube: Vibrance (adaptive stretch from gray)</h4>
            <RGBCubeVisualizer mode="vibrance" params={{ vibrance, linearSaturation }} selectedRGB={selectedRGB} />
          </Card>
          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">Geometric intuition</div>
            <div className="text-muted-foreground mt-2 text-xs">
              Adaptive radial move from the gray axis (R=G=B): near-axis points move farther, far points move less. This
              tapers the push as colors get more vivid to avoid clipping and hue shifts.
            </div>
          </div>

          <div className="bg-muted p-4 rounded-lg font-mono text-sm">
            <div className="text-foreground">Per-pixel factor:</div>
            <div className="text-primary mt-2">
              factor = 1 + V × (1 − s)
            </div>
            <div className="text-muted-foreground mt-2 text-xs">
              where s ≈ (max(R,G,B) − min(R,G,B)) / max(R,G,B) and V is vibrance (can be negative to desaturate adaptively).
            </div>

            <div className="text-foreground mt-4">Interpolation:</div>
            <div className="text-secondary mt-2">
              R' = Gray + (R − Gray) × factor<br/>
              G' = Gray + (G − Gray) × factor<br/>
              B' = Gray + (B − Gray) × factor
            </div>
            <div className="text-muted-foreground mt-3 text-xs">
              s is clamped to [0,1]. The same neutral Gray definition as Saturation is used.
            </div>

            <div className="text-foreground mt-4">Adaptive matrix for current settings:</div>
            <div className="text-primary mt-2 text-xs">
              {(() => {
                const R = selectedRGB?.r ?? 200, G = selectedRGB?.g ?? 150, B = selectedRGB?.b ?? 100;
                const toLin = (c: number) => {
                  const x = c / 255;
                  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
                };
                const Rm = linearSaturation ? toLin(R) : R;
                const Gm = linearSaturation ? toLin(G) : G;
                const Bm = linearSaturation ? toLin(B) : B;
                const maxC = Math.max(Rm, Gm, Bm);
                const minC = Math.min(Rm, Gm, Bm);
                const sEst = maxC === 0 ? 0 : (maxC - minC) / maxC;
                const f = 1 + (vibrance ?? 0) * (1 - sEst);
                const wR = linearSaturation ? 0.2126 : 0.299;
                const wG = linearSaturation ? 0.7152 : 0.587;
                const wB = linearSaturation ? 0.0722 : 0.114;
                const a = (f + wR * (1 - f)).toFixed(3);
                const b = (f + wG * (1 - f)).toFixed(3);
                const c = (f + wB * (1 - f)).toFixed(3);
                const d = (wR * (1 - f)).toFixed(3);
                const e = (wG * (1 - f)).toFixed(3);
                const h = (wB * (1 - f)).toFixed(3);
                return (
                  <>
                    <div>Example [R,G,B] = [{Math.round(R)}, {Math.round(G)}, {Math.round(B)}], s ≈ {(sEst).toFixed(3)}, factor ≈ {f.toFixed(3)}</div>
                    <div className="mt-2">[R', G', B']ᵀ = [</div>
                    <div className="pl-4">[{a}  {e}  {h}]</div>
                    <div className="pl-4">[{d}  {b}  {h}] × [R, G, B]ᵀ</div>
                    <div className="pl-4">[{d}  {e}  {c}]</div>
                    <div>]</div>
                  </>
                );
              })()}
            </div>

            <div className="text-foreground mt-4">Numeric example result:</div>
            <div className="text-primary mt-2 text-xs">
              {(() => {
                const R = selectedRGB?.r ?? 200, G = selectedRGB?.g ?? 150, B = selectedRGB?.b ?? 100;
                const toLin = (c: number) => {
                  const x = c / 255;
                  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
                };
                const Rm = linearSaturation ? toLin(R) : R;
                const Gm = linearSaturation ? toLin(G) : G;
                const Bm = linearSaturation ? toLin(B) : B;
                const maxC = Math.max(Rm, Gm, Bm);
                const minC = Math.min(Rm, Gm, Bm);
                const sEst = maxC === 0 ? 0 : (maxC - minC) / maxC;
                const f = 1 + (vibrance ?? 0) * (1 - sEst);
                const wR = linearSaturation ? 0.2126 : 0.299;
                const wG = linearSaturation ? 0.7152 : 0.587;
                const wB = linearSaturation ? 0.0722 : 0.114;
                const gray = wR * R + wG * G + wB * B;
                const Rp = Math.max(0, Math.min(255, gray + (R - gray) * f));
                const Gp = Math.max(0, Math.min(255, gray + (G - gray) * f));
                const Bp = Math.max(0, Math.min(255, gray + (B - gray) * f));
                return (
                  <>
                    <div>Gray = {wR.toFixed(4)}×{Math.round(R)} + {wG.toFixed(4)}×{Math.round(G)} + {wB.toFixed(4)}×{Math.round(B)} = {gray.toFixed(3)}</div>
                    <div className="mt-2">R' = {gray.toFixed(3)} + ({Math.round(R)} − {gray.toFixed(3)}) × {f.toFixed(3)} = {Rp.toFixed(3)}</div>
                    <div>G' = {gray.toFixed(3)} + ({Math.round(G)} − {gray.toFixed(3)}) × {f.toFixed(3)} = {Gp.toFixed(3)}</div>
                    <div>B' = {gray.toFixed(3)} + ({Math.round(B)} − {gray.toFixed(3)}) × {f.toFixed(3)} = {Bp.toFixed(3)}</div>
                  </>
                );
              })()}
            </div>
          </div>

          <div className="bg-muted p-4 rounded-lg font-mono text-sm">
            <div className="text-foreground">Projection onto gray axis</div>
            <div className="text-primary mt-2 text-xs">
              {(() => {
                const R = selectedRGB?.r ?? 200, G = selectedRGB?.g ?? 150, B = selectedRGB?.b ?? 100;
                const linear = !!linearSaturation;
                const toLin = (c: number) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
                const Rm = linear ? toLin(R) : R;
                const Gm = linear ? toLin(G) : G;
                const Bm = linear ? toLin(B) : B;
                const wR = linear ? 0.2126 : 0.299; const wG = linear ? 0.7152 : 0.587; const wB = linear ? 0.0722 : 0.114;
                const Gray = wR * R + wG * G + wB * B;
                const dR = R - Gray, dG = G - Gray, dB = B - Gray;
                const dist = Math.sqrt(dR*dR + dG*dG + dB*dB);
                return (
                  <>
                    <div>Gray point: [{Gray.toFixed(2)}, {Gray.toFixed(2)}, {Gray.toFixed(2)}]</div>
                    <div>Chroma vector: [R−Gray, G−Gray, B−Gray] = [{dR.toFixed(2)}, {dG.toFixed(2)}, {dB.toFixed(2)}]</div>
                    <div>Distance to gray axis: ||x − Gray·1||₂ ≈ {dist.toFixed(2)}</div>
                  </>
                );
              })()}
            </div>
          </div>
          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">What this means</div>
            <div className="text-muted-foreground mt-2 text-xs">
              Vibrance pushes dull colors more than already vivid ones. It helps avoid over-saturating skin tones and
              keeps highlights from clipping. Using linear-light weights better preserves perceived lightness.
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

          <Card className="p-4 border-border bg-card">
            <h4 className="text-sm font-semibold text-foreground mb-2">RGB Cube: Contrast (scale around midpoint)</h4>
            <RGBCubeVisualizer mode="contrast" params={{ contrast }} selectedRGB={selectedRGB} />
          </Card>
          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">Geometric intuition</div>
            <div className="text-muted-foreground mt-2 text-xs">
              Scaling about the midpoint (128,128,128): vectors from the midpoint are stretched or compressed. Direction
              from the midpoint is preserved; only distance changes.
            </div>
          </div>
          
          <div className="bg-muted p-4 rounded-lg font-mono text-sm">
            <div className="text-foreground">Original RGB Vector:</div>
            <div className="text-primary mt-2">
              {(() => {
                const R = selectedRGB?.r ?? 200;
                const G = selectedRGB?.g ?? 150;
                const B = selectedRGB?.b ?? 100;
                return `[R, G, B] = [${Math.round(R)}, ${Math.round(G)}, ${Math.round(B)}]`;
              })()}
            </div>
            
            <div className="text-foreground mt-4">Subtract midpoint (128):</div>
            <div className="text-primary mt-2">
              {(() => {
                const R = selectedRGB?.r ?? 200;
                const G = selectedRGB?.g ?? 150;
                const B = selectedRGB?.b ?? 100;
                return `= [${(R - 128).toFixed(0)}, ${(G - 128).toFixed(0)}, ${(B - 128).toFixed(0)}]`;
              })()}
            </div>
            
            <div className="text-foreground mt-4">Multiply by contrast ({contrast.toFixed(2)}):</div>
            <div className="text-primary mt-2">
              {(() => {
                const R = selectedRGB?.r ?? 200;
                const G = selectedRGB?.g ?? 150;
                const B = selectedRGB?.b ?? 100;
                return `× ${contrast.toFixed(2)} = [${((R - 128) * contrast).toFixed(1)}, ${((G - 128) * contrast).toFixed(1)}, ${((B - 128) * contrast).toFixed(1)}]`;
              })()}
            </div>
            
            <div className="text-foreground mt-4">Add midpoint back:</div>
            <div className="text-secondary mt-2">
              {(() => {
                const R = selectedRGB?.r ?? 200;
                const G = selectedRGB?.g ?? 150;
                const B = selectedRGB?.b ?? 100;
                const Rp = Math.max(0, Math.min(255, (R - 128) * contrast + 128));
                const Gp = Math.max(0, Math.min(255, (G - 128) * contrast + 128));
                const Bp = Math.max(0, Math.min(255, (B - 128) * contrast + 128));
                return `+ 128 = [${Rp.toFixed(0)}, ${Gp.toFixed(0)}, ${Bp.toFixed(0)}]`;
              })()}
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
            <div className="text-muted-foreground mt-3 text-xs">
              If values are normalized to 0–1, replace 128 with 0.5 instead.
            </div>
          </div>
          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">What this means</div>
            <div className="text-muted-foreground mt-2 text-xs">
              Contrast stretches distances from mid-gray (128). Values above 128 move up; values below move down.
              In linear-light, this behaves like a true dynamic‑range change; in sRGB it’s a display‑referred tweak.
            </div>
          </div>
          
        </TabsContent>

        <TabsContent value="saturation" className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Color Space Transformation</h3>
            <p className="text-sm text-muted-foreground">
              Saturation adjusts color intensity by interpolating between the pixel color and a neutral gray for that pixel.
            </p>
          </div>

          <Card className="p-4 border-border bg-card">
            <h4 className="text-sm font-semibold text-foreground mb-2">RGB Cube: Saturation (interpolate to gray)</h4>
            <RGBCubeVisualizer mode="saturation" params={{ saturation, linearSaturation }} selectedRGB={selectedRGB} />
          </Card>
          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">Geometric intuition</div>
            <div className="text-muted-foreground mt-2 text-xs">
              Motion along the line between the pixel and its projection on the gray axis (R=G=B). Uniform radial change
              of chroma: the azimuth (hue angle) around the gray axis stays the same; only the radius (distance to the
              axis) changes.
            </div>
          </div>
          
          <div className="bg-muted p-4 rounded-lg font-mono text-sm">
            <div className="text-foreground">Original RGB Vector:</div>
            <div className="text-primary mt-2">
              {(() => {
                const R = selectedRGB?.r ?? 200;
                const G = selectedRGB?.g ?? 150;
                const B = selectedRGB?.b ?? 100;
                return `[R, G, B] = [${Math.round(R)}, ${Math.round(G)}, ${Math.round(B)}]`;
              })()}
            </div>
            <div className="text-foreground mt-4">Interpolate with saturation ({saturation.toFixed(2)}):</div>
            <div className="text-secondary mt-2">
              R' = Gray + (R - Gray) × saturation<br/>
              G' = Gray + (G - Gray) × saturation<br/>
              B' = Gray + (B - Gray) × saturation
            </div>
          </div>

          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-muted-foreground mb-2">Computation space</div>
            <div className="flex items-center gap-2 text-sm">
              <input
                id="linear-sat-toggle"
                type="checkbox"
                checked={!!linearSaturation}
                onChange={(e) => onToggleLinearSaturation?.(e.target.checked)}
              />
              <label htmlFor="linear-sat-toggle" className="text-foreground">
                Compute saturation in linear color space
              </label>
            </div>
            <div className="text-muted-foreground mt-2 text-xs">
              This changes how Gray is derived under the hood without altering the formula above.
            </div>
            <div className="text-muted-foreground mt-1 text-xs">
              Affects Saturation and Vibrance only; Brightness, Contrast, and Hue use sRGB.
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-muted p-4 rounded-lg text-sm">
              <div className="text-foreground font-semibold">sRGB space (gamma-encoded)</div>
              <div className="text-primary font-mono mt-2 text-xs">
                {(() => {
                  const R = selectedRGB?.r ?? 200, G = selectedRGB?.g ?? 150, B = selectedRGB?.b ?? 100;
                  const wR = 0.299, wG = 0.587, wB = 0.114;
                  const gray = wR * R + wG * G + wB * B;
                  const s = saturation;
                  const Rp = Math.max(0, Math.min(255, gray + (R - gray) * s));
                  const Gp = Math.max(0, Math.min(255, gray + (G - gray) * s));
                  const Bp = Math.max(0, Math.min(255, gray + (B - gray) * s));
                  return (
                    <>
                      <div>Gray = 0.299×{Math.round(R)} + 0.587×{Math.round(G)} + 0.114×{Math.round(B)} = {gray.toFixed(3)}</div>
                      <div className="mt-2">R' = {gray.toFixed(3)} + ({Math.round(R)} − {gray.toFixed(3)}) × {s.toFixed(2)} = {Rp.toFixed(3)}</div>
                      <div>G' = {gray.toFixed(3)} + ({Math.round(G)} − {gray.toFixed(3)}) × {s.toFixed(2)} = {Gp.toFixed(3)}</div>
                      <div>B' = {gray.toFixed(3)} + ({Math.round(B)} − {gray.toFixed(3)}) × {s.toFixed(2)} = {Bp.toFixed(3)}</div>
                    </>
                  );
                })()}
              </div>
            </div>

            <div className="bg-muted p-4 rounded-lg text-sm">
              <div className="text-foreground font-semibold">Linear-light space</div>
              <div className="text-primary font-mono mt-2 text-xs">
                {(() => {
                  const toLin = (c: number) => {
                    const x = c / 255;
                    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
                  };
                  const toSRGB = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
                  const R = selectedRGB?.r ?? 200, G = selectedRGB?.g ?? 150, B = selectedRGB?.b ?? 100;
                  const rl = toLin(R), gl = toLin(G), bl = toLin(B);
                  const wR = 0.2126, wG = 0.7152, wB = 0.0722;
                  const Y = wR * rl + wG * gl + wB * bl;
                  const s = saturation;
                  const rlinP = Y + (rl - Y) * s;
                  const glinP = Y + (gl - Y) * s;
                  const blinP = Y + (bl - Y) * s;
                  const Rp = Math.max(0, Math.min(255, toSRGB(rlinP) * 255));
                  const Gp = Math.max(0, Math.min(255, toSRGB(glinP) * 255));
                  const Bp = Math.max(0, Math.min(255, toSRGB(blinP) * 255));
                  return (
                    <>
                      <div>rₗ = toLinear({Math.round(R)}/255) = {rl.toFixed(6)}</div>
                      <div>gₗ = toLinear({Math.round(G)}/255) = {gl.toFixed(6)}</div>
                      <div>bₗ = toLinear({Math.round(B)}/255) = {bl.toFixed(6)}</div>
                      <div className="mt-2">Y = 0.2126×rₗ + 0.7152×gₗ + 0.0722×bₗ = {Y.toFixed(6)}</div>
                      <div className="mt-2">rₗ' = Y + (rₗ − Y) × {s.toFixed(2)} = {rlinP.toFixed(6)}</div>
                      <div>gₗ' = Y + (gₗ − Y) × {s.toFixed(2)} = {glinP.toFixed(6)}</div>
                      <div>bₗ' = Y + (bₗ − Y) × {s.toFixed(2)} = {blinP.toFixed(6)}</div>
                      <div className="mt-2">R' = toSRGB(rₗ') × 255 = {Rp.toFixed(3)}</div>
                      <div>G' = toSRGB(gₗ') × 255 = {Gp.toFixed(3)}</div>
                      <div>B' = toSRGB(bₗ') × 255 = {Bp.toFixed(3)}</div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-muted-foreground">Matrix form (adapts to slider and color space):</div>
            <div className="text-primary font-mono mt-2 text-xs">
              {(() => {
                const s = saturation;
                const wR = linearSaturation ? 0.2126 : 0.299;
                const wG = linearSaturation ? 0.7152 : 0.587;
                const wB = linearSaturation ? 0.0722 : 0.114;
                const a = (s + wR * (1 - s)).toFixed(3);
                const b = (s + wG * (1 - s)).toFixed(3);
                const c = (s + wB * (1 - s)).toFixed(3);
                const d = (wR * (1 - s)).toFixed(3);
                const e = (wG * (1 - s)).toFixed(3);
                const f = (wB * (1 - s)).toFixed(3);
                return (
                  <>
                    <div>[R', G', B']ᵀ = [</div>
                    <div className="pl-4">[{a}  {e}  {f}]</div>
                    <div className="pl-4">[{d}  {b}  {f}] × [R, G, B]ᵀ</div>
                    <div className="pl-4">[{d}  {e}  {c}]</div>
                    <div>]</div>
                  </>
                );
              })()}
            </div>
          </div>
          
          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">Geometric intuition</div>
            <div className="text-muted-foreground mt-2 text-xs">
              In the RGB cube, the gray axis is the line R=G=B. Saturation moves points along the straight line between a
              pixel and its projection onto that axis. It scales chroma uniformly: same factor for near‑gray and vivid
              colors; only the distance from the axis changes, not the direction around it.
            </div>
          </div>
          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">What this means</div>
            <div className="text-muted-foreground mt-2 text-xs">
              Saturation pulls each pixel toward or away from its own gray version. At 0× you get gray; at 1× you keep
              the original; above 1× colors intensify. Using linear‑light weights helps keep perceived brightness steady.
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
          <Card className="p-4 border-border bg-card">
            <h4 className="text-sm font-semibold text-foreground mb-2">RGB Cube Rotation</h4>
            <RGBCubeVisualizer mode="hue" params={{ hue }} selectedRGB={selectedRGB} />
          </Card>
          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">Geometric intuition</div>
            <div className="text-muted-foreground mt-2 text-xs">
              Rotation around the gray axis (R=G=B): the point keeps the same distance to the axis (radius) while its
              angle changes. Brightness stays fairly constant; only hue shifts.
            </div>
          </div>
          <Card className="p-4 border-border bg-card">
            <h4 className="text-sm font-semibold text-foreground mb-3">What this means</h4>
            <div className="text-xs space-y-2 text-muted-foreground">
              <div>
                Hue rotation spins colors around the gray axis (where R=G=B). Brightness stays about the same; only the
                hue changes. Imagine rotating a point around the center line of the RGB cube.
              </div>
              <div>
                Small angles make subtle shifts; larger angles can cycle colors (reds→greens→blues). Near gamut edges,
                extreme rotations may clip, which can slightly change saturation.
              </div>
            </div>
          </Card>
          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">Intuition</div>
            <div className="text-muted-foreground mt-2 text-xs">
              Like turning a color wheel while keeping brightness steady. Reds can become oranges/yellows/greens as you
              rotate, but neutrals (grays) stay unchanged because they lie on the rotation axis.
            </div>
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
                return (
                  <>
                    <div>[{a.toFixed(3)}  {b.toFixed(3)}  {c.toFixed(3)}]</div>
                    <div>[{c.toFixed(3)}  {a.toFixed(3)}  {b.toFixed(3)}]</div>
                    <div>[{b.toFixed(3)}  {c.toFixed(3)}  {a.toFixed(3)}]</div>
                  </>
                );
              })()}
            </div>
          </div>

          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-muted-foreground">
              For every pixel (r, g, b):
            </div>
            <div className="text-primary font-mono mt-2 text-xs">
              {(() => {
                const angle = (hue * Math.PI) / 180;
                const cosA = Math.cos(angle);
                const sinA = Math.sin(angle);
                const a = (cosA + (1 - cosA) / 3).toFixed(3);
                const b = (1/3 * (1 - cosA) - Math.sqrt(1/3) * sinA).toFixed(3);
                const c = (1/3 * (1 - cosA) + Math.sqrt(1/3) * sinA).toFixed(3);
                return (
                  <>
                    <div>r&apos; = {a}×r + {b}×g + {c}×b</div>
                    <div>g&apos; = {c}×r + {a}×g + {b}×b</div>
                    <div>b&apos; = {b}×r + {c}×g + {a}×b</div>
                  </>
                );
              })()}
            </div>
            <div className="text-muted-foreground mt-3 text-xs">
              This preserves luminance while rotating colors around the color wheel.
            </div>
          </div>
          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">Why brightness stays stable</div>
            <div className="text-muted-foreground mt-2 text-xs">
              We rotate around the gray axis, so the gray component of each pixel stays about the same while colors
              circle around it. Perceived brightness stays roughly the same; minor changes can occur near gamut limits
              and due to display gamma.
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
