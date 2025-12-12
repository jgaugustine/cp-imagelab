import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import RGBCubeVisualizer from "@/components/RGBCubeVisualizer";
import { FilterInstance, TransformationType, BlurParams, SharpenParams, EdgeParams, DenoiseParams, CustomConvParams } from "@/types/transformations";
import { KernelPreview } from "@/components/Convolution/KernelGrid";
import ProductCube from "@/components/Convolution/ProductCube";
import { ConvolutionRegionSelector } from "@/components/Convolution/ConvolutionRegionSelector";
import { InteractiveConvolutionVisualizer } from "@/components/Convolution/InteractiveConvolutionVisualizer";
import { ColorPointCloud } from "@/components/ColorPointCloud";
import { gaussianKernel, boxKernel, sobelKernels, prewittKernels, unsharpKernel } from "@/lib/convolution";
// Tabs removed; we render sections conditionally based on activeTab
import { useEffect, useRef, useState, useMemo } from "react";

// Smoothstep curve visualization component
interface SmoothstepCurveProps {
  edge0: number;
  edge1: number;
  currentLuminance: number;
  adjustmentValue: number;
}

const SmoothstepCurve = ({ edge0, edge1, currentLuminance, adjustmentValue }: SmoothstepCurveProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const width = 600;
  const height = 400;
  const padding = { top: 50, right: 40, bottom: 60, left: 60 };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Set up coordinate system
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const xMin = 0;
    const xMax = 1;
    const yMin = 0;
    const yMax = 1;

    // Helper to convert x to canvas x
    const toCanvasX = (x: number) => padding.left + ((x - xMin) / (xMax - xMin)) * plotWidth;
    // Helper to convert y to canvas y (flipped because canvas y increases downward)
    const toCanvasY = (y: number) => padding.top + plotHeight - ((y - yMin) / (yMax - yMin)) * plotHeight;

    // Smoothstep function
    const smoothstep = (edge0: number, edge1: number, x: number): number => {
      const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
      return t * t * (3 - 2 * t);
    };

    // Draw grid lines
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      const x = i / 10;
      const canvasX = toCanvasX(x);
      ctx.beginPath();
      ctx.moveTo(canvasX, padding.top);
      ctx.lineTo(canvasX, padding.top + plotHeight);
      ctx.stroke();
    }
    for (let i = 0; i <= 10; i++) {
      const y = i / 10;
      const canvasY = toCanvasY(y);
      ctx.beginPath();
      ctx.moveTo(padding.left, canvasY);
      ctx.lineTo(padding.left + plotWidth, canvasY);
      ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2;
    // X-axis
    ctx.beginPath();
    ctx.moveTo(padding.left, toCanvasY(0));
    ctx.lineTo(padding.left + plotWidth, toCanvasY(0));
    ctx.stroke();
    // Y-axis
    ctx.beginPath();
    ctx.moveTo(toCanvasX(0), padding.top);
    ctx.lineTo(toCanvasX(0), padding.top + plotHeight);
    ctx.stroke();

    // Draw smoothstep curve
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const numPoints = 200;
    for (let i = 0; i <= numPoints; i++) {
      const x = i / numPoints;
      const y = smoothstep(edge0, edge1, x);
      const canvasX = toCanvasX(x);
      const canvasY = toCanvasY(y);
      if (i === 0) {
        ctx.moveTo(canvasX, canvasY);
      } else {
        ctx.lineTo(canvasX, canvasY);
      }
    }
    ctx.stroke();

    // Draw edge markers
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    // edge0
    const edge0X = toCanvasX(edge0);
    ctx.beginPath();
    ctx.moveTo(edge0X, padding.top);
    ctx.lineTo(edge0X, padding.top + plotHeight);
    ctx.stroke();
    // edge1
    const edge1X = toCanvasX(edge1);
    ctx.beginPath();
    ctx.moveTo(edge1X, padding.top);
    ctx.lineTo(edge1X, padding.top + plotHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw current pixel position
    const currentWeight = smoothstep(edge0, edge1, currentLuminance);
    const currentX = toCanvasX(currentLuminance);
    const currentY = toCanvasY(currentWeight);

    // Draw vertical line to curve
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(currentX, padding.top + plotHeight);
    ctx.lineTo(currentX, currentY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw horizontal line to curve
    ctx.beginPath();
    ctx.moveTo(padding.left, currentY);
    ctx.lineTo(currentX, currentY);
    ctx.stroke();

    // Draw point on curve
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(currentX, currentY, 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw formula at the top (split into two lines to fit)
    ctx.fillStyle = '#374151';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const formulaY = 8;
    ctx.fillText('smoothstep(x) = t² × (3 - 2t)', width / 2, formulaY);
    ctx.fillText('where t = clamp((x - edge₀)/(edge₁ - edge₀), 0, 1)', width / 2, formulaY + 13);
    
    // Draw labels
    ctx.fillStyle = '#374151';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    // X-axis label
    ctx.fillText('Luminance (normalized)', width / 2, height - padding.bottom + 10);
    // Y-axis label
    ctx.save();
    ctx.translate(25, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Weight', 0, 0);
    ctx.restore();

    // Axis tick labels
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 10; i++) {
      const x = i / 10;
      const canvasX = toCanvasX(x);
      ctx.fillText(x.toFixed(1), canvasX, height - padding.bottom + 25);
    }
    ctx.textAlign = 'right';
    for (let i = 0; i <= 10; i++) {
      const y = i / 10;
      const canvasY = toCanvasY(y);
      ctx.fillText(y.toFixed(1), padding.left - 8, canvasY);
    }

    // Draw edge labels (positioned above X-axis label to avoid overlap)
    ctx.fillStyle = '#6b7280';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`edge0=${edge0.toFixed(1)}`, edge0X, padding.top + plotHeight - 2);
    ctx.fillText(`edge1=${edge1.toFixed(1)}`, edge1X, padding.top + plotHeight - 2);

    // Draw current pixel info (inside canvas bounds, positioned below formula)
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const infoX = padding.left;
    const infoY = 36; // Position below formula (8 + 13 + 15 spacing)
    
    // Use shorter labels to ensure they fit
    const info1 = `L: ${currentLuminance.toFixed(3)}`;
    const info2 = `W: ${currentWeight.toFixed(3)}`;
    const info3 = `Adj: ${(adjustmentValue * currentWeight).toFixed(1)}`;
    
    ctx.fillText(info1, infoX, infoY);
    ctx.fillText(info2, infoX, infoY + 12);
    ctx.fillText(info3, infoX, infoY + 24);
  }, [edge0, edge1, currentLuminance, adjustmentValue]);

  return (
    <div className="w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="border border-border rounded max-w-full"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
    </div>
  );
};

interface MathExplanationProps {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  vibrance?: number;
  whites?: number;
  blacks?: number;
  linearSaturation?: boolean;
  onToggleLinearSaturation?: (checked: boolean) => void;
  selectedRGB?: { r: number; g: number; b: number };
  // Provided by parent: which control was last changed
  lastChange?: 'brightness' | 'contrast' | 'saturation' | 'vibrance' | 'hue' | 'whites' | 'blacks';
  // Optional pipeline order for All Changes
  transformOrder?: ('brightness' | 'contrast' | 'saturation' | 'vibrance' | 'hue' | 'whites' | 'blacks')[];
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
  // Original image for convolution visualization
  image?: HTMLImageElement | null;
  // Callback to change active tab
  onActiveTabChange?: (tab: string) => void;
}

