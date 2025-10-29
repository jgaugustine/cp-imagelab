import { Card } from "@/components/ui/card";
import HueRotationCube from "@/components/HueRotationCube";
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

        <TabsContent value="vibrance" className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Adaptive Chroma Boost</h3>
            <p className="text-sm text-muted-foreground">
              Vibrance increases saturation more for low-saturation pixels and less for already vivid areas, preserving skin tones and avoiding clipping.
            </p>
          </div>

          <div className="bg-muted p-4 rounded-lg font-mono text-sm">
            <div className="text-foreground">Per-pixel factor:</div>
            <div className="text-primary mt-2">
              factor = 1 + V × (1 − s)
            </div>
            <div className="text-muted-foreground mt-2 text-xs">
              where s ≈ (max(R,G,B) − min(R,G,B)) / max(R,G,B) and V is vibrance.
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
                const maxC = Math.max(R, G, B);
                const minC = Math.min(R, G, B);
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
                    <div className="mt-2">[R']   [{a}  {e}  {h}]   [R]</div>
                    <div>[G'] = [{d}  {b}  {h}] × [G]</div>
                    <div>[B']   [{d}  {e}  {c}]   [B]</div>
                  </>
                );
              })()}
            </div>

            <div className="text-foreground mt-4">Numeric example result:</div>
            <div className="text-primary mt-2 text-xs">
              {(() => {
                const R = selectedRGB?.r ?? 200, G = selectedRGB?.g ?? 150, B = selectedRGB?.b ?? 100;
                const maxC = Math.max(R, G, B);
                const minC = Math.min(R, G, B);
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
              Saturation adjusts color intensity by interpolating between the pixel color and a neutral gray for that pixel.
            </p>
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
                    <div>[R']   [{a}  {e}  {f}]   [R]</div>
                    <div>[G'] = [{d}  {b}  {f}] × [G]</div>
                    <div>[B']   [{d}  {e}  {c}]   [B]</div>
                  </>
                );
              })()}
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
            <HueRotationCube hue={hue} selectedRGB={selectedRGB} />
          </Card>
          <Card className="p-4 border-border bg-card">
            <h4 className="text-sm font-semibold text-foreground mb-2">Derivation of 1/3 and √(1/3) terms</h4>
            <div className="text-xs space-y-2">
              <div className="text-foreground">
                The hue-rotation matrix arises from rotating around the gray axis using an orthonormal RGB basis, rotating within the chroma plane, and mapping back to RGB:
              </div>
              <div className="bg-muted rounded p-3 font-mono text-primary">
                u = (1, 1, 1) / √3<br/>
                v = (1, −1, 0) / √2<br/>
                w = (1, 1, −2) / √6
              </div>
              <div className="text-foreground">
                In the (u, v, w) basis, a hue rotation by θ keeps u (luminance) fixed and rotates (v, w):
              </div>
              <div className="bg-muted rounded p-3 font-mono text-primary">
                R(θ) = diag(1, •, •) with the v–w block =<br/>
                [ cosθ  −sinθ ]<br/>
                [ sinθ   cosθ ]
              </div>
              <div className="text-foreground">
                Mapping back to RGB (M = B · R(θ) · Bᵀ with B = [u v w]) yields the 3×3 matrix used in code:
              </div>
              <div className="bg-muted rounded p-3 font-mono text-primary">
                Diagonals: cosθ + (1 − cosθ)/3<br/>
                Off-diagonals: (1/3)(1 − cosθ) ± √(1/3)·sinθ
              </div>
              <div className="text-muted-foreground">
                The 1/3 terms come from the u uᵀ = (1/3)·11ᵀ projection (gray axis). The ±√(1/3)·sinθ terms result from mixing in the rotated chroma basis (v, w) when transforming back to RGB. This construction preserves luminance while rotating hue.
              </div>
            </div>
          </Card>
          <Card className="p-4 border-border bg-card">
            <h4 className="text-sm font-semibold text-foreground mb-2">u, v, w basis and mapping</h4>
            <div className="text-xs space-y-2">
              <div className="text-foreground">
                Define an orthonormal basis of RGB with the gray axis u and two chroma axes v, w:
              </div>
              <div className="bg-muted rounded p-3 font-mono text-primary">
                u = (1, 1, 1) / √3  (gray / luminance axis)<br/>
                v = (1, −1, 0) / √2  (chroma axis 1)<br/>
                w = (1, 1, −2) / √6  (chroma axis 2)
              </div>
              <div className="text-foreground">
                Stack these basis vectors as columns to form the change-of-basis matrix B (from RGB to (u,v,w)):
              </div>
              <div className="bg-muted rounded p-3 font-mono text-primary text-[11px]">
                B = [ u v w ] =
                \n[ 1/√3   1/√2   1/√6 ]
                \n[ 1/√3  −1/√2   1/√6 ]
                \n[ 1/√3    0    −2/√6 ]
              </div>
              <div className="text-foreground">
                Rotate only in the chroma plane with R(θ) (u fixed, v–w rotated):
              </div>
              <div className="bg-muted rounded p-3 font-mono text-primary text-[11px]">
                R(θ) =
                \n[ 1    0        0     ]
                \n[ 0  cosθ   −sinθ ]
                \n[ 0  sinθ    cosθ ]
              </div>
              <div className="text-foreground">
                Map back to RGB with the similarity transform:
              </div>
              <div className="bg-muted rounded p-3 font-mono text-primary text-[11px]">
                M(θ) = B · R(θ) · Bᵀ
              </div>
              <div className="text-muted-foreground">
                Multiplying out B · R(θ) · Bᵀ yields the RGB-space hue rotation used above (diagonals = cosθ + (1−cosθ)/3; off‑diagonals = (1/3)(1−cosθ) ± √(1/3)·sinθ). This preserves the u component (luminance) while rotating chroma.
              </div>
            </div>
          </Card>
          
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
        </TabsContent>
      </Tabs>
    </Card>
  );
}
