import { Card } from "@/components/ui/card";
import RGBCubeVisualizer from "@/components/RGBCubeVisualizer";
import { FilterInstance, TransformationType, BlurParams, SharpenParams, EdgeParams, DenoiseParams } from "@/types/transformations";
import KernelGrid, { KernelPreview } from "@/components/Convolution/KernelGrid";
import ProductCube from "@/components/Convolution/ProductCube";
import { gaussianKernel, boxKernel, sobelKernels, prewittKernels, unsharpKernel } from "@/lib/convolution";
// Tabs removed; we render sections conditionally based on activeTab
import { useEffect, useRef, useState, useMemo } from "react";

interface MathExplanationProps {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  vibrance?: number;
  linearSaturation?: boolean;
  onToggleLinearSaturation?: (checked: boolean) => void;
  selectedRGB?: { r: number; g: number; b: number };
  // Provided by parent: which control was last changed
  lastChange?: 'brightness' | 'contrast' | 'saturation' | 'vibrance' | 'hue';
  // Optional pipeline order for All Changes
  transformOrder?: ('brightness' | 'contrast' | 'saturation' | 'vibrance' | 'hue')[];
  // Instance-based pipeline support
  pipeline?: FilterInstance[];
  selectedInstanceId?: string | null;
  // Image upload state
  hasImage?: boolean;
  // Which explanation section to show
  activeTab?: string;
  // Allow updating selected instance params (for kernel type/size, etc.)
  onUpdateInstanceParams?: (id: string, updater: (prev: FilterInstance) => FilterInstance) => void;
  // Convolution analysis computed on click
  convAnalysis?: any | null;
}