export function MathExplanation({ brightness, contrast, saturation, hue, vibrance = 0, whites = 0, blacks = 0, linearSaturation = false, onToggleLinearSaturation, selectedRGB, lastChange, transformOrder, pipeline, selectedInstanceId, hasImage, activeTab, onUpdateInstanceParams, convAnalysis, image, onActiveTabChange }: MathExplanationProps) {
  const [localLastChange, setLocalLastChange] = useState<'brightness' | 'contrast' | 'saturation' | 'vibrance' | 'hue' | 'whites' | 'blacks' | undefined>(undefined);
  const prevRef = useRef({ brightness, contrast, saturation, vibrance, hue, whites, blacks });
  // Track selected color space from ColorPointCloud
  const [selectedColorSpace, setSelectedColorSpace] = useState<'rgb' | 'hsv' | 'hsl' | 'lab' | 'ycbcr'>('rgb');
  // Track input values for custom convolution kernel editing (keyed by instance ID and cell position)
  const [customConvInputValues, setCustomConvInputValues] = useState<Record<string, string>>({});
  // Region selection state for convolution visualization
  const [convRegionX, setConvRegionX] = useState<number | null>(null);
  const [convRegionY, setConvRegionY] = useState<number | null>(null);

  // Reset region selection when switching convolution types or instances
  useEffect(() => {
    setConvRegionX(null);
    setConvRegionY(null);
  }, [activeTab, selectedInstanceId]);

  useEffect(() => {
    const prev = prevRef.current;
    if (brightness !== prev.brightness) setLocalLastChange('brightness');
    else if (contrast !== prev.contrast) setLocalLastChange('contrast');
    else if (saturation !== prev.saturation) setLocalLastChange('saturation');
    else if (vibrance !== prev.vibrance) setLocalLastChange('vibrance');
    else if (hue !== prev.hue) setLocalLastChange('hue');
    else if (whites !== prev.whites) setLocalLastChange('whites');
    else if (blacks !== prev.blacks) setLocalLastChange('blacks');
    prevRef.current = { brightness, contrast, saturation, vibrance, hue, whites, blacks };
  }, [brightness, contrast, saturation, vibrance, hue, whites, blacks]);

  const effectiveLastChange = lastChange ?? localLastChange;

  // When using instance-based pipeline, prefer the selected instance's value
  const resolveFromPipeline = useMemo(() => {
    if (!pipeline || pipeline.length === 0) return {} as Record<string, number | undefined>;
    const byKind = (kind: 'brightness' | 'contrast' | 'saturation' | 'vibrance' | 'hue' | 'whites' | 'blacks'): number | undefined => {
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
      whites: byKind('whites'),
      blacks: byKind('blacks'),
    } as Record<string, number | undefined>;
  }, [pipeline, selectedInstanceId]);

  const effBrightness = resolveFromPipeline.brightness ?? brightness;
  const effContrast = resolveFromPipeline.contrast ?? contrast;
  const effSaturation = resolveFromPipeline.saturation ?? saturation;
  const effVibrance = resolveFromPipeline.vibrance ?? vibrance;
  const effHue = resolveFromPipeline.hue ?? hue;
  const effWhites = resolveFromPipeline.whites ?? whites;
  const effBlacks = resolveFromPipeline.blacks ?? blacks;

  // Memoize params objects to prevent unnecessary RGBCubeVisualizer recalculations
  const brightnessParams = useMemo(() => ({ brightness: effBrightness }), [effBrightness]);
  const contrastParams = useMemo(() => ({ contrast: effContrast }), [effContrast]);
  const saturationParams = useMemo(() => ({ saturation: effSaturation, linearSaturation }), [effSaturation, linearSaturation]);
  const vibranceParams = useMemo(() => ({ vibrance: effVibrance, linearSaturation }), [effVibrance, linearSaturation]);
  const hueParams = useMemo(() => ({ hue: effHue }), [effHue]);
  const whitesParams = useMemo(() => ({ whites: effWhites }), [effWhites]);
  const blacksParams = useMemo(() => ({ blacks: effBlacks }), [effBlacks]);
  const allParams = useMemo(() => ({ brightness: effBrightness, contrast: effContrast, saturation: effSaturation, vibrance: effVibrance, hue: effHue, whites: effWhites, blacks: effBlacks, linearSaturation }), [effBrightness, effContrast, effSaturation, effVibrance, effHue, effWhites, effBlacks, linearSaturation]);
  const effectiveOrder: TransformationType[] | undefined = useMemo(() => {
    if (!pipeline) return transformOrder as TransformationType[] | undefined;
    // Reverse so bottom item (brightness, last in array) is first in order
    return pipeline.filter(p => p.enabled).map(p => p.kind as TransformationType).reverse();
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
    const smoothstep = (edge0: number, edge1: number, x: number): number => {
      const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
      return t * t * (3 - 2 * t);
    };
    const applyWhitesVec = (rgb: RGBVector, value: number): RGBVector => {
      if (value === 0) return { ...rgb };
      const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
      const weight = smoothstep(0.4, 0.8, luminance);
      const adjustment = value * weight;
      return {
        r: clamp(rgb.r + adjustment),
        g: clamp(rgb.g + adjustment),
        b: clamp(rgb.b + adjustment),
      };
    };
    const applyBlacksVec = (rgb: RGBVector, value: number): RGBVector => {
      if (value === 0) return { ...rgb };
      const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
      const weight = smoothstep(0.8, 0.2, luminance);
      const adjustment = value * weight;
      return {
        r: clamp(rgb.r + adjustment),
        g: clamp(rgb.g + adjustment),
        b: clamp(rgb.b + adjustment),
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
      // Reverse pipeline so bottom item (brightness, last in array) is applied first
      for (const inst of [...pipeline].reverse()) {
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
        } else if (inst.kind === 'whites') {
          const v = (inst.params as { value: number }).value;
          current = processStep(inst.id, 'whites', v, (rgb) => applyWhitesVec(rgb, v), current);
        } else if (inst.kind === 'blacks') {
          const v = (inst.params as { value: number }).value;
          current = processStep(inst.id, 'blacks', v, (rgb) => applyBlacksVec(rgb, v), current);
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
        } else if (kind === 'whites') {
          current = processStep('whites', kind, effWhites, (rgb) => applyWhitesVec(rgb, effWhites), current);
        } else if (kind === 'blacks') {
          current = processStep('blacks', kind, effBlacks, (rgb) => applyBlacksVec(rgb, effBlacks), current);
        }
      }
    }

    return steps;
  }, [pipeline, effectiveOrder, baseVector, linearSaturation, effBrightness, effContrast, effSaturation, effVibrance, effHue, effWhites, effBlacks]);

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
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-primary">Mathematical Transformations</h2>
          {image && onActiveTabChange && (
            <Button
              variant={activeTab === 'pointCloud' ? "default" : "outline"}
              className="gap-2"
              onClick={() => {
                if (activeTab === 'pointCloud') {
                  onActiveTabChange('brightness');
                } else {
                  onActiveTabChange('pointCloud');
                }
              }}
              aria-pressed={activeTab === 'pointCloud'}
            >
              Color Point Cloud
            </Button>
          )}
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
          <div className={activeTab === 'whites' ? '' : 'hidden pointer-events-none'} aria-hidden={activeTab !== 'whites'}>
            <Card className="p-4 border-border bg-card">
              <h4 className="text-sm font-semibold text-foreground mb-2">RGB Cube: Whites (bright tone adjustment)</h4>
              <RGBCubeVisualizer mode="whites" isVisible={activeTab === 'whites'} params={whitesParams} selectedRGB={selectedRGB} lastChange={effectiveLastChange} hasImage={hasImage} transformOrder={effectiveOrder} pipeline={pipeline} selectedInstanceId={selectedId} />
            </Card>
          </div>
          <div className={activeTab === 'blacks' ? '' : 'hidden pointer-events-none'} aria-hidden={activeTab !== 'blacks'}>
            <Card className="p-4 border-border bg-card">
              <h4 className="text-sm font-semibold text-foreground mb-2">RGB Cube: Blacks (dark tone adjustment)</h4>
              <RGBCubeVisualizer mode="blacks" isVisible={activeTab === 'blacks'} params={blacksParams} selectedRGB={selectedRGB} lastChange={effectiveLastChange} hasImage={hasImage} transformOrder={effectiveOrder} pipeline={pipeline} selectedInstanceId={selectedId} />
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

        {activeTab === 'whites' && (
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Parametric Tone Curve (Bright Tones)</h3>
            <p className="text-sm text-muted-foreground">
              Whites adjustment applies a smooth parametric curve that primarily affects bright tones (high luminance values) with gradual falloff toward midtones. The adjustment strength is weighted by a smoothstep function based on the pixel's luminance.
            </p>
          </div>
          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">Geometric intuition</div>
            <div className="text-muted-foreground mt-2 text-xs">
              Bright pixels move along the gray diagonal (R=G=B) by an amount proportional to their luminance. The adjustment is strongest for very bright pixels and tapers smoothly to zero for darker tones, preserving shadow detail while allowing precise control over highlights.
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
            
            <div className="text-foreground mt-4">Calculate Luminance (Rec.601):</div>
            <div className="text-primary mt-2">
              {(() => {
                const R = selectedRGB?.r ?? 200;
                const G = selectedRGB?.g ?? 150;
                const B = selectedRGB?.b ?? 100;
                const lum = 0.299 * R + 0.587 * G + 0.114 * B;
                const lumNorm = lum / 255;
                return `L = 0.299×${Math.round(R)} + 0.587×${Math.round(G)} + 0.114×${Math.round(B)} = ${lum.toFixed(1)} (normalized: ${lumNorm.toFixed(3)})`;
              })()}
            </div>

            <div className="text-foreground mt-4">Smoothstep Weight:</div>
            <div className="text-primary mt-2">
              {(() => {
                const R = selectedRGB?.r ?? 200;
                const G = selectedRGB?.g ?? 150;
                const B = selectedRGB?.b ?? 100;
                const lum = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
                const smoothstep = (edge0: number, edge1: number, x: number): number => {
                  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
                  return t * t * (3 - 2 * t);
                };
                const weight = smoothstep(0.4, 0.8, lum);
                return `weight = smoothstep(0.4, 0.8, ${lum.toFixed(3)}) = ${weight.toFixed(3)}`;
              })()}
            </div>

            <div className="text-foreground mt-4">Apply Adjustment:</div>
            <div className="text-primary mt-2">
              adjustment = {effWhites} × weight
            </div>

            <div className="text-foreground mt-4">Result:</div>
            <div className="text-secondary mt-2">
              {(() => {
                const R = selectedRGB?.r ?? 200;
                const G = selectedRGB?.g ?? 150;
                const B = selectedRGB?.b ?? 100;
                const lum = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
                const smoothstep = (edge0: number, edge1: number, x: number): number => {
                  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
                  return t * t * (3 - 2 * t);
                };
                const weight = smoothstep(0.4, 0.8, lum);
                const adjustment = effWhites * weight;
                const Rp = Math.max(0, Math.min(255, R + adjustment));
                const Gp = Math.max(0, Math.min(255, G + adjustment));
                const Bp = Math.max(0, Math.min(255, B + adjustment));
                return `[R', G', B'] = [${Rp.toFixed(0)}, ${Gp.toFixed(0)}, ${Bp.toFixed(0)}]`;
              })()}
            </div>
          </div>

          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-muted-foreground">
              For every pixel (r, g, b):
            </div>
            <div className="text-primary font-mono mt-2">
              L = (0.299×r + 0.587×g + 0.114×b) / 255<br/>
              t = clamp((L - 0.4) / (0.8 - 0.4), 0, 1)<br/>
              weight = t² × (3 - 2×t)<br/>
              adjustment = whites × weight<br/>
              r' = clamp(r + adjustment)<br/>
              g' = clamp(g + adjustment)<br/>
              b' = clamp(b + adjustment)
            </div>
            <div className="text-muted-foreground mt-3 text-xs">
              The smoothstep function creates a smooth S-curve transition. Pixels with L &lt; 0.4 get minimal adjustment (weight ≈ 0), pixels with L &gt; 0.8 get full adjustment (weight ≈ 1), and pixels in between get a smooth transition.
            </div>
          </div>

          {/* Smoothstep Curve Visualization */}
          <Card className="p-4 border-border bg-card">
            <h4 className="text-sm font-semibold text-foreground mb-3">Smoothstep Weight Function</h4>
            <SmoothstepCurve
              edge0={0.4}
              edge1={0.8}
              currentLuminance={(() => {
                const R = selectedRGB?.r ?? 200;
                const G = selectedRGB?.g ?? 150;
                const B = selectedRGB?.b ?? 100;
                return (0.299 * R + 0.587 * G + 0.114 * B) / 255;
              })()}
              adjustmentValue={effWhites}
            />
          </Card>

          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">What this means</div>
            <div className="text-muted-foreground mt-2 text-xs">
              Whites adjustment targets bright tones while preserving shadow detail. Positive values brighten highlights, potentially pushing them toward pure white (clipping). Negative values recover detail in bright areas by darkening them. The smoothstep weighting ensures smooth transitions without harsh breaks, similar to Lightroom's Whites slider behavior.
            </div>
          </div>
        </div>
        )}

        {activeTab === 'blacks' && (
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Parametric Tone Curve (Dark Tones)</h3>
            <p className="text-sm text-muted-foreground">
              Blacks adjustment applies a smooth parametric curve that primarily affects dark tones (low luminance values) with gradual falloff toward midtones. The adjustment strength is weighted by an inverted smoothstep function based on the pixel's luminance.
            </p>
          </div>
          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">Geometric intuition</div>
            <div className="text-muted-foreground mt-2 text-xs">
              Dark pixels move along the gray diagonal (R=G=B) by an amount proportional to their darkness. The adjustment is strongest for very dark pixels and tapers smoothly to zero for brighter tones, preserving highlight detail while allowing precise control over shadows.
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
            
            <div className="text-foreground mt-4">Calculate Luminance (Rec.601):</div>
            <div className="text-primary mt-2">
              {(() => {
                const R = selectedRGB?.r ?? 200;
                const G = selectedRGB?.g ?? 150;
                const B = selectedRGB?.b ?? 100;
                const lum = 0.299 * R + 0.587 * G + 0.114 * B;
                const lumNorm = lum / 255;
                return `L = 0.299×${Math.round(R)} + 0.587×${Math.round(G)} + 0.114×${Math.round(B)} = ${lum.toFixed(1)} (normalized: ${lumNorm.toFixed(3)})`;
              })()}
            </div>

            <div className="text-foreground mt-4">Smoothstep Weight (inverted):</div>
            <div className="text-primary mt-2">
              {(() => {
                const R = selectedRGB?.r ?? 200;
                const G = selectedRGB?.g ?? 150;
                const B = selectedRGB?.b ?? 100;
                const lum = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
                const smoothstep = (edge0: number, edge1: number, x: number): number => {
                  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
                  return t * t * (3 - 2 * t);
                };
                const weight = smoothstep(0.8, 0.2, lum);
                return `weight = smoothstep(0.8, 0.2, ${lum.toFixed(3)}) = ${weight.toFixed(3)}`;
              })()}
            </div>

            <div className="text-foreground mt-4">Apply Adjustment:</div>
            <div className="text-primary mt-2">
              adjustment = {effBlacks} × weight
            </div>

            <div className="text-foreground mt-4">Result:</div>
            <div className="text-secondary mt-2">
              {(() => {
                const R = selectedRGB?.r ?? 200;
                const G = selectedRGB?.g ?? 150;
                const B = selectedRGB?.b ?? 100;
                const lum = (0.299 * R + 0.587 * G + 0.114 * B) / 255;
                const smoothstep = (edge0: number, edge1: number, x: number): number => {
                  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
                  return t * t * (3 - 2 * t);
                };
                const weight = smoothstep(0.8, 0.2, lum);
                const adjustment = effBlacks * weight;
                const Rp = Math.max(0, Math.min(255, R + adjustment));
                const Gp = Math.max(0, Math.min(255, G + adjustment));
                const Bp = Math.max(0, Math.min(255, B + adjustment));
                return `[R', G', B'] = [${Rp.toFixed(0)}, ${Gp.toFixed(0)}, ${Bp.toFixed(0)}]`;
              })()}
            </div>
          </div>

          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-muted-foreground">
              For every pixel (r, g, b):
            </div>
            <div className="text-primary font-mono mt-2">
              L = (0.299×r + 0.587×g + 0.114×b) / 255<br/>
              t = clamp((L - 0.8) / (0.2 - 0.8), 0, 1)<br/>
              weight = t² × (3 - 2×t)<br/>
              adjustment = blacks × weight<br/>
              r' = clamp(r + adjustment)<br/>
              g' = clamp(g + adjustment)<br/>
              b' = clamp(b + adjustment)
            </div>
            <div className="text-muted-foreground mt-3 text-xs">
              The inverted smoothstep function (edge0=0.8, edge1=0.2) creates a smooth S-curve that's high for dark pixels and low for bright pixels. Pixels with L &lt; 0.2 get full adjustment (weight ≈ 1), pixels with L &gt; 0.8 get minimal adjustment (weight ≈ 0), and pixels in between get a smooth transition.
            </div>
          </div>

          {/* Smoothstep Curve Visualization */}
          <Card className="p-4 border-border bg-card">
            <h4 className="text-sm font-semibold text-foreground mb-3">Smoothstep Weight Function (Inverted)</h4>
            <SmoothstepCurve
              edge0={0.8}
              edge1={0.2}
              currentLuminance={(() => {
                const R = selectedRGB?.r ?? 200;
                const G = selectedRGB?.g ?? 150;
                const B = selectedRGB?.b ?? 100;
                return (0.299 * R + 0.587 * G + 0.114 * B) / 255;
              })()}
              adjustmentValue={effBlacks}
            />
          </Card>

          <div className="bg-muted p-4 rounded-lg text-sm">
            <div className="text-foreground font-semibold">What this means</div>
            <div className="text-muted-foreground mt-2 text-xs">
              Blacks adjustment targets dark tones while preserving highlight detail. Positive values lift shadows, recovering detail in dark areas. Negative values deepen shadows, potentially crushing them to pure black. The inverted smoothstep weighting ensures smooth transitions without harsh breaks, similar to Lightroom's Blacks slider behavior.
            </div>
          </div>
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

        {activeTab === 'pointCloud' && (
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Color Point Cloud</h3>
            <p className="text-sm text-muted-foreground">3D visualization of all image pixels in multiple color spaces (RGB, HSV, HSL, Lab, YCbCr). Each point is positioned at its color space coordinates and colored with its actual pixel color. Use the color space selector to switch between different representations.</p>
          </div>
          <Card className="p-4 border-border bg-card">
            <div className="w-full h-[600px] flex flex-col">
              <ColorPointCloud
                image={image || null}
                pipeline={pipeline}
                brightness={effBrightness}
                contrast={effContrast}
                saturation={effSaturation}
                hue={effHue}
                linearSaturation={linearSaturation}
                vibrance={effVibrance}
                transformOrder={effectiveOrder}
                onColorSpaceChange={setSelectedColorSpace}
              />
            </div>
          </Card>
          
          <div className="space-y-4 mt-4">
            {/* RGB Color Space */}
            {selectedColorSpace === 'rgb' && (
            <Card className="p-4 border-border bg-card">
              <h4 className="text-base font-semibold text-foreground mb-3">RGB Color Space</h4>
              <div className="space-y-3 text-sm">
                <div className="bg-muted p-3 rounded-lg">
                  <div className="text-foreground font-semibold mb-2">Definition</div>
                  <div className="text-muted-foreground text-xs leading-relaxed">
                    RGB (Red, Green, Blue) is an additive color model where colors are represented as combinations of three primary channels. Each channel value ranges from 0 to 255 (8-bit) or 0.0 to 1.0 (normalized).
                  </div>
                </div>
                
                <div className="bg-muted p-3 rounded-lg font-mono text-xs">
                  <div className="text-foreground font-semibold mb-2">Axes in Visualization</div>
                  <div className="text-muted-foreground">
                    <div>X-axis: R ∈ [-128, 127] (Red channel, centered at origin)</div>
                    <div>Y-axis: G ∈ [-128, 127] (Green channel, centered at origin)</div>
                    <div>Z-axis: B ∈ [-128, 127] (Blue channel, centered at origin)</div>
                    <div className="mt-2 text-xs">Position: [R - 128, G - 128, B - 128]</div>
                  </div>
                </div>

                <div className="bg-muted p-3 rounded-lg text-xs">
                  <div className="text-foreground font-semibold mb-2">Geometric Interpretation</div>
                  <div className="text-muted-foreground leading-relaxed">
                    RGB forms a cube in 3D space where each corner represents a pure color: (255,0,0) = red, (0,255,0) = green, (0,0,255) = blue, (255,255,255) = white, (0,0,0) = black. The diagonal from black to white (R=G=B) represents grayscale values. The visualization centers this cube at the origin by subtracting 128 from each channel, making it easier to see relationships around the midpoint.
                  </div>
                </div>

                <div className="bg-muted p-3 rounded-lg text-xs">
                  <div className="text-foreground font-semibold mb-2">Advantages</div>
                  <ul className="text-muted-foreground list-disc list-inside space-y-1">
                    <li>Direct representation of pixel values—no conversion needed</li>
                    <li>Intuitive for understanding raw color channel relationships</li>
                    <li>Shows clipping and channel imbalances clearly</li>
                    <li>Useful for debugging color transformations</li>
                  </ul>
                </div>
              </div>
            </Card>
            )}

            {/* HSV Color Space */}
            {selectedColorSpace === 'hsv' && (
            <Card className="p-4 border-border bg-card">
              <h4 className="text-base font-semibold text-foreground mb-3">HSV Color Space (Hue, Saturation, Value)</h4>
              <div className="space-y-3 text-sm">
                <div className="bg-muted p-3 rounded-lg">
                  <div className="text-foreground font-semibold mb-2">Definition</div>
                  <div className="text-muted-foreground text-xs leading-relaxed">
                    HSV separates color into perceptual attributes: Hue (what color), Saturation (how vivid), and Value (how bright). It's derived from the RGB color space and resembles how humans perceive color.
                  </div>
                </div>
                
                <div className="bg-muted p-3 rounded-lg font-mono text-xs">
                  <div className="text-foreground font-semibold mb-2">Conversion from RGB</div>
                  <div className="text-muted-foreground space-y-2">
                    <div>Given: r, g, b ∈ [0, 255] normalized to [0, 1]</div>
                    <div className="mt-2">
                      <div>max = max(r, g, b)</div>
                      <div>min = min(r, g, b)</div>
                      <div>δ = max - min</div>
                    </div>
                    <div className="mt-2">
                      <div><strong>Hue (H):</strong></div>
                      <div className="pl-2">
                        H = 60° × h'<br/>
                        where h' = {`{`}
                        <div className="pl-4">
                          ((g - b) / δ) mod 6  if max = r<br/>
                          (b - r) / δ + 2      if max = g<br/>
                          (r - g) / δ + 4      if max = b<br/>
                          0                    if δ = 0
                        </div>
                        {`}`}
                      </div>
                      <div className="mt-1">H ∈ [0°, 360°)</div>
                    </div>
                    <div className="mt-2">
                      <div><strong>Saturation (S):</strong></div>
                      <div>S = (max = 0) ? 0 : δ / max</div>
                      <div>S ∈ [0, 1]</div>
                    </div>
                    <div className="mt-2">
                      <div><strong>Value (V):</strong></div>
                      <div>V = max</div>
                      <div>V ∈ [0, 1]</div>
                    </div>
                  </div>
                </div>

                <div className="bg-muted p-3 rounded-lg font-mono text-xs">
                  <div className="text-foreground font-semibold mb-2">Axes in Visualization</div>
                  <div className="text-muted-foreground">
                    <div>X-axis: H ∈ [-180, 180] (Hue: H × 2 - 180, centered at origin)</div>
                    <div>Y-axis: S ∈ [-128, 127] (Saturation: S × 255 - 128)</div>
                    <div>Z-axis: V ∈ [-128, 127] (Value: V × 255 - 128)</div>
                    <div className="mt-2 text-xs">Position: [H × 2 - 180, S × 255 - 128, V × 255 - 128]</div>
                  </div>
                </div>

                <div className="bg-muted p-3 rounded-lg text-xs">
                  <div className="text-foreground font-semibold mb-2">Geometric Interpretation</div>
                  <div className="text-muted-foreground leading-relaxed">
                    HSV forms a cylindrical or conical shape: Hue wraps around a circle (0° = red, 120° = green, 240° = blue), Saturation is the radius (0 = gray axis, 1 = pure color at edge), and Value is the height (0 = black, 1 = brightest). In this visualization, the hue axis is linearized from [0°, 360°) to [-180, 180] for easier 3D viewing. Points near the Z-axis (low saturation) are near-gray; points far from the Z-axis are vivid colors.
                  </div>
                </div>

                <div className="bg-muted p-3 rounded-lg text-xs">
                  <div className="text-foreground font-semibold mb-2">Advantages</div>
                  <ul className="text-muted-foreground list-disc list-inside space-y-1">
                    <li>Separates color (H) from brightness (V) and intensity (S)</li>
                    <li>Intuitive for artists: adjust hue without changing brightness</li>
                    <li>Shows color relationships clearly—similar hues cluster together</li>
                    <li>Useful for color correction and color grading</li>
                  </ul>
                </div>
              </div>
            </Card>
            )}

            {/* HSL Color Space */}
            {selectedColorSpace === 'hsl' && (
            <Card className="p-4 border-border bg-card">
              <h4 className="text-base font-semibold text-foreground mb-3">HSL Color Space (Hue, Saturation, Lightness)</h4>
              <div className="space-y-3 text-sm">
                <div className="bg-muted p-3 rounded-lg">
                  <div className="text-foreground font-semibold mb-2">Definition</div>
                  <div className="text-muted-foreground text-xs leading-relaxed">
                    HSL is similar to HSV but uses Lightness instead of Value. Lightness represents the perceived brightness, where L=0.5 represents the pure color at maximum chroma, unlike Value where V=1 is always the brightest.
                  </div>
                </div>
                
                <div className="bg-muted p-3 rounded-lg font-mono text-xs">
                  <div className="text-foreground font-semibold mb-2">Conversion from RGB</div>
                  <div className="text-muted-foreground space-y-2">
                    <div>Given: r, g, b ∈ [0, 255] normalized to [0, 1]</div>
                    <div className="mt-2">
                      <div>max = max(r, g, b)</div>
                      <div>min = min(r, g, b)</div>
                      <div>δ = max - min</div>
                      <div>L = (max + min) / 2</div>
                    </div>
                    <div className="mt-2">
                      <div><strong>Hue (H):</strong> Same as HSV</div>
                      <div>H ∈ [0°, 360°)</div>
                    </div>
                    <div className="mt-2">
                      <div><strong>Saturation (S):</strong></div>
                      <div>S = (δ = 0) ? 0 : δ / (1 - |2L - 1|)</div>
                      <div>S ∈ [0, 1]</div>
                      <div className="text-xs mt-1">Note: Saturation formula differs from HSV—uses lightness in denominator</div>
                    </div>
                    <div className="mt-2">
                      <div><strong>Lightness (L):</strong></div>
                      <div>L = (max + min) / 2</div>
                      <div>L ∈ [0, 1]</div>
                    </div>
                  </div>
                </div>

                <div className="bg-muted p-3 rounded-lg font-mono text-xs">
                  <div className="text-foreground font-semibold mb-2">Axes in Visualization</div>
                  <div className="text-muted-foreground">
                    <div>X-axis: H ∈ [-180, 180] (Hue: H × 2 - 180, centered at origin)</div>
                    <div>Y-axis: S ∈ [-128, 127] (Saturation: S × 255 - 128)</div>
                    <div>Z-axis: L ∈ [-128, 127] (Lightness: L × 255 - 128)</div>
                    <div className="mt-2 text-xs">Position: [H × 2 - 180, S × 255 - 128, L × 255 - 128]</div>
                  </div>
                </div>

                <div className="bg-muted p-3 rounded-lg text-xs">
                  <div className="text-foreground font-semibold mb-2">Geometric Interpretation</div>
                  <div className="text-muted-foreground leading-relaxed">
                    HSL forms a double cone: the top cone goes from pure colors (L=0.5, S=1) to white (L=1, S=0), and the bottom cone goes from pure colors to black (L=0, S=0). Unlike HSV, where V=1 can be any saturation, HSL's purest colors (maximum saturation) occur at L=0.5. This makes HSL more intuitive for some applications: increasing lightness always moves toward white, and decreasing lightness always moves toward black.
                  </div>
                </div>

                <div className="bg-muted p-3 rounded-lg text-xs">
                  <div className="text-foreground font-semibold mb-2">Advantages</div>
                  <ul className="text-muted-foreground list-disc list-inside space-y-1">
                    <li>Lightness is more perceptually uniform than Value</li>
                    <li>Pure colors (maximum chroma) occur at mid-lightness (L=0.5)</li>
                    <li>Better for UI design—easier to generate color schemes</li>
                    <li>Similar hue clustering to HSV but with different brightness distribution</li>
                  </ul>
                </div>

                <div className="bg-muted p-3 rounded-lg text-xs">
                  <div className="text-foreground font-semibold mb-2">HSV vs HSL Key Difference</div>
                  <div className="text-muted-foreground leading-relaxed">
                    In HSV, V=1 represents the brightest the color can be at any saturation. In HSL, L=0.5 represents the lightness at which colors reach maximum saturation. HSV's brightness scale goes from dark to brightest possible; HSL's lightness scale goes from black through pure color to white.
                  </div>
                </div>
              </div>
            </Card>
            )}

            {/* Lab Color Space */}
            {selectedColorSpace === 'lab' && (
            <Card className="p-4 border-border bg-card">
              <h4 className="text-base font-semibold text-foreground mb-3">CIE Lab Color Space (L*a*b*)</h4>
              <div className="space-y-3 text-sm">
                <div className="bg-muted p-3 rounded-lg">
                  <div className="text-foreground font-semibold mb-2">Definition</div>
                  <div className="text-muted-foreground text-xs leading-relaxed">
                    CIE Lab is a perceptually uniform color space designed to match human vision. Equal distances in Lab space correspond to approximately equal perceived color differences. It's device-independent and based on the CIE XYZ color space (standard observer, D65 illuminant).
                  </div>
                </div>
                
                <div className="bg-muted p-3 rounded-lg font-mono text-xs">
                  <div className="text-foreground font-semibold mb-2">Conversion from RGB (via XYZ)</div>
                  <div className="text-muted-foreground space-y-2">
                    <div><strong>Step 1: sRGB to Linear RGB</strong></div>
                    <div className="pl-2">
                      For each channel c ∈ {`{r, g, b}`}:<br/>
                      c_linear = {`{`}
                      <div className="pl-4">
                        c/12.92           if c ≤ 0.04045<br/>
                        ((c + 0.055)/1.055)^2.4  if c &gt; 0.04045
                      </div>
                      {`}`}
                    </div>
                    <div className="mt-2"><strong>Step 2: Linear RGB to XYZ (D65 illuminant)</strong></div>
                    <div className="pl-2">
                      <div>[X]   [0.4124564  0.3575761  0.1804375] [r_linear]</div>
                      <div>[Y] = [0.2126729  0.7151522  0.0721750] [g_linear]</div>
                      <div>[Z]   [0.0193339  0.1191920  0.9503041] [b_linear]</div>
                    </div>
                    <div className="mt-2"><strong>Step 3: XYZ to Lab (D65 reference white)</strong></div>
                    <div className="pl-2">
                      <div>X_n = 0.95047, Y_n = 1.0, Z_n = 1.08883 (D65 white point)</div>
                      <div className="mt-1">
                        f(t) = {`{`}
                        <div className="pl-4">
                          t^(1/3)              if t &gt; (6/29)³ ≈ 0.008856<br/>
                          7.787t + 16/116      otherwise
                        </div>
                        {`}`}
                      </div>
                      <div className="mt-1">
                        f_x = f(X/X_n)<br/>
                        f_y = f(Y/Y_n)<br/>
                        f_z = f(Z/Z_n)
                      </div>
                      <div className="mt-1">
                        <div>L* = 116 × f_y - 16</div>
                        <div>a* = 500 × (f_x - f_y)</div>
                        <div>b* = 200 × (f_y - f_z)</div>
                      </div>
                      <div className="mt-1">
                        L* ∈ [0, 100] (perceptual lightness)<br/>
                        a* ∈ [-128, 127] (green-red axis: negative=green, positive=red)<br/>
                        b* ∈ [-128, 127] (blue-yellow axis: negative=blue, positive=yellow)
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-muted p-3 rounded-lg font-mono text-xs">
                  <div className="text-foreground font-semibold mb-2">Axes in Visualization</div>
                  <div className="text-muted-foreground">
                    <div>X-axis: a* ∈ [-200, 200] (clamped, green-red chrominance)</div>
                    <div>Y-axis: L* ∈ [-128, 127] (lightness: L* × 2.55 - 128)</div>
                    <div>Z-axis: b* ∈ [-200, 200] (clamped, blue-yellow chrominance)</div>
                    <div className="mt-2 text-xs">Position: [a*, L* × 2.55 - 128, b*] (clamped to reasonable range)</div>
                  </div>
                </div>

                <div className="bg-muted p-3 rounded-lg text-xs">
                  <div className="text-foreground font-semibold mb-2">Geometric Interpretation</div>
                  <div className="text-muted-foreground leading-relaxed">
                    Lab space is designed to be perceptually uniform: a distance of 1 unit anywhere in the space represents roughly the same perceived color difference. The L* axis (lightness) is vertical, ranging from 0 (black) to 100 (white). The a* axis represents green-red: negative values are green, positive are red. The b* axis represents blue-yellow: negative values are blue, positive are yellow. Colors with a*=0, b*=0 are neutral (grayscale). The chroma (saturation) is distance from the L* axis: C* = √(a*² + b*²). The hue angle is θ = arctan2(b*, a*).
                  </div>
                </div>

                <div className="bg-muted p-3 rounded-lg text-xs">
                  <div className="text-foreground font-semibold mb-2">Advantages</div>
                  <ul className="text-muted-foreground list-disc list-inside space-y-1">
                    <li><strong>Perceptually uniform:</strong> Equal distances ≈ equal perceived differences</li>
                    <li><strong>Device-independent:</strong> Based on human visual perception, not display technology</li>
                    <li><strong>Separates lightness from color:</strong> L* independent of a* and b*</li>
                    <li><strong>Useful for color matching:</strong> Delta-E calculations for color difference</li>
                    <li><strong>Better for color correction:</strong> Adjustments are more predictable</li>
                  </ul>
                </div>

                <div className="bg-muted p-3 rounded-lg text-xs">
                  <div className="text-foreground font-semibold mb-2">Key Concepts</div>
                  <div className="text-muted-foreground space-y-1 leading-relaxed">
                    <div><strong>Lightness (L*):</strong> Perceptual brightness, independent of color</div>
                    <div><strong>Chroma (C*):</strong> Colorfulness, distance from gray axis: C* = √(a*² + b*²)</div>
                    <div><strong>Hue (h*):</strong> Color angle: h* = arctan2(b*, a*) in degrees</div>
                    <div><strong>Delta-E:</strong> Color difference metric: ΔE = √((ΔL*)² + (Δa*)² + (Δb*)²)</div>
                  </div>
                </div>
              </div>
            </Card>
            )}

            {/* YCbCr Color Space */}
            {selectedColorSpace === 'ycbcr' && (
            <Card className="p-4 border-border bg-card">
              <h4 className="text-base font-semibold text-foreground mb-3">YCbCr Color Space (Luminance and Chrominance)</h4>
              <div className="space-y-3 text-sm">
                <div className="bg-muted p-3 rounded-lg">
                  <div className="text-foreground font-semibold mb-2">Definition</div>
                  <div className="text-muted-foreground text-xs leading-relaxed">
                    YCbCr separates an image into luminance (Y, brightness information) and chrominance (Cb, Cr, color information). It's widely used in video compression (MPEG, H.264) and image compression (JPEG) because the human eye is more sensitive to brightness changes than color changes, allowing aggressive chroma subsampling without visible quality loss.
                  </div>
                </div>
                
                <div className="bg-muted p-3 rounded-lg font-mono text-xs">
                  <div className="text-foreground font-semibold mb-2">Conversion from RGB (ITU-R BT.601 standard)</div>
                  <div className="text-muted-foreground space-y-2">
                    <div>Given: R, G, B ∈ [0, 255]</div>
                    <div className="mt-2">
                      <div><strong>Luminance (Y):</strong></div>
                      <div>Y = 0.299 × R + 0.587 × G + 0.114 × B</div>
                      <div>Y ∈ [0, 255]</div>
                      <div className="text-xs mt-1">Weighted sum matching human luminance perception (more green weight)</div>
                    </div>
                    <div className="mt-2">
                      <div><strong>Blue-difference chroma (Cb):</strong></div>
                      <div>Cb = -0.168736 × R - 0.331264 × G + 0.5 × B + 128</div>
                      <div>Cb ∈ [0, 255], centered at 128</div>
                      <div className="text-xs mt-1">Represents deviation from gray toward blue (positive) or yellow (negative)</div>
                    </div>
                    <div className="mt-2">
                      <div><strong>Red-difference chroma (Cr):</strong></div>
                      <div>Cr = 0.5 × R - 0.418688 × G - 0.081312 × B + 128</div>
                      <div>Cr ∈ [0, 255], centered at 128</div>
                      <div className="text-xs mt-1">Represents deviation from gray toward red (positive) or cyan (negative)</div>
                    </div>
                    <div className="mt-2">
                      <div className="font-semibold">For visualization (centered at origin):</div>
                      <div>Cb_vis = Cb - 128 ∈ [-128, 127]</div>
                      <div>Cr_vis = Cr - 128 ∈ [-128, 127]</div>
                    </div>
                  </div>
                </div>

                <div className="bg-muted p-3 rounded-lg font-mono text-xs">
                  <div className="text-foreground font-semibold mb-2">Matrix Form</div>
                  <div className="text-muted-foreground">
                    <div>[Y ]   [ 0.299   0.587   0.114 ] [R]   [  0 ]</div>
                    <div>[Cb] = [-0.169  -0.331   0.5   ] [G] + [128]</div>
                    <div>[Cr]   [ 0.5    -0.419  -0.081 ] [B]   [128]</div>
                  </div>
                </div>

                <div className="bg-muted p-3 rounded-lg font-mono text-xs">
                  <div className="text-foreground font-semibold mb-2">Axes in Visualization</div>
                  <div className="text-muted-foreground">
                    <div>X-axis: Y ∈ [-128, 127] (Luminance: Y - 128, centered at origin)</div>
                    <div>Y-axis: Cb ∈ [-128, 127] (Blue-difference chrominance: Cb - 128)</div>
                    <div>Z-axis: Cr ∈ [-128, 127] (Red-difference chrominance: Cr - 128)</div>
                    <div className="mt-2 text-xs">Position: [Y - 128, Cb - 128, Cr - 128]</div>
                  </div>
                </div>

                <div className="bg-muted p-3 rounded-lg text-xs">
                  <div className="text-foreground font-semibold mb-2">Geometric Interpretation</div>
                  <div className="text-muted-foreground leading-relaxed">
                    YCbCr space separates brightness from color information. The Y axis (luminance) represents grayscale intensity, matching how humans perceive brightness. The Cb axis (blue-yellow) and Cr axis (red-cyan) represent chrominance deviations. When Cb=0 and Cr=0 (at the origin after centering), the color is neutral gray. Moving along Cb: positive = more blue, negative = more yellow. Moving along Cr: positive = more red, negative = more cyan. This separation allows video/image codecs to compress chrominance more aggressively (e.g., 4:2:0 subsampling) since human vision prioritizes luminance detail.
                  </div>
                </div>

                <div className="bg-muted p-3 rounded-lg text-xs">
                  <div className="text-foreground font-semibold mb-2">Advantages</div>
                  <ul className="text-muted-foreground list-disc list-inside space-y-1">
                    <li><strong>Compression-friendly:</strong> Enables chroma subsampling (4:2:0, 4:2:2) with minimal visual loss</li>
                    <li><strong>Matches human perception:</strong> Y channel matches perceived brightness closely</li>
                    <li><strong>Separates concerns:</strong> Can adjust brightness (Y) without affecting color (Cb, Cr)</li>
                    <li><strong>Industry standard:</strong> Used in JPEG, MPEG, H.264, H.265 codecs</li>
                    <li><strong>Useful for video processing:</strong> Noise reduction, color correction</li>
                  </ul>
                </div>

                <div className="bg-muted p-3 rounded-lg text-xs">
                  <div className="text-foreground font-semibold mb-2">Chroma Subsampling</div>
                  <div className="text-muted-foreground leading-relaxed">
                    Because chrominance changes are less perceptually important than luminance, video/image codecs often store Cb and Cr at lower resolutions. Common schemes: 4:4:4 (full chroma), 4:2:2 (half horizontal chroma), 4:2:0 (quarter chroma, half horizontal and vertical). This can reduce file sizes by 50% with minimal visible quality loss.
                  </div>
                </div>
              </div>
            </Card>
            )}

            {/* General Information */}
            <div className="space-y-3 mt-4 p-4 bg-muted/30 rounded-lg border border-border">
              <div className="space-y-2">
                <h4 className="text-base font-semibold text-foreground">What is the Color Point Cloud?</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The Color Point Cloud is a three-dimensional visualization that maps every pixel in your image to a point in color space. You can visualize your image in multiple color spaces: RGB (red, green, blue), HSV (hue, saturation, value), HSL (hue, saturation, lightness), Lab (perceptually uniform), and YCbCr (luminance and chrominance). Each pixel's color space values determine its position along the X, Y, and Z axes respectively, creating a spatial representation of your image's color distribution.
                </p>
              </div>
              
              <div className="space-y-2">
                <h4 className="text-base font-semibold text-foreground">What Does It Mean?</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The shape and distribution of points reveal the color characteristics of your image. Dense clusters indicate dominant colors, while sparse regions show less common hues. The overall spread tells you about color diversity—tight clusters suggest a limited palette, while a wide distribution indicates rich color variation. The point cloud updates in real-time as you apply transformations, showing how these adjustments impact the spatial distribution of colors. Different color spaces reveal different aspects: RGB shows raw channel values, HSV/HSL emphasize hue relationships, Lab provides perceptually uniform spacing, and YCbCr separates luminance from chrominance.
                </p>
              </div>
              
              <div className="space-y-2">
                <h4 className="text-base font-semibold text-foreground">Why Should You Care?</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Understanding your image's color distribution helps you make more informed editing decisions. You can see if your adjustments are pushing colors into undesirable ranges (like clipping to pure white or black), identify color casts, and visualize how transformations affect the entire color gamut. It's particularly useful for spotting over-saturation, color shifts, and understanding how different filters compress or expand your color space.
                </p>
              </div>
              
              <div className="space-y-2">
                <h4 className="text-base font-semibold text-foreground">How to Read It</h4>
                <ul className="text-sm text-muted-foreground leading-relaxed space-y-1.5 list-disc list-inside">
                  <li><strong>Color Space Selection:</strong> Use the dropdown above the visualization to switch between RGB, HSV, HSL, Lab, and YCbCr color spaces. Each space maps its three channels to the X, Y, and Z axes.</li>
                  <li><strong>Axes:</strong> The axes represent the three channels of the selected color space. For RGB: X=Red, Y=Green, Z=Blue. For HSV/HSL: X=Hue, Y=Saturation, Z=Value/Lightness. For Lab: X=a*, Y=L*, Z=b*. For YCbCr: X=Y, Y=Cb, Z=Cr.</li>
                  <li><strong>Point Colors:</strong> Each point is colored with its actual RGB pixel color, so you can see both position and appearance simultaneously, regardless of the selected visualization space.</li>
                  <li><strong>Density:</strong> Brighter, more opaque regions indicate many pixels share similar colors. Darker, sparse areas show unique or rare colors.</li>
                  <li><strong>Pure Colors:</strong> Points at the extremes of each axis represent pure colors—red (255, 0, 0), green (0, 255, 0), blue (0, 0, 255), white (255, 255, 255), black (0, 0, 0), and the secondary colors.</li>
                  <li><strong>Interaction:</strong> Click and drag to rotate the view, scroll to zoom in and out, and explore the cloud from different angles.</li>
                </ul>
              </div>
              
              <div className="space-y-2">
                <h4 className="text-base font-semibold text-foreground">What to Check Out</h4>
                <ul className="text-sm text-muted-foreground leading-relaxed space-y-1.5 list-disc list-inside">
                  <li><strong>Color Clusters:</strong> Look for tight groupings that represent dominant colors in your image—these might be skin tones, sky, foliage, or other key elements.</li>
                  <li><strong>Transformation Effects:</strong> Adjust brightness, contrast, or saturation and watch how the point cloud shifts, expands, or contracts. Notice how contrast stretches colors away from the center, while saturation moves points toward the edges.</li>
                  <li><strong>Clipping Detection:</strong> Check if points are accumulating at the extremes of the RGB space (near 0 or 255 on any axis)—this indicates color clipping where detail is being lost.</li>
                  <li><strong>Color Balance:</strong> See if the distribution is skewed toward one axis (e.g., more red) which might indicate a color cast.</li>
                  <li><strong>Filter Impact:</strong> Apply blur, sharpen, or edge detection filters and observe how they redistribute colors in the RGB space.</li>
                </ul>
              </div>
            </div>
          </div>
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
            if (!inst || inst.kind !== 'blur') return null;
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
                <div className="mt-2">
                  <div className="text-xs text-muted-foreground mb-2">{p.kind} {p.size}×{p.size} kernel:</div>
                  <div className="font-mono text-sm">
                    {k.map((row, ri) => (
                      <div key={ri} className="flex items-center">
                        <span className="mr-1">[</span>
                        {row.map((v, ci) => (
                          <span key={ci} className="px-2">
                            {Math.abs(v) < 1e-6 ? '0' : v.toFixed(3)}
                          </span>
                        ))}
                        <span className="ml-1">]</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-2">
                  <KernelPreview kernel={k} title="Kernel (grayscale)" />
                </div>
                <div className="bg-muted p-4 rounded-lg text-sm mt-4">
                  <div className="text-foreground font-semibold">What the slider controls</div>
                  <div className="text-muted-foreground mt-2 text-xs">
                    {p.kind === 'gaussian' ? (
                      <>
                        The slider controls <strong>σ (sigma)</strong>, the standard deviation of the Gaussian kernel.
                        Increasing σ increases the blur amount by spreading the weights over a wider area.
                        <div className="mt-2">
                          <strong>Current value:</strong> σ = {p.sigma?.toFixed(2) ?? '1.00'}
                        </div>
                        <div className="mt-2">
                          <strong>6σ + 1 rule:</strong> For a Gaussian blur, the kernel size should ideally be approximately 6σ + 1 to capture about 99.7% of the Gaussian distribution. With σ = {p.sigma?.toFixed(2) ?? '1.00'}, the ideal kernel size would be {(() => {
                            const idealSize = Math.ceil((p.sigma ?? 1.0) * 6 + 1);
                            const oddSize = idealSize % 2 === 0 ? idealSize + 1 : idealSize;
                            return `${oddSize}×${oddSize}`;
                          })()} (currently using {p.size}×{p.size}).
                        </div>
                        <div className="mt-2">
                          The Gaussian kernel weights are computed as: w(x,y) = exp(-(x² + y²) / (2σ²)), then normalized so all weights sum to 1.
                        </div>
                      </>
                    ) : (
                      <>
                        The slider controls the <strong>kernel size</strong> directly. Increasing the size increases the blur amount by averaging over a larger neighborhood.
                        <div className="mt-2">
                          <strong>Current value:</strong> {p.size}×{p.size} kernel
                        </div>
                        <div className="mt-2">
                          Box blur applies uniform weights (1/(size²)) to all pixels in the kernel, creating a simple average over the neighborhood.
                        </div>
                      </>
                    )}
                  </div>
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
                
                {/* Interactive visualization below existing content */}
                {image && convRegionX !== null && convRegionY !== null && (
                  <div className="mt-6">
                    <InteractiveConvolutionVisualizer
                      image={image}
                      regionX={convRegionX}
                      regionY={convRegionY}
                      instance={inst}
                      onBack={() => {
                        setConvRegionX(null);
                        setConvRegionY(null);
                      }}
                    />
                  </div>
                )}
                
                {image && convRegionX === null && convRegionY === null && (
                  <div className="mt-6">
                    <ConvolutionRegionSelector
                      image={image}
                      onRegionSelected={(x, y) => {
                        setConvRegionX(x);
                        setConvRegionY(y);
                      }}
                    />
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
            if (!inst || inst.kind !== 'sharpen') return null;
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
                <div className="mt-2">
                  <div className="text-xs text-muted-foreground mb-2">{p.size}×{p.size} kernel (amount = {p.amount.toFixed(2)}):</div>
                  <div className="font-mono text-sm">
                    {k.map((row, ri) => (
                      <div key={ri} className="flex items-center">
                        <span className="mr-1">[</span>
                        {row.map((v, ci) => (
                          <span key={ci} className="px-2">
                            {Math.abs(v) < 1e-6 ? '0' : v.toFixed(3)}
                          </span>
                        ))}
                        <span className="ml-1">]</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-2">
                  <KernelPreview kernel={k} title="Kernel (grayscale)" />
                </div>
                <div className="bg-muted p-4 rounded-lg text-sm mt-4">
                  <div className="text-foreground font-semibold">What the slider controls</div>
                  <div className="text-muted-foreground mt-2 text-xs">
                    The slider controls the <strong>amount</strong> parameter, which determines the strength of the sharpening effect.
                    <div className="mt-2">
                      <strong>Current value:</strong> amount = {p.amount.toFixed(2)}
                    </div>
                    <div className="mt-2">
                      {p.kind === 'unsharp' ? (
                        <>Unsharp masking enhances edges by subtracting a blurred version scaled by the amount. Higher values create stronger sharpening: sharpened = original + amount × (original - blurred).</>
                      ) : p.kind === 'laplacian' ? (
                        <>Laplacian sharpening applies a high-pass filter that emphasizes edges. Higher amounts increase the edge enhancement: sharpened = original + amount × Laplacian(original).</>
                      ) : (
                        <>Edge enhance sharpening emphasizes high-frequency details. Higher amounts create stronger edge enhancement.</>
                      )}
                    </div>
                  </div>
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
                
                {/* Interactive visualization below existing content */}
                {image && convRegionX !== null && convRegionY !== null && (
                  <div className="mt-6">
                    <InteractiveConvolutionVisualizer
                      image={image}
                      regionX={convRegionX}
                      regionY={convRegionY}
                      instance={inst}
                      onBack={() => {
                        setConvRegionX(null);
                        setConvRegionY(null);
                      }}
                    />
                  </div>
                )}
                
                {image && convRegionX === null && convRegionY === null && (
                  <div className="mt-6">
                    <ConvolutionRegionSelector
                      image={image}
                      onRegionSelected={(x, y) => {
                        setConvRegionX(x);
                        setConvRegionY(y);
                      }}
                    />
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
            if (!inst || inst.kind !== 'edge') return null;
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
                <div className="flex gap-8 mt-2">
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">{p.operator} – X:</div>
                    <div className="font-mono text-sm">
                      {kx.map((row, ri) => (
                        <div key={ri} className="flex items-center">
                          <span className="mr-1">[</span>
                          {row.map((v, ci) => (
                            <span key={ci} className="px-2">
                              {v.toFixed(0)}
                            </span>
                          ))}
                          <span className="ml-1">]</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">{p.operator} – Y:</div>
                    <div className="font-mono text-sm">
                      {ky.map((row, ri) => (
                        <div key={ri} className="flex items-center">
                          <span className="mr-1">[</span>
                          {row.map((v, ci) => (
                            <span key={ci} className="px-2">
                              {v.toFixed(0)}
                            </span>
                          ))}
                          <span className="ml-1">]</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <KernelPreview kernel={kx} title="X (grayscale)" />
                  <KernelPreview kernel={ky} title="Y (grayscale)" />
                </div>
                <div className="bg-muted p-4 rounded-lg text-sm mt-4">
                  <div className="text-foreground font-semibold">What the slider controls</div>
                  <div className="text-muted-foreground mt-2 text-xs">
                    The slider controls the <strong>kernel size</strong> for edge detection.
                    <div className="mt-2">
                      <strong>Current value:</strong> {p.size}×{p.size} kernel
                    </div>
                    <div className="mt-2">
                      {p.operator === 'sobel' ? (
                        <>Sobel operators compute gradients in X and Y directions using weighted differences. The {p.size}×{p.size} size determines the neighborhood used for gradient computation. Larger kernels are less sensitive to noise but may miss fine details.</>
                      ) : (
                        <>Prewitt operators compute gradients using uniform weights. The {p.size}×{p.size} size determines the neighborhood used for gradient computation. Larger kernels provide smoother gradients but may blur edge localization.</>
                      )}
                    </div>
                    <div className="mt-2">
                      The final edge magnitude is computed as: magnitude = √(Gx² + Gy²), where Gx and Gy are the X and Y gradient responses.
                    </div>
                  </div>
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
                
                {/* Interactive visualization below existing content */}
                {image && convRegionX !== null && convRegionY !== null && (
                  <div className="mt-6">
                    <InteractiveConvolutionVisualizer
                      image={image}
                      regionX={convRegionX}
                      regionY={convRegionY}
                      instance={inst}
                      onBack={() => {
                        setConvRegionX(null);
                        setConvRegionY(null);
                      }}
                    />
                  </div>
                )}
                
                {image && convRegionX === null && convRegionY === null && (
                  <div className="mt-6">
                    <ConvolutionRegionSelector
                      image={image}
                      onRegionSelected={(x, y) => {
                        setConvRegionX(x);
                        setConvRegionY(y);
                      }}
                    />
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
            if (!inst || inst.kind !== 'denoise') return null;
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
                  <div className="mt-2">
                    <div className="text-xs text-muted-foreground mb-2">Mean {p.size}×{p.size} kernel:</div>
                    <div className="font-mono text-sm">
                      {k.map((row, ri) => (
                        <div key={ri} className="flex items-center">
                          {ri === 0 ? <span className="mr-1">[</span> : ri === k.length - 1 ? <span className="mr-1">]</span> : <span className="mr-1">|</span>}
                          {row.map((v, ci) => (
                            <span key={ci} className="px-2">
                              {Math.abs(v) < 1e-6 ? '0' : v.toFixed(3)}
                            </span>
                          ))}
                          {ri === 0 ? <span className="ml-1">]</span> : ri === k.length - 1 ? <span className="ml-1">[</span> : <span className="ml-1">|</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-2">
                    <KernelPreview kernel={k} title="Kernel (grayscale)" />
                  </div>
                  <div className="bg-muted p-4 rounded-lg text-sm mt-4">
                    <div className="text-foreground font-semibold">What the slider controls</div>
                    <div className="text-muted-foreground mt-2 text-xs">
                      The slider controls the <strong>strength</strong> parameter, which determines how much of the filtered (denoised) image is blended with the original.
                      <div className="mt-2">
                        <strong>Current value:</strong> strength = {(p.strength ?? 0.5).toFixed(2)}
                      </div>
                      <div className="mt-2">
                        Mean filtering applies a box blur (uniform averaging) over a {p.size}×{p.size} neighborhood. The strength parameter blends the original and filtered images: result = (1 - strength) × original + strength × filtered.
                      </div>
                      <div className="mt-2">
                        When strength = 0, the original image is preserved. When strength = 1, only the filtered (averaged) image is used. Intermediate values create a smooth transition between original and denoised.
                      </div>
                      <div className="mt-2">
                        <strong>Kernel size:</strong> The {p.size}×{p.size} size determines the neighborhood used for averaging. Larger kernels remove more noise but may blur fine details.
                      </div>
                    </div>
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
                  
                  {/* Interactive visualization below existing content (only for mean filter) */}
                  {image && convRegionX !== null && convRegionY !== null && (
                    <div className="mt-6">
                      <InteractiveConvolutionVisualizer
                        image={image}
                        regionX={convRegionX}
                        regionY={convRegionY}
                        instance={inst}
                        onBack={() => {
                          setConvRegionX(null);
                          setConvRegionY(null);
                        }}
                      />
                    </div>
                  )}
                  
                  {image && convRegionX === null && convRegionY === null && (
                    <div className="mt-6">
                      <ConvolutionRegionSelector
                        image={image}
                        onRegionSelected={(x, y) => {
                          setConvRegionX(x);
                          setConvRegionY(y);
                        }}
                      />
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
                <div className="bg-muted p-4 rounded-lg text-sm mt-4">
                  <div className="text-foreground font-semibold">What the slider controls</div>
                  <div className="text-muted-foreground mt-2 text-xs">
                    <div className="mt-2">
                      <strong>Median filter:</strong> This is a non-linear filter that replaces each pixel with the median value of its {p.size}×{p.size} neighborhood. There is no strength slider for median filtering—it directly replaces pixel values.
                    </div>
                    <div className="mt-2">
                      <strong>Kernel size:</strong> The {p.size}×{p.size} size determines the neighborhood used for finding the median. Larger kernels remove more noise and outliers but may blur fine details and edges.
                    </div>
                    <div className="mt-2">
                      Median filtering is particularly effective at removing salt-and-pepper noise while preserving edges better than mean filtering, as it ignores extreme values (outliers) in the neighborhood.
                    </div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-2">Median uses sorted neighborhood values (no fixed kernel).</div>
              </>
            );
          })()}
        </div>
        )}

        {activeTab === 'customConv' && pipeline && selectedInstanceId && (
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">Custom Convolution</h3>
            <p className="text-sm text-muted-foreground">Define your own convolution kernel and see its effect on the image.</p>
          </div>
          {(() => {
            const inst = pipeline.find(p => p.id === selectedInstanceId);
            if (!inst || inst.kind !== 'customConv') return null;
            const p = inst.params as CustomConvParams;
            const k = p.kernel;
            
            // Helper to get unique key for each input cell
            const getInputKey = (ri: number, ci: number) => `${inst.id}-${ri}-${ci}`;
            const getInputValue = (ri: number, ci: number, currentValue: number): string => {
              const key = getInputKey(ri, ci);
              return customConvInputValues[key] !== undefined 
                ? customConvInputValues[key] 
                : currentValue.toString();
            };
            
            // Helper to resize kernel when size changes
            const resizeKernel = (newSize: 3 | 5 | 7 | 9): number[][] => {
              const oldSize = k.length;
              const newKernel: number[][] = Array.from({ length: newSize }, () => 
                Array.from({ length: newSize }, () => 0)
              );
              
              // Copy existing values, centered
              const offset = Math.floor((newSize - oldSize) / 2);
              for (let y = 0; y < oldSize && y + offset < newSize; y++) {
                for (let x = 0; x < oldSize && x + offset < newSize; x++) {
                  if (y + offset >= 0 && x + offset >= 0) {
                    newKernel[y + offset][x + offset] = k[y][x];
                  }
                }
              }
              
              // If expanding, initialize center to 1 (identity-like)
              if (newSize > oldSize) {
                const center = Math.floor(newSize / 2);
                if (newKernel[center][center] === 0) {
                  newKernel[center][center] = 1;
                }
              }
              
              return newKernel;
            };
            
            return (
              <>
                <div className="flex items-center gap-3 text-sm">
                  <label className="text-muted-foreground">Kernel Size</label>
                  <select className="border rounded px-2 py-1 bg-card" value={p.size}
                    onChange={(e) => {
                      const newSize = Number(e.target.value) as 3 | 5 | 7 | 9;
                      const newKernel = resizeKernel(newSize);
                      onUpdateInstanceParams?.(inst.id, prev => ({ 
                        ...prev, 
                        params: { 
                          ...(prev.params as CustomConvParams), 
                          size: newSize,
                          kernel: newKernel
                        } 
                      }));
                    }}>
                    <option value={3}>3×3</option>
                    <option value={5}>5×5</option>
                    <option value={7}>7×7</option>
                    <option value={9}>9×9</option>
                  </select>
                </div>
                <div className="mt-2">
                  <div className="text-xs text-muted-foreground mb-2">Custom {p.size}×{p.size} kernel (editable):</div>
                  <div className="font-mono text-sm">
                    {k.map((row, ri) => (
                      <div key={ri} className="flex items-center gap-1">
                        <span className="mr-1">[</span>
                        {row.map((v, ci) => (
                          <input
                            key={ci}
                            type="text"
                            inputMode="decimal"
                            value={getInputValue(ri, ci, v)}
                            onChange={(e) => {
                              const inputValue = e.target.value;
                              const key = getInputKey(ri, ci);
                              
                              // Update state to allow typing "-" and partial numbers
                              setCustomConvInputValues(prev => ({ ...prev, [key]: inputValue }));
                              
                              // Try to parse as number
                              const newValue = parseFloat(inputValue);
                              
                              // Only update kernel if we have a valid complete number
                              if (!isNaN(newValue) && inputValue !== '' && inputValue !== '-' && inputValue !== '-.') {
                                const newKernel = k.map((r, ry) => 
                                  r.map((c, cx) => (ry === ri && cx === ci) ? newValue : c)
                                );
                                onUpdateInstanceParams?.(inst.id, prev => ({ 
                                  ...prev, 
                                  params: { 
                                    ...(prev.params as CustomConvParams), 
                                    kernel: newKernel
                                  } 
                                }));
                              }
                            }}
                            onBlur={(e) => {
                              // On blur, commit the value (default to 0 if invalid)
                              const inputValue = e.target.value;
                              const key = getInputKey(ri, ci);
                              const newValue = parseFloat(inputValue) || 0;
                              
                              // Clear state for this input
                              setCustomConvInputValues(prev => {
                                const next = { ...prev };
                                delete next[key];
                                return next;
                              });
                              
                              // Update kernel with final value
                              const newKernel = k.map((r, ry) => 
                                r.map((c, cx) => (ry === ri && cx === ci) ? newValue : c)
                              );
                              onUpdateInstanceParams?.(inst.id, prev => ({ 
                                ...prev, 
                                params: { 
                                  ...(prev.params as CustomConvParams), 
                                  kernel: newKernel
                                } 
                              }));
                            }}
                            className="w-16 px-1 py-0.5 text-xs border rounded bg-card text-foreground text-center"
                          />
                        ))}
                        <span className="ml-1">]</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-2">
                  <KernelPreview kernel={k} title="Kernel (grayscale)" />
                </div>
                <div className="bg-muted p-4 rounded-lg text-sm mt-4">
                  <div className="text-foreground font-semibold">How it works</div>
                  <div className="text-muted-foreground mt-2 text-xs">
                    Convolution applies your kernel to each pixel in the image. For each pixel, the kernel is centered on that pixel,
                    and each kernel value is multiplied by the corresponding pixel value in the neighborhood. The results are summed
                    to produce the output pixel value.
                    <div className="mt-2">
                      <strong>Tips:</strong>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        <li>Kernels that sum to 1 preserve overall brightness</li>
                        <li>Negative values can create edge detection or sharpening effects</li>
                        <li>Larger kernels affect larger neighborhoods but are slower to compute</li>
                        <li>Try common kernels like identity (center=1, rest=0), blur (all positive, sum=1), or edge detection (center positive, neighbors negative)</li>
                      </ul>
                    </div>
                  </div>
                </div>
                {convAnalysis && convAnalysis.kind === 'customConv' && convAnalysis.size === p.size && (
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
      </div>
    </Card>
  );
}