export function MathExplanation({ brightness, contrast, saturation, hue, vibrance = 0, linearSaturation = false, onToggleLinearSaturation, selectedRGB, lastChange, transformOrder, pipeline, selectedInstanceId, hasImage, activeTab, onUpdateInstanceParams, convAnalysis }: MathExplanationProps) {
  const [localLastChange, setLocalLastChange] = useState<'brightness' | 'contrast' | 'saturation' | 'vibrance' | 'hue' | undefined>(undefined);
  const prevRef = useRef({ brightness, contrast, saturation, vibrance, hue });

  useEffect(() => {
    const prev = prevRef.current;
    if (brightness !== prev.brightness) setLocalLastChange('brightness');
    else if (contrast !== prev.contrast) setLocalLastChange('contrast');
    else if (saturation !== prev.saturation) setLocalLastChange('saturation');
    else if (vibrance !== prev.vibrance) setLocalLastChange('vibrance');
    else if (hue !== prev.hue) setLocalLastChange('hue');
    prevRef.current = { brightness, contrast, saturation, vibrance, hue };
  }, [brightness, contrast, saturation, vibrance, hue]);

  const effectiveLastChange = lastChange ?? localLastChange;

  // When using instance-based pipeline, prefer the selected instance's value
  const resolveFromPipeline = useMemo(() => {
    if (!pipeline || pipeline.length === 0) return {} as Record<string, number | undefined>;
    const byKind = (kind: 'brightness' | 'contrast' | 'saturation' | 'vibrance' | 'hue'): number | undefined => {
      const selected = selectedInstanceId ? pipeline.find(p => p.id === selectedInstanceId && p.kind === kind) : undefined;
      const inst = selected ?? pipeline.find(p => p.kind === kind && p.enabled);
      if (!inst) return undefined;
      if (kind === 'vibrance') return (inst.params as { vibrance: number }).vibrance;
      if (kind === 'hue') return (inst.params as { hue: number }).hue;
      return (inst.params as { value: number }).value;
    };
    return {
      brightness: byKind('brightness'),
      contrast: byKind('contrast'),
      saturation: byKind('saturation'),
      vibrance: byKind('vibrance'),
      hue: byKind('hue'),
    } as Record<string, number | undefined>;
  }, [pipeline, selectedInstanceId]);

  const effBrightness = resolveFromPipeline.brightness ?? brightness;
  const effContrast = resolveFromPipeline.contrast ?? contrast;
  const effSaturation = resolveFromPipeline.saturation ?? saturation;
  const effVibrance = resolveFromPipeline.vibrance ?? vibrance;
  const effHue = resolveFromPipeline.hue ?? hue;

  // Memoize params objects to prevent unnecessary RGBCubeVisualizer recalculations
  const brightnessParams = useMemo(() => ({ brightness: effBrightness }), [effBrightness]);
  const contrastParams = useMemo(() => ({ contrast: effContrast }), [effContrast]);
  const saturationParams = useMemo(() => ({ saturation: effSaturation, linearSaturation }), [effSaturation, linearSaturation]);
  const vibranceParams = useMemo(() => ({ vibrance: effVibrance, linearSaturation }), [effVibrance, linearSaturation]);
  const hueParams = useMemo(() => ({ hue: effHue }), [effHue]);
  const allParams = useMemo(() => ({ brightness: effBrightness, contrast: effContrast, saturation: effSaturation, vibrance: effVibrance, hue: effHue, linearSaturation }), [effBrightness, effContrast, effSaturation, effVibrance, effHue, linearSaturation]);
  const effectiveOrder: TransformationType[] | undefined = useMemo(() => {
    if (!pipeline) return transformOrder as TransformationType[] | undefined;
    return pipeline.filter(p => p.enabled).map(p => p.kind as TransformationType);
  }, [pipeline, transformOrder]);
  const selectedId = selectedInstanceId ?? undefined;

  type RGBVector = { r: number; g: number; b: number };
  type VectorStep = {
    key: string;
    kind: TransformationType;
    input: RGBVector;
    output: RGBVector;
    value?: number;
  };

  const baseVector: RGBVector = useMemo(() => ({
    r: selectedRGB?.r ?? 200,
    g: selectedRGB?.g ?? 150,
    b: selectedRGB?.b ?? 100,
  }), [selectedRGB]);

  const vectorSteps: VectorStep[] = useMemo(() => {
    const steps: VectorStep[] = [];

    const clamp = (v: number) => Math.max(0, Math.min(255, v));
    const toLinear = (c: number) => {
      const x = c / 255;
      return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    const toSRGB = (c: number) => {
      const y = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
      return y * 255;
    };
    const applyBrightnessVec = (rgb: RGBVector, value: number): RGBVector => ({
      r: clamp(rgb.r + value),
      g: clamp(rgb.g + value),
      b: clamp(rgb.b + value),
    });
    const applyContrastVec = (rgb: RGBVector, value: number): RGBVector => ({
      r: clamp((rgb.r - 128) * value + 128),
      g: clamp((rgb.g - 128) * value + 128),
      b: clamp((rgb.b - 128) * value + 128),
    });
    const applySaturationGamma = (rgb: RGBVector, value: number): RGBVector => {
      const gray = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
      return {
        r: clamp(gray + (rgb.r - gray) * value),
        g: clamp(gray + (rgb.g - gray) * value),
        b: clamp(gray + (rgb.b - gray) * value),
      };
    };
    const applySaturationLinear = (rgb: RGBVector, value: number): RGBVector => {
      const rl = toLinear(rgb.r);
      const gl = toLinear(rgb.g);
      const bl = toLinear(rgb.b);
      const Y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
      const rlin = Y + (rl - Y) * value;
      const glin = Y + (gl - Y) * value;
      const blin = Y + (bl - Y) * value;
      return {
        r: clamp(toSRGB(rlin)),
        g: clamp(toSRGB(glin)),
        b: clamp(toSRGB(blin)),
      };
    };
    const applyVibranceGamma = (rgb: RGBVector, value: number): RGBVector => {
      const maxC = Math.max(rgb.r, rgb.g, rgb.b);
      const minC = Math.min(rgb.r, rgb.g, rgb.b);
      const sEst = maxC === 0 ? 0 : (maxC - minC) / maxC;
      const factor = 1 + value * (1 - sEst);
      const gray = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
      return {
        r: clamp(gray + (rgb.r - gray) * factor),
        g: clamp(gray + (rgb.g - gray) * factor),
        b: clamp(gray + (rgb.b - gray) * factor),
      };
    };
    const applyVibranceLinear = (rgb: RGBVector, value: number): RGBVector => {
      const rl = toLinear(rgb.r);
      const gl = toLinear(rgb.g);
      const bl = toLinear(rgb.b);
      const maxL = Math.max(rl, gl, bl);
      const minL = Math.min(rl, gl, bl);
      const sEst = maxL === 0 ? 0 : (maxL - minL) / maxL;
      const factor = 1 + value * (1 - sEst);
      const Y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
      const rlin = Y + (rl - Y) * factor;
      const glin = Y + (gl - Y) * factor;
      const blin = Y + (bl - Y) * factor;
      return {
        r: clamp(toSRGB(rlin)),
        g: clamp(toSRGB(glin)),
        b: clamp(toSRGB(blin)),
      };
    };
    const applyHueVec = (rgb: RGBVector, degrees: number): RGBVector => {
      if (degrees === 0) return { ...rgb };
      const angle = (degrees * Math.PI) / 180;
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

    const processStep = (key: string, kind: TransformationType, value: number | undefined, updater: (rgb: RGBVector) => RGBVector, current: RGBVector) => {
      const input = { ...current };
      const output = updater(current);
      steps.push({ key, kind, input, output, value });
      return output;
    };

    let current: RGBVector = { ...baseVector };

    if (pipeline && pipeline.length > 0) {
      for (const inst of pipeline) {
        if (!inst.enabled) continue;
        if (inst.kind === 'brightness') {
          const v = (inst.params as { value: number }).value;
          current = processStep(inst.id, 'brightness', v, (rgb) => applyBrightnessVec(rgb, v), current);
        } else if (inst.kind === 'contrast') {
          const v = (inst.params as { value: number }).value;
          current = processStep(inst.id, 'contrast', v, (rgb) => applyContrastVec(rgb, v), current);
        } else if (inst.kind === 'saturation') {
          const v = (inst.params as { value: number }).value;
          current = processStep(inst.id, 'saturation', v, (rgb) => linearSaturation ? applySaturationLinear(rgb, v) : applySaturationGamma(rgb, v), current);
        } else if (inst.kind === 'vibrance') {
          const v = (inst.params as { vibrance: number }).vibrance;
          current = processStep(inst.id, 'vibrance', v, (rgb) => linearSaturation ? applyVibranceLinear(rgb, v) : applyVibranceGamma(rgb, v), current);
        } else if (inst.kind === 'hue') {
          const v = (inst.params as { hue: number }).hue;
          current = processStep(inst.id, 'hue', v, (rgb) => applyHueVec(rgb, v), current);
        }
      }
    } else if (effectiveOrder && effectiveOrder.length > 0) {
      for (const kind of effectiveOrder) {
        if (kind === 'brightness') {
          current = processStep('brightness', kind, effBrightness, (rgb) => applyBrightnessVec(rgb, effBrightness), current);
        } else if (kind === 'contrast') {
          current = processStep('contrast', kind, effContrast, (rgb) => applyContrastVec(rgb, effContrast), current);
        } else if (kind === 'saturation') {
          current = processStep('saturation', kind, effSaturation, (rgb) => linearSaturation ? applySaturationLinear(rgb, effSaturation) : applySaturationGamma(rgb, effSaturation), current);
        } else if (kind === 'vibrance') {
          current = processStep('vibrance', kind, effVibrance, (rgb) => linearSaturation ? applyVibranceLinear(rgb, effVibrance) : applyVibranceGamma(rgb, effVibrance), current);
        } else if (kind === 'hue') {
          current = processStep('hue', kind, effHue, (rgb) => applyHueVec(rgb, effHue), current);
        }
      }
    }

    return steps;
  }, [pipeline, effectiveOrder, baseVector, linearSaturation, effBrightness, effContrast, effSaturation, effVibrance, effHue]);

  const contrastStep = useMemo(() => {
    const stepsForContrast = vectorSteps.filter(step => step.kind === 'contrast');
    if (stepsForContrast.length === 0) return undefined;
    if (selectedId) {
      const match = stepsForContrast.find(step => step.key === selectedId);
      if (match) return match;
    }
    return stepsForContrast[0];
  }, [vectorSteps, selectedId]);

  const contrastValueUsed = contrastStep?.value ?? effContrast;
  const contrastInputVector: RGBVector = contrastStep?.input ?? baseVector;
  const contrastOutputVector: RGBVector = contrastStep?.output ?? {
    r: Math.max(0, Math.min(255, (contrastInputVector.r - 128) * contrastValueUsed + 128)),
    g: Math.max(0, Math.min(255, (contrastInputVector.g - 128) * contrastValueUsed + 128)),
    b: Math.max(0, Math.min(255, (contrastInputVector.b - 128) * contrastValueUsed + 128)),
  };

  return (
    <Card className="p-6 border-border bg-card h-fit">
      <div className="w-full">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-primary">Mathematical Transformations</h2>
        </div>

        {/* Persistently mounted RGB cubes for single-tool tabs; visibility toggled by activeTab */}
        <div className="space-y-3">
          <div className={activeTab === 'brightness' ? '' : 'hidden pointer-events-none'} aria-hidden={activeTab !== 'brightness'}>
            <Card className="p-4 border-border bg-card">
              <h4 className="text-sm font-semibold text-foreground mb-2">RGB Cube: Brightness (addition)</h4>
              <RGBCubeVisualizer mode="brightness" isVisible={activeTab === 'brightness'} params={brightnessParams} selectedRGB={selectedRGB} lastChange={effectiveLastChange} hasImage={hasImage} transformOrder={effectiveOrder} pipeline={pipeline} selectedInstanceId={selectedId} />
            </Card>
          </div>
          <div className={activeTab === 'contrast' ? '' : 'hidden pointer-events-none'} aria-hidden={activeTab !== 'contrast'}>
            <Card className="p-4 border-border bg-card">
              <h4 className="text-sm font-semibold text-foreground mb-2">RGB Cube: Contrast (scale around midpoint)</h4>
              <RGBCubeVisualizer mode="contrast" isVisible={activeTab === 'contrast'} params={contrastParams} selectedRGB={selectedRGB} lastChange={effectiveLastChange} hasImage={hasImage} transformOrder={effectiveOrder} pipeline={pipeline} selectedInstanceId={selectedId} />
            </Card>
          </div>
          <div className={activeTab === 'saturation' ? '' : 'hidden pointer-events-none'} aria-hidden={activeTab !== 'saturation'}>
            <Card className="p-4 border-border bg-card">
              <h4 className="text-sm font-semibold text-foreground mb-2">RGB Cube: Saturation (interpolate to gray)</h4>
              <RGBCubeVisualizer mode="saturation" isVisible={activeTab === 'saturation'} params={saturationParams} selectedRGB={selectedRGB} lastChange={effectiveLastChange} hasImage={hasImage} transformOrder={effectiveOrder} pipeline={pipeline} selectedInstanceId={selectedId} />
            </Card>
          </div>
          <div className={activeTab === 'vibrance' ? '' : 'hidden pointer-events-none'} aria-hidden={activeTab !== 'vibrance'}>
            <Card className="p-4 border-border bg-card">
              <h4 className="text-sm font-semibold text-foreground mb-2">RGB Cube: Vibrance (adaptive stretch from gray)</h4>
              <RGBCubeVisualizer mode="vibrance" isVisible={activeTab === 'vibrance'} params={vibranceParams} selectedRGB={selectedRGB} lastChange={effectiveLastChange} hasImage={hasImage} transformOrder={effectiveOrder} pipeline={pipeline} selectedInstanceId={selectedId} />
            </Card>
          </div>
          <div className={activeTab === 'hue' ? '' : 'hidden pointer-events-none'} aria-hidden={activeTab !== 'hue'}>
            <Card className="p-4 border-border bg-card">
              <h4 className="text-sm font-semibold text-foreground mb-2">RGB Cube Rotation</h4>
              <RGBCubeVisualizer mode="hue" isVisible={activeTab === 'hue'} params={hueParams} selectedRGB={selectedRGB} lastChange={effectiveLastChange} hasImage={hasImage} transformOrder={effectiveOrder} pipeline={pipeline} selectedInstanceId={selectedId} />
            </Card>
          </div>
        </div>

        {activeTab === 'brightness' && (
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Matrix Addition</h3>
            <p className="text-sm text-muted-foreground">
              Brightness adjustment is a simple matrix addition operation applied uniformly to all RGB channels.
            </p>
          </div>
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
              + [{effBrightness}, {effBrightness}, {effBrightness}]
            </div>
            
            <div className="text-foreground mt-4">Result:</div>
            <div className="text-secondary mt-2">
              {(() => {
                const R = selectedRGB?.r ?? 200;
                const G = selectedRGB?.g ?? 150;
                const B = selectedRGB?.b ?? 100;
                const Rp = Math.max(0, Math.min(255, R + effBrightness));
                const Gp = Math.max(0, Math.min(255, G + effBrightness));
                const Bp = Math.max(0, Math.min(255, B + effBrightness));
                return `= [${Rp.toFixed(0)}, ${Gp.toFixed(0)}, ${Bp.toFixed(0)}]`;
              })()}
            </div>
          </div>

          

          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-muted-foreground">
              For every pixel (r, g, b):
            </div>
            <div className="text-primary font-mono mt-2">
              r' = r + {effBrightness}<br/>
              g' = g + {effBrightness}<br/>
              b' = b + {effBrightness}
            </div>
          </div>
          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">What this means</div>
            <div className="text-muted-foreground mt-2 text-xs">
              Brightness simply shifts all three channels by the same amount. Think of moving a point in the RGB cube
              straight along the gray diagonal. Results are clamped to [0,255] so values don't wrap.
            </div>
          </div>
        </div>
        )}

        {activeTab === 'vibrance' && (
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Adaptive Color Adjustment</h3>
            <p className="text-sm text-muted-foreground">
              Vibrance adjusts saturation adaptively: positive values boost low‑chroma pixels more than high‑chroma ones; negative values reduce low‑chroma pixels more gently, preserving skin tones and avoiding clipping.
            </p>
          </div>
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
                const f = 1 + (effVibrance ?? 0) * (1 - sEst);
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
                const f = 1 + (effVibrance ?? 0) * (1 - sEst);
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

          
          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">What this means</div>
            <div className="text-muted-foreground mt-2 text-xs">
              Vibrance pushes dull colors more than already vivid ones. It helps avoid over-saturating skin tones and
              keeps highlights from clipping. Using linear-light weights better preserves perceived lightness.
            </div>
          </div>
          
        </div>
        )}

        {activeTab === 'contrast' && (
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Scalar Multiplication</h3>
            <p className="text-sm text-muted-foreground">
              Contrast is achieved by scaling each color channel around the midpoint (128).
            </p>
          </div>
          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">Geometric intuition</div>
            <div className="text-muted-foreground mt-2 text-xs">
              We scale in the direction from the midpoint of the gray vector to our current vector: take the vector from mid‑gray
              (128,128,128) to the pixel and stretch or compress it. The direction is preserved; only the distance
              along that vector changes. In effect, when increasing contrast, we are pushing away from the midpoint. RGB channel values that are lower than 128 will be pushed down and those higher than 128 will be pushed up.
            </div>
          </div>
          
          <div className="bg-muted p-4 rounded-lg font-mono text-sm">
            <div className="text-foreground">Input vector after previous adjustments:</div>
            <div className="text-primary mt-2">
              {(() => {
                const Rprev = contrastInputVector.r;
                const Gprev = contrastInputVector.g;
                const Bprev = contrastInputVector.b;
                return `[R_prev, G_prev, B_prev] = [${Math.round(Rprev)}, ${Math.round(Gprev)}, ${Math.round(Bprev)}]`;
              })()}
            </div>
            
            <div className="text-foreground mt-4">Subtract midpoint (128):</div>
            <div className="text-primary mt-2">
              {(() => {
                const Rprev = contrastInputVector.r;
                const Gprev = contrastInputVector.g;
                const Bprev = contrastInputVector.b;
                return `= [${(Rprev - 128).toFixed(0)}, ${(Gprev - 128).toFixed(0)}, ${(Bprev - 128).toFixed(0)}]`;
              })()}
            </div>
            
            <div className="text-foreground mt-4">Multiply by contrast ({contrastValueUsed.toFixed(2)}):</div>
            <div className="text-primary mt-2">
              {(() => {
                const Rprev = contrastInputVector.r;
                const Gprev = contrastInputVector.g;
                const Bprev = contrastInputVector.b;
                return `× ${contrastValueUsed.toFixed(2)} = [${((Rprev - 128) * contrastValueUsed).toFixed(1)}, ${((Gprev - 128) * contrastValueUsed).toFixed(1)}, ${((Bprev - 128) * contrastValueUsed).toFixed(1)}]`;
              })()}
            </div>
            
            <div className="text-foreground mt-4">Add midpoint back:</div>
            <div className="text-secondary mt-2">
              {(() => {
                const Rout = contrastOutputVector.r;
                const Gout = contrastOutputVector.g;
                const Bout = contrastOutputVector.b;
                return `+ 128 = [${Rout.toFixed(0)}, ${Gout.toFixed(0)}, ${Bout.toFixed(0)}]`;
              })()}
            </div>
          </div>

          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-muted-foreground">
              For every pixel (r, g, b):
            </div>
            <div className="text-primary font-mono mt-2">
              r' = (r - 128) × {contrastValueUsed.toFixed(2)} + 128<br/>
              g' = (g - 128) × {contrastValueUsed.toFixed(2)} + 128<br/>
              b' = (b - 128) × {contrastValueUsed.toFixed(2)} + 128
            </div>
            <div className="text-muted-foreground mt-3 text-xs">
              If values are normalized to 0–1, replace 128 with 0.5 instead.
            </div>
          </div>
          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">What this means</div>
            <div className="text-muted-foreground mt-2 text-xs">
              Contrast stretches distances from mid-gray (128). Values above 128 move up; values below move down.
            </div>
          </div>
          
        </div>
        )}

        {activeTab === 'saturation' && (
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Color Space Transformation</h3>
            <p className="text-sm text-muted-foreground">
              Saturation adjusts color intensity by interpolating between the pixel color and a neutral gray for that pixel.
            </p>
          </div>
          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">Geometric intuition</div>
            <div className="text-muted-foreground mt-2 text-xs">
              Motion along the line between the pixel and its projection on the gray axis (R=G=B). Uniform radial change
              of chroma: the azimuth (hue angle) around the gray axis stays the same; only the radius (distance to the
              axis) changes.
            </div>
          </div>
          
          

          {/* Commented out - Computation space section - will re-implement later */}
          {/* 
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
          */}

          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">Numeric example (respects toggle)</div>
            <div className="text-primary font-mono mt-2 text-xs">
              {(() => {
                const R = selectedRGB?.r ?? 200, G = selectedRGB?.g ?? 150, B = selectedRGB?.b ?? 100;
                if (!linearSaturation) {
                  const wR = 0.299, wG = 0.587, wB = 0.114;
                  const gray = wR * R + wG * G + wB * B;
                  const s = effSaturation;
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
                } else {
                  const toLin = (c: number) => {
                    const x = c / 255;
                    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
                  };
                  const toSRGB = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
                  const rl = toLin(R), gl = toLin(G), bl = toLin(B);
                  const wR = 0.2126, wG = 0.7152, wB = 0.0722;
                  const Y = wR * rl + wG * gl + wB * bl;
                  const s = effSaturation;
                  const rlinP = Y + (rl - Y) * s;
                  const glinP = Y + (gl - Y) * s;
                  const blinP = Y + (bl - Y) * s;
                  const Rp = Math.max(0, Math.min(255, toSRGB(rlinP) * 255));
                  const Gp = Math.max(0, Math.min(255, toSRGB(glinP) * 255));
                  const Bp = Math.max(0, Math.min(255, toSRGB(blinP) * 255));
                  return (
                    <>
                      <div>Y = 0.2126×rₗ + 0.7152×gₗ + 0.0722×bₗ = {Y.toFixed(6)}</div>
                      <div className="mt-2">R' = toSRGB(Y + (rₗ − Y) × {s.toFixed(2)}) × 255 = {Rp.toFixed(3)}</div>
                      <div>G' = toSRGB(Y + (gₗ − Y) × {s.toFixed(2)}) × 255 = {Gp.toFixed(3)}</div>
                      <div>B' = toSRGB(Y + (bₗ − Y) × {s.toFixed(2)}) × 255 = {Bp.toFixed(3)}</div>
                    </>
                  );
                }
              })()}
            </div>
          </div>

          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-muted-foreground">Matrix form (adapts to slider and color space):</div>
            <div className="text-primary font-mono mt-2 text-xs">
              {(() => {
                const s = effSaturation;
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
          
          
          
        </div>
        )}

        {activeTab === 'hue' && (
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Rotation Matrix</h3>
            <p className="text-sm text-muted-foreground">
              Hue rotation is a 3D rotation in RGB color space around the gray axis.
            </p>
          </div>
          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">Geometric intuition</div>
            <div className="text-muted-foreground mt-2 text-xs">
              Rotation around the gray axis (R=G=B): the point keeps the same distance to the axis (radius) while its
              angle changes. Brightness stays fairly constant; only hue shifts.
            </div>
          </div>
          
          <div className="bg-muted p-4 rounded-lg font-mono text-sm overflow-x-auto">
            <div className="text-foreground">Rotation angle: {effHue}° = {(effHue * Math.PI / 180).toFixed(3)} radians</div>
            
            <div className="text-foreground mt-4">3×3 Rotation Matrix:</div>
            <div className="text-primary mt-2 text-xs">
              {(() => {
                const angle = (effHue * Math.PI) / 180;
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
                const angle = (effHue * Math.PI) / 180;
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
          <Card className="p-4 border-border bg-card">
            <h4 className="text-sm font-semibold text-foreground mb-3">What this means</h4>
            <div className="text-xs space-y-2 text-muted-foreground">
              <div>
                Hue rotation spins colors around the gray axis (where R=G=B). Brightness stays about the same; only the
                hue changes. Imagine rotating a point around the center line of the RGB cube.
                Small angles make subtle shifts; larger angles can cycle colors (reds→greens→blues). Near gamut edges,
                extreme rotations may clip, which can slightly change saturation.
              </div>
            </div>
          </Card>
        </div>
        )}

        {activeTab === 'all' && (
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Visualize Composite Changes</h3>
            <p className="text-sm text-muted-foreground">Shows the original and full-pipeline transformed vectors, plus a guide for the most recently edited transform.</p>
          </div>
          <Card className="p-4 border-border bg-card">
            <h4 className="text-sm font-semibold text-foreground mb-2">RGB Cube: All vector-based transforms</h4>
            <RGBCubeVisualizer
              mode="all"
              params={allParams}
              selectedRGB={selectedRGB}
              lastChange={effectiveLastChange}
              transformOrder={effectiveOrder}
              hasImage={hasImage}
              pipeline={pipeline}
              selectedInstanceId={selectedId}
            />
          </Card>
        </div>
        )}

        {/* Convolution-backed layers */}
        {activeTab === 'blur' && pipeline && selectedInstanceId && (
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Blur (convolution)</h3>
            <p className="text-sm text-muted-foreground">Applies a smoothing kernel over the neighborhood.</p>
          </div>
          {(() => {
            const inst = pipeline.find(p => p.id === selectedInstanceId);
            if (!inst) return null;
            const p = inst.params as BlurParams;
            const k = p.kind === 'gaussian' ? gaussianKernel(p.size, p.sigma) : boxKernel(p.size);
            return (
              <>
                <div className="flex items-center gap-3 text-sm">
                  <label className="text-muted-foreground">Type</label>
                  <select className="border rounded px-2 py-1 bg-card" value={p.kind}
                    onChange={(e) => onUpdateInstanceParams?.(inst.id, prev => ({ ...prev, params: { ...(prev.params as BlurParams), kind: e.target.value as 'box'|'gaussian' } }))}>
                    <option value="gaussian">Gaussian</option>
                    <option value="box">Box</option>
                  </select>
                  <label className="text-muted-foreground">Size</label>
                  <select className="border rounded px-2 py-1 bg-card" value={p.size}
                    onChange={(e) => onUpdateInstanceParams?.(inst.id, prev => ({ ...prev, params: { ...(prev.params as BlurParams), size: Number(e.target.value) as 3|5|7 } }))}>
                    <option value={3}>3×3</option>
                    <option value={5}>5×5</option>
                    <option value={7}>7×7</option>
                  </select>
                </div>
                <KernelGrid kernel={k} title={`${p.kind} ${p.size}×${p.size}`} />
                <div className="mt-2">
                  <KernelPreview kernel={k} title="Kernel (grayscale)" />
                </div>
                {convAnalysis && convAnalysis.kind === 'blur' && convAnalysis.size === p.size && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-foreground mb-1">Dot products at clicked pixel</div>
                    <div className="overflow-auto">
                      <div className="text-[10px] text-muted-foreground mb-1">R channel</div>
                      <div className="grid" style={{ gridTemplateColumns: `repeat(${p.size}, minmax(0, 1fr))`, gap: '2px' }}>
                        {convAnalysis.products.r.flatMap((row: number[], ri: number) => row.map((v: number, ci: number) => (
                          <div key={`r-${ri}-${ci}`} className="px-1 py-0.5 text-[10px] font-mono rounded border border-border bg-muted text-foreground text-center">{v.toFixed(1)}</div>
                        )))}
                      </div>
                      <div className="mt-2">
                        <ProductCube title="R 3D" products={convAnalysis.products.r} size={p.size} />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-2 mb-1">G channel</div>
                      <div className="grid" style={{ gridTemplateColumns: `repeat(${p.size}, minmax(0, 1fr))`, gap: '2px' }}>
                        {convAnalysis.products.g.flatMap((row: number[], ri: number) => row.map((v: number, ci: number) => (
                          <div key={`g-${ri}-${ci}`} className="px-1 py-0.5 text-[10px] font-mono rounded border border-border bg-muted text-foreground text-center">{v.toFixed(1)}</div>
                        )))}
                      </div>
                      <div className="mt-2">
                        <ProductCube title="G 3D" products={convAnalysis.products.g} size={p.size} />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-2 mb-1">B channel</div>
                      <div className="grid" style={{ gridTemplateColumns: `repeat(${p.size}, minmax(0, 1fr))`, gap: '2px' }}>
                        {convAnalysis.products.b.flatMap((row: number[], ri: number) => row.map((v: number, ci: number) => (
                          <div key={`b-${ri}-${ci}`} className="px-1 py-0.5 text-[10px] font-mono rounded border border-border bg-muted text-foreground text-center">{v.toFixed(1)}</div>
                        )))}
                      </div>
                      <div className="mt-2">
                        <ProductCube title="B 3D" products={convAnalysis.products.b} size={p.size} />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-2">Sums: R={convAnalysis.sums.r.toFixed(1)} G={convAnalysis.sums.g.toFixed(1)} B={convAnalysis.sums.b.toFixed(1)}</div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
        )}

        {activeTab === 'sharpen' && pipeline && selectedInstanceId && (
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Sharpen (unsharp mask)</h3>
            <p className="text-sm text-muted-foreground">Enhances edges by subtracting a blurred version scaled by amount.</p>
          </div>
          {(() => {
            const inst = pipeline.find(p => p.id === selectedInstanceId);
            if (!inst) return null;
            const p = inst.params as SharpenParams;
            const k = p.kernel ?? (p.kind === 'unsharp' ? unsharpKernel(p.amount, p.size) : p.kind === 'laplacian' ? unsharpKernel(0, 3).map(r=>[...r]) && ((): number[][] => { return [ [0, -p.amount, 0], [-p.amount, 1 + 4 * p.amount, -p.amount], [0, -p.amount, 0] ]; })() : ((): number[][] => { return [ [0, -p.amount, 0], [-p.amount, 1 + 4 * p.amount, -p.amount], [0, -p.amount, 0] ]; })());
            return (
              <>
                <div className="flex items-center gap-3 text-sm">
                  <label className="text-muted-foreground">Kind</label>
                  <select className="border rounded px-2 py-1 bg-card" value={p.kind}
                    onChange={(e) => onUpdateInstanceParams?.(inst.id, prev => ({ ...prev, params: { ...(prev.params as SharpenParams), kind: e.target.value as 'unsharp'|'laplacian'|'edgeEnhance' } }))}>
                    <option value="unsharp">Unsharp</option>
                    <option value="laplacian">Laplacian</option>
                    <option value="edgeEnhance">Edge Enhance</option>
                  </select>
                  <label className="text-muted-foreground">Size</label>
                  <select className="border rounded px-2 py-1 bg-card" value={p.size}
                    onChange={(e) => onUpdateInstanceParams?.(inst.id, prev => ({ ...prev, params: { ...(prev.params as SharpenParams), size: Number(e.target.value) as 3|5 } }))}>
                    <option value={3}>3×3</option>
                    <option value={5}>5×5</option>
                  </select>
                </div>
                <KernelGrid kernel={k} title={`${p.size}×${p.size} amt ${p.amount.toFixed(2)}`} />
                <div className="mt-2">
                  <KernelPreview kernel={k} title="Kernel (grayscale)" />
                </div>
                {convAnalysis && convAnalysis.kind === 'sharpen' && convAnalysis.size === p.size && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-foreground mb-1">Dot products at clicked pixel</div>
                    <div className="overflow-auto">
                      <div className="text-[10px] text-muted-foreground mb-1">R channel</div>
                      <div className="grid" style={{ gridTemplateColumns: `repeat(${p.size}, minmax(0, 1fr))`, gap: '2px' }}>
                        {convAnalysis.products.r.flatMap((row: number[], ri: number) => row.map((v: number, ci: number) => (
                          <div key={`r-${ri}-${ci}`} className="px-1 py-0.5 text-[10px] font-mono rounded border border-border bg-muted text-foreground text-center">{v.toFixed(1)}</div>
                        )))}
                      </div>
                      <div className="mt-2"><ProductCube title="R 3D" products={convAnalysis.products.r} size={p.size} /></div>
                      <div className="text-[10px] text-muted-foreground mt-2 mb-1">G channel</div>
                      <div className="grid" style={{ gridTemplateColumns: `repeat(${p.size}, minmax(0, 1fr))`, gap: '2px' }}>
                        {convAnalysis.products.g.flatMap((row: number[], ri: number) => row.map((v: number, ci: number) => (
                          <div key={`g-${ri}-${ci}`} className="px-1 py-0.5 text-[10px] font-mono rounded border border-border bg-muted text-foreground text-center">{v.toFixed(1)}</div>
                        )))}
                      </div>
                      <div className="mt-2"><ProductCube title="G 3D" products={convAnalysis.products.g} size={p.size} /></div>
                      <div className="text-[10px] text-muted-foreground mt-2 mb-1">B channel</div>
                      <div className="grid" style={{ gridTemplateColumns: `repeat(${p.size}, minmax(0, 1fr))`, gap: '2px' }}>
                        {convAnalysis.products.b.flatMap((row: number[], ri: number) => row.map((v: number, ci: number) => (
                          <div key={`b-${ri}-${ci}`} className="px-1 py-0.5 text-[10px] font-mono rounded border border-border bg-muted text-foreground text-center">{v.toFixed(1)}</div>
                        )))}
                      </div>
                      <div className="mt-2"><ProductCube title="B 3D" products={convAnalysis.products.b} size={p.size} /></div>
                      <div className="text-[10px] text-muted-foreground mt-2">Sums: R={convAnalysis.sums.r.toFixed(1)} G={convAnalysis.sums.g.toFixed(1)} B={convAnalysis.sums.b.toFixed(1)}</div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
        )}

        {activeTab === 'edge' && pipeline && selectedInstanceId && (
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Edge Detection</h3>
            <p className="text-sm text-muted-foreground">Gradient kernels highlight intensity changes.</p>
          </div>
          {(() => {
            const inst = pipeline.find(p => p.id === selectedInstanceId);
            if (!inst) return null;
            const p = inst.params as EdgeParams;
            const { kx, ky } = p.operator === 'sobel' ? sobelKernels() : prewittKernels();
            return (
              <>
                <div className="flex items-center gap-3 text-sm">
                  <label className="text-muted-foreground">Operator</label>
                  <select className="border rounded px-2 py-1 bg-card" value={p.operator}
                    onChange={(e) => onUpdateInstanceParams?.(inst.id, prev => ({ ...prev, params: { ...(prev.params as EdgeParams), operator: e.target.value as 'sobel'|'prewitt' } }))}>
                    <option value="sobel">Sobel</option>
                    <option value="prewitt">Prewitt</option>
                  </select>
                  <label className="text-muted-foreground">Combine</label>
                  <select className="border rounded px-2 py-1 bg-card" value={p.combine}
                    onChange={(e) => onUpdateInstanceParams?.(inst.id, prev => ({ ...prev, params: { ...(prev.params as EdgeParams), combine: e.target.value as 'magnitude'|'x'|'y' } }))}>
                    <option value="magnitude">Magnitude</option>
                    <option value="x">X</option>
                    <option value="y">Y</option>
                  </select>
                  <label className="text-muted-foreground">Size</label>
                  <select className="border rounded px-2 py-1 bg-card" value={p.size}
                    onChange={(e) => onUpdateInstanceParams?.(inst.id, prev => ({ ...prev, params: { ...(prev.params as EdgeParams), size: Number(e.target.value) as 3|5 } }))}>
                    <option value={3}>3×3</option>
                    <option value={5}>5×5</option>
                  </select>
                </div>
                <div className="flex gap-4">
                  <KernelGrid kernel={kx} title={`${p.operator} – X`} />
                  <KernelGrid kernel={ky} title={`${p.operator} – Y`} />
                </div>
                <div className="mt-2 flex gap-2">
                  <KernelPreview kernel={kx} title="X (grayscale)" />
                  <KernelPreview kernel={ky} title="Y (grayscale)" />
                </div>
                {convAnalysis && convAnalysis.kind === 'edge' && (
                  <div className="mt-3">
                    <div className="text-xs font-semibold text-foreground mb-1">Dot products at clicked pixel</div>
                    <div className="overflow-auto">
                      <div className="text-[10px] text-muted-foreground mb-1">X products</div>
                      <div className="grid" style={{ gridTemplateColumns: `repeat(3, minmax(0, 1fr))`, gap: '2px' }}>
                        {convAnalysis.products.x.flatMap((row: number[], ri: number) => row.map((v: number, ci: number) => (
                          <div key={`x-${ri}-${ci}`} className="px-1 py-0.5 text-[10px] font-mono rounded border border-border bg-muted text-foreground text-center">{v.toFixed(1)}</div>
                        )))}
                      </div>
                      <div className="mt-2"><ProductCube title="X 3D" products={convAnalysis.products.x} size={3} /></div>
                      <div className="text-[10px] text-muted-foreground mt-2 mb-1">Y products</div>
                      <div className="grid" style={{ gridTemplateColumns: `repeat(3, minmax(0, 1fr))`, gap: '2px' }}>
                        {convAnalysis.products.y.flatMap((row: number[], ri: number) => row.map((v: number, ci: number) => (
                          <div key={`y-${ri}-${ci}`} className="px-1 py-0.5 text-[10px] font-mono rounded border border-border bg-muted text-foreground text-center">{v.toFixed(1)}</div>
                        )))}
                      </div>
                      <div className="mt-2"><ProductCube title="Y 3D" products={convAnalysis.products.y} size={3} /></div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
        )}

        {activeTab === 'denoise' && pipeline && selectedInstanceId && (
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Denoise</h3>
            <p className="text-sm text-muted-foreground">Mean filter is convolution; median is non-linear neighborhood rank.</p>
          </div>
          {(() => {
            const inst = pipeline.find(p => p.id === selectedInstanceId);
            if (!inst) return null;
            const p = inst.params as DenoiseParams;
            if (p.kind === 'mean') {
              const k = boxKernel(p.size);
              return (
                <>
                  <div className="flex items-center gap-3 text-sm">
                    <label className="text-muted-foreground">Kind</label>
                    <select className="border rounded px-2 py-1 bg-card" value={p.kind}
                      onChange={(e) => onUpdateInstanceParams?.(inst.id, prev => ({ ...prev, params: { ...(prev.params as DenoiseParams), kind: e.target.value as 'mean'|'median' } }))}>
                      <option value="mean">Mean</option>
                      <option value="median">Median</option>
                    </select>
                    <label className="text-muted-foreground">Size</label>
                    <select className="border rounded px-2 py-1 bg-card" value={p.size}
                      onChange={(e) => onUpdateInstanceParams?.(inst.id, prev => ({ ...prev, params: { ...(prev.params as DenoiseParams), size: Number(e.target.value) as 3|5|7 } }))}>
                      <option value={3}>3×3</option>
                      <option value={5}>5×5</option>
                      <option value={7}>7×7</option>
                    </select>
                  </div>
                  <KernelGrid kernel={k} title={`Mean ${p.size}×${p.size}`} />
                  <div className="mt-2">
                    <KernelPreview kernel={k} title="Kernel (grayscale)" />
                  </div>
                  {convAnalysis && convAnalysis.kind === 'denoise' && convAnalysis.size === p.size && (
                    <div className="mt-3">
                      <div className="text-xs font-semibold text-foreground mb-1">Dot products at clicked pixel</div>
                      <div className="overflow-auto">
                        <div className="text-[10px] text-muted-foreground mb-1">R channel</div>
                        <div className="grid" style={{ gridTemplateColumns: `repeat(${p.size}, minmax(0, 1fr))`, gap: '2px' }}>
                          {convAnalysis.products.r.flatMap((row: number[], ri: number) => row.map((v: number, ci: number) => (
                            <div key={`r-${ri}-${ci}`} className="px-1 py-0.5 text-[10px] font-mono rounded border border-border bg-muted text-foreground text-center">{v.toFixed(1)}</div>
                          )))}
                        </div>
                        <div className="mt-2"><ProductCube title="R 3D" products={convAnalysis.products.r} size={p.size} /></div>
                        <div className="text-[10px] text-muted-foreground mt-2 mb-1">G channel</div>
                        <div className="grid" style={{ gridTemplateColumns: `repeat(${p.size}, minmax(0, 1fr))`, gap: '2px' }}>
                          {convAnalysis.products.g.flatMap((row: number[], ri: number) => row.map((v: number, ci: number) => (
                            <div key={`g-${ri}-${ci}`} className="px-1 py-0.5 text-[10px] font-mono rounded border border-border bg-muted text-foreground text-center">{v.toFixed(1)}</div>
                          )))}
                        </div>
                        <div className="mt-2"><ProductCube title="G 3D" products={convAnalysis.products.g} size={p.size} /></div>
                        <div className="text-[10px] text-muted-foreground mt-2 mb-1">B channel</div>
                        <div className="grid" style={{ gridTemplateColumns: `repeat(${p.size}, minmax(0, 1fr))`, gap: '2px' }}>
                          {convAnalysis.products.b.flatMap((row: number[], ri: number) => row.map((v: number, ci: number) => (
                            <div key={`b-${ri}-${ci}`} className="px-1 py-0.5 text-[10px] font-mono rounded border border-border bg-muted text-foreground text-center">{v.toFixed(1)}</div>
                          )))}
                        </div>
                        <div className="mt-2"><ProductCube title="B 3D" products={convAnalysis.products.b} size={p.size} /></div>
                        <div className="text-[10px] text-muted-foreground mt-2">Sums: R={convAnalysis.sums.r.toFixed(1)} G={convAnalysis.sums.g.toFixed(1)} B={convAnalysis.sums.b.toFixed(1)}</div>
                      </div>
                    </div>
                  )}
                </>
              );
            }
            return (
              <>
                <div className="flex items-center gap-3 text-sm">
                  <label className="text-muted-foreground">Kind</label>
                  <select className="border rounded px-2 py-1 bg-card" value={p.kind}
                    onChange={(e) => onUpdateInstanceParams?.(inst.id, prev => ({ ...prev, params: { ...(prev.params as DenoiseParams), kind: e.target.value as 'mean'|'median' } }))}>
                    <option value="mean">Mean</option>
                    <option value="median">Median</option>
                  </select>
                  <label className="text-muted-foreground">Size</label>
                  <select className="border rounded px-2 py-1 bg-card" value={p.size}
                    onChange={(e) => onUpdateInstanceParams?.(inst.id, prev => ({ ...prev, params: { ...(prev.params as DenoiseParams), size: Number(e.target.value) as 3|5|7 } }))}>
                    <option value={3}>3×3</option>
                    <option value={5}>5×5</option>
                    <option value={7}>7×7</option>
                  </select>
                </div>
                <div className="text-xs text-muted-foreground">Median uses sorted neighborhood values (no fixed kernel).</div>
              </>
            );
          })()}
        </div>
        )}
      </div>
    </Card>
  );
}

