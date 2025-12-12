import { useEffect, useRef, useState } from "react";
import { PixelInspector } from "./PixelInspector";
import { TransformationType, RGB, FilterInstance, FilterKind, BlurParams, SharpenParams, EdgeParams, DenoiseParams, CustomConvParams } from "@/types/transformations";
import { cpuConvolutionBackend } from "@/lib/convolutionBackend";
import { convolveAtPixel, gaussianKernel, boxKernel, sobelKernels, prewittKernels, unsharpKernel } from "@/lib/convolution";

interface ImageCanvasProps {
  image: HTMLImageElement;
  // New instance-based pipeline (optional until full refactor)
  pipeline?: FilterInstance[];
  onSelectInstance?: (id: string) => void;
  selectedInstanceId?: string | null;
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  whites?: number;
  blacks?: number;
  // When true, compute saturation in linear-light space instead of gamma-encoded sRGB
  linearSaturation?: boolean;
  // Additional chroma boost for low-saturation colors (0..1 typical)
  vibrance?: number;
  transformOrder: TransformationType[];
  // When true, show the pixel inspector overlay on hover
  enableInspector?: boolean;
  // Emit original pixel RGB when user clicks on the canvas
  onPixelSelect?: (rgb: RGB) => void;
  // Emit convolution analysis (dot products) for selected conv layer on click
  onSelectConvAnalysis?: (analysis: {
    kind: 'blur' | 'sharpen' | 'edge' | 'denoise' | 'customConv';
    size: number;
    kernel?: number[][];
    edgeKernels?: { kx: number[][]; ky: number[][] };
    window: { r: number; g: number; b: number }[][];
    products: { r: number[][]; g: number[][]; b: number[][] } | { x: number[][]; y: number[][]; magnitude?: number[][] };
    sums?: { r: number; g: number; b: number };
  }) => void;
  // When true, temporarily show original image (no transforms)
  previewOriginal?: boolean;
  // When true, show the image as 3 separate RGB channel panels
  dechanneled?: boolean;
}

interface InspectorData {
  x: number;
  y: number;
  originalRGB: RGB;
  transformedRGB: RGB;
  stepByStep: Record<TransformationType, RGB>;
  transformOrder: TransformationType[];
  cursorX: number;
  cursorY: number;
  steps?: { id: string; kind: FilterKind; inputRGB: RGB; outputRGB: RGB }[];
  activeConv?: { kind: 'blur' | 'sharpen' | 'edge' | 'denoise' | 'customConv'; kernel?: number[][]; edgeKernels?: { kx: number[][]; ky: number[][] }; padding: 'zero' | 'reflect' | 'edge' };
  convWindow?: { size: number; pixels: { r: number; g: number; b: number }[][] };
}

const clamp = (val: number): number => Math.max(0, Math.min(255, val));

// Matrix builder functions for linear algebra operations
// Matrices are represented as flat arrays: [m00, m01, m02, m10, m11, m12, m20, m21, m22] (row-major)

// Build brightness transformation: rgb + value
// Returns identity matrix + offset vector
const buildBrightnessMatrix = (value: number): { matrix: number[]; offset: number[] } => {
  // Identity matrix
  const matrix = [
    1, 0, 0,
    0, 1, 0,
    0, 0, 1
  ];
  const offset = [value, value, value];
  return { matrix, offset };
};

// Build contrast transformation: (rgb - 128) * value + 128 = rgb * value + 128 * (1 - value)
// Returns scale matrix + offset vector
const buildContrastMatrix = (value: number): { matrix: number[]; offset: number[] } => {
  // Scale matrix
  const matrix = [
    value, 0, 0,
    0, value, 0,
    0, 0, value
  ];
  const offset = [128 * (1 - value), 128 * (1 - value), 128 * (1 - value)];
  return { matrix, offset };
};

// Build saturation matrix (gamma space): gray + (rgb - gray) * factor
// Uses Rec.601 weights: wR=0.299, wG=0.587, wB=0.114 (gamma-encoded approximation)
// Formula: r_new = gray + (r - gray) * s = r*s + gray*(1-s)
// Expanding: r_new = r*(wR + (1-wR)*s) + g*wG*(1-s) + b*wB*(1-s)
const buildSaturationMatrix = (saturation: number): number[] => {
  if (saturation === 1) {
    // Identity matrix
    return [
      1, 0, 0,
      0, 1, 0,
      0, 0, 1
    ];
  }
  
  const wR = 0.299;
  const wG = 0.587;
  const wB = 0.114;
  const s = saturation;
  
  // For each channel: result = gray + (channel - gray) * s
  // = channel*s + gray*(1-s)
  // = channel*s + (wR*R + wG*G + wB*B)*(1-s)
  // R row: r_new = r*(wR + (1-wR)*s) + g*wG*(1-s) + b*wB*(1-s)
  // G row: g_new = r*wR*(1-s) + g*(wG + (1-wG)*s) + b*wB*(1-s)
  // B row: b_new = r*wR*(1-s) + g*wG*(1-s) + b*(wB + (1-wB)*s)
  
  return [
    wR + (1 - wR) * s, wG * (1 - s), wB * (1 - s),
    wR * (1 - s), wG + (1 - wG) * s, wB * (1 - s),
    wR * (1 - s), wG * (1 - s), wB + (1 - wB) * s
  ];
};

// Build hue rotation matrix
const buildHueMatrix = (value: number): number[] => {
  if (value === 0) {
    // Identity matrix
    return [
      1, 0, 0,
      0, 1, 0,
      0, 0, 1
    ];
  }
  
  const angle = (value * Math.PI) / 180;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  return [
    cosA + (1 - cosA) / 3,
    1/3 * (1 - cosA) - Math.sqrt(1/3) * sinA,
    1/3 * (1 - cosA) + Math.sqrt(1/3) * sinA,
    1/3 * (1 - cosA) + Math.sqrt(1/3) * sinA,
    cosA + 1/3 * (1 - cosA),
    1/3 * (1 - cosA) - Math.sqrt(1/3) * sinA,
    1/3 * (1 - cosA) - Math.sqrt(1/3) * sinA,
    1/3 * (1 - cosA) + Math.sqrt(1/3) * sinA,
    cosA + 1/3 * (1 - cosA)
  ];
};

// sRGB <-> linear-light helpers
const srgbToLinear = (channel0to255: number): number => {
  const x = channel0to255 / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};

const linearToSrgb = (linear0to1: number): number => {
  const y = linear0to1 <= 0.0031308 ? 12.92 * linear0to1 : 1.055 * Math.pow(linear0to1, 1 / 2.4) - 0.055;
  return y * 255;
};

const applyBrightness = (rgb: RGB, value: number): RGB => {
  return {
    r: clamp(rgb.r + value),
    g: clamp(rgb.g + value),
    b: clamp(rgb.b + value)
  };
};

const applyContrast = (rgb: RGB, value: number): RGB => {
  return {
    r: clamp((rgb.r - 128) * value + 128),
    g: clamp((rgb.g - 128) * value + 128),
    b: clamp((rgb.b - 128) * value + 128)
  };
};

const applySaturation = (rgb: RGB, saturation: number): RGB => {
  if (saturation === 1) return rgb;
  const gray = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b; // Rec.601 gamma-encoded approximation
  if (saturation === 0) {
    // Exact projection to gray in gamma space (no quantization to avoid banding)
    const g = clamp(gray);
    return { r: g, g, b: g };
  }
  const factor = saturation;
  return {
    r: clamp(gray + (rgb.r - gray) * factor),
    g: clamp(gray + (rgb.g - gray) * factor),
    b: clamp(gray + (rgb.b - gray) * factor)
  };
};

const applySaturationLinear = (rgb: RGB, saturation: number): RGB => {
  if (saturation === 1) return rgb;
  // Convert to linear-light space
  const rl = srgbToLinear(rgb.r);
  const gl = srgbToLinear(rgb.g);
  const bl = srgbToLinear(rgb.b);
  // Rec.709 luma weights in linear-light
  const Y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  if (saturation === 0) {
    // Exact projection to gray in linear space, then encode (no quantization)
    const enc = linearToSrgb(Y);
    const g = clamp(enc);
    return { r: g, g, b: g };
  }
  const factor = saturation;
  const rlin = Y + (rl - Y) * factor;
  const glin = Y + (gl - Y) * factor;
  const blin = Y + (bl - Y) * factor;
  // Back to sRGB
  return {
    r: clamp(linearToSrgb(rlin)),
    g: clamp(linearToSrgb(glin)),
    b: clamp(linearToSrgb(blin))
  };
};

// Vibrance in gamma-encoded sRGB space
const applyVibrance = (rgb: RGB, vibrance: number): RGB => {
  if (vibrance === 0) return rgb;
  const R = rgb.r, G = rgb.g, B = rgb.b;
  const maxC = Math.max(R, G, B);
  const minC = Math.min(R, G, B);
  const sEst = maxC === 0 ? 0 : (maxC - minC) / maxC;
  const f = 1 + vibrance * (1 - sEst);
  const gray = 0.299 * R + 0.587 * G + 0.114 * B; // Rec.601 gamma-encoded approximation
  // If already gray, nothing changes
  if (R === G && G === B) return { r: R, g: G, b: B };
  return {
    r: clamp(gray + (R - gray) * f),
    g: clamp(gray + (G - gray) * f),
    b: clamp(gray + (B - gray) * f)
  };
};

// Vibrance in linear-light space
const applyVibranceLinear = (rgb: RGB, vibrance: number): RGB => {
  if (vibrance === 0) return rgb;
  const rl = srgbToLinear(rgb.r), gl = srgbToLinear(rgb.g), bl = srgbToLinear(rgb.b);
  const maxL = Math.max(rl, gl, bl);
  const minL = Math.min(rl, gl, bl);
  const sEst = maxL === 0 ? 0 : (maxL - minL) / maxL;
  const f = 1 + vibrance * (1 - sEst);
  const Y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  if (Math.abs(rl - gl) < 1e-9 && Math.abs(gl - bl) < 1e-9) {
    const enc = linearToSrgb(Y);
    return { r: clamp(enc), g: clamp(enc), b: clamp(enc) };
  }
  const rlin = Y + (rl - Y) * f;
  const glin = Y + (gl - Y) * f;
  const blin = Y + (bl - Y) * f;
  return {
    r: clamp(linearToSrgb(rlin)),
    g: clamp(linearToSrgb(glin)),
    b: clamp(linearToSrgb(blin))
  };
};

// Smoothstep function for smooth transitions
const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

// Apply whites adjustment - affects bright tones with smooth falloff
const applyWhites = (rgb: RGB, value: number): RGB => {
  if (value === 0) return rgb;
  // Calculate luminance using Rec.601 weights (gamma-encoded approximation)
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  // Smoothstep weight: high for bright tones (0.4-0.8 range), tapers to 0 for darker
  const weight = smoothstep(0.4, 0.8, luminance);
  const adjustment = value * weight;
  return {
    r: clamp(rgb.r + adjustment),
    g: clamp(rgb.g + adjustment),
    b: clamp(rgb.b + adjustment)
  };
};

// Apply blacks adjustment - affects dark tones with smooth falloff
const applyBlacks = (rgb: RGB, value: number): RGB => {
  if (value === 0) return rgb;
  // Calculate luminance using Rec.601 weights (gamma-encoded approximation)
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  // Smoothstep weight: high for dark tones (0.2-0.8 range, inverted), tapers to 0 for brighter
  const weight = smoothstep(0.8, 0.2, luminance);
  const adjustment = value * weight;
  return {
    r: clamp(rgb.r + adjustment),
    g: clamp(rgb.g + adjustment),
    b: clamp(rgb.b + adjustment)
  };
};

// Compose multiple affine transformations into a single matrix + offset
// For transformations that only have a matrix (no offset), pass offset: [0, 0, 0]
// Composition: if y = M2 * (M1 * x + o1) + o2, then y = (M2 * M1) * x + (M2 * o1 + o2)
const composeAffineTransforms = (transforms: Array<{ matrix: number[]; offset: number[] }>): { matrix: number[]; offset: number[] } => {
  if (transforms.length === 0) {
    // Identity transformation
    return {
      matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      offset: [0, 0, 0]
    };
  }
  
  if (transforms.length === 1) {
    return transforms[0];
  }
  
  // Start with first transformation
  let resultMatrix = [...transforms[0].matrix];
  let resultOffset = [...transforms[0].offset];
  
  // Compose with each subsequent transformation
  for (let i = 1; i < transforms.length; i++) {
    const M2 = transforms[i].matrix;
    const o2 = transforms[i].offset;
    
    // Multiply matrices: M_result = M2 * M1
    // Matrix multiplication: (M2 * M1)[i][j] = sum_k M2[i][k] * M1[k][j]
    const newMatrix = [
      M2[0] * resultMatrix[0] + M2[1] * resultMatrix[3] + M2[2] * resultMatrix[6],
      M2[0] * resultMatrix[1] + M2[1] * resultMatrix[4] + M2[2] * resultMatrix[7],
      M2[0] * resultMatrix[2] + M2[1] * resultMatrix[5] + M2[2] * resultMatrix[8],
      M2[3] * resultMatrix[0] + M2[4] * resultMatrix[3] + M2[5] * resultMatrix[6],
      M2[3] * resultMatrix[1] + M2[4] * resultMatrix[4] + M2[5] * resultMatrix[7],
      M2[3] * resultMatrix[2] + M2[4] * resultMatrix[5] + M2[5] * resultMatrix[8],
      M2[6] * resultMatrix[0] + M2[7] * resultMatrix[3] + M2[8] * resultMatrix[6],
      M2[6] * resultMatrix[1] + M2[7] * resultMatrix[4] + M2[8] * resultMatrix[7],
      M2[6] * resultMatrix[2] + M2[7] * resultMatrix[5] + M2[8] * resultMatrix[8]
    ];
    
    // Transform previous offset through M2: M2 * o1 + o2
    const newOffset = [
      M2[0] * resultOffset[0] + M2[1] * resultOffset[1] + M2[2] * resultOffset[2] + o2[0],
      M2[3] * resultOffset[0] + M2[4] * resultOffset[1] + M2[5] * resultOffset[2] + o2[1],
      M2[6] * resultOffset[0] + M2[7] * resultOffset[1] + M2[8] * resultOffset[2] + o2[2]
    ];
    
    resultMatrix = newMatrix;
    resultOffset = newOffset;
  }
  
  return { matrix: resultMatrix, offset: resultOffset };
};

// Apply 3x3 matrix to RGB vector
const applyMatrix = (rgb: RGB, matrix: number[]): RGB => {
  return {
    r: clamp(rgb.r * matrix[0] + rgb.g * matrix[1] + rgb.b * matrix[2]),
    g: clamp(rgb.r * matrix[3] + rgb.g * matrix[4] + rgb.b * matrix[5]),
    b: clamp(rgb.r * matrix[6] + rgb.g * matrix[7] + rgb.b * matrix[8])
  };
};

// Apply affine transformation (matrix + offset) to RGB vector
const applyAffineTransform = (rgb: RGB, matrix: number[], offset: number[]): RGB => {
  return {
    r: clamp(rgb.r * matrix[0] + rgb.g * matrix[1] + rgb.b * matrix[2] + offset[0]),
    g: clamp(rgb.r * matrix[3] + rgb.g * matrix[4] + rgb.b * matrix[5] + offset[1]),
    b: clamp(rgb.r * matrix[6] + rgb.g * matrix[7] + rgb.b * matrix[8] + offset[2])
  };
};

// Apply matrix transformation to image data in a vectorized way
// Processes all pixels in batch using TypedArray operations
const applyMatrixToImageData = (imageData: ImageData, matrix: number[], offset: number[]): void => {
  const { data } = imageData;
  const m = matrix;
  const o = offset;
  
  // Process all pixels in batch
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    // Skip transforming fully transparent pixels to preserve background
    if (alpha === 0) {
      continue;
    }
    
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Apply affine transformation: result = M * rgb + offset
    data[i] = clamp(r * m[0] + g * m[1] + b * m[2] + o[0]);
    data[i + 1] = clamp(r * m[3] + g * m[4] + b * m[5] + o[1]);
    data[i + 2] = clamp(r * m[6] + g * m[7] + b * m[8] + o[2]);
    // Alpha channel unchanged
  }
};

const applyHue = (rgb: RGB, value: number): RGB => {
  const matrix = buildHueMatrix(value);
  return applyMatrix(rgb, matrix);
};

export function ImageCanvas({ image, pipeline, onSelectInstance, selectedInstanceId, brightness, contrast, saturation, hue, whites = 0, blacks = 0, linearSaturation = false, vibrance = 0, transformOrder, enableInspector = true, onPixelSelect, onSelectConvAnalysis, previewOriginal = false, dechanneled = false }: ImageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rChannelRef = useRef<HTMLCanvasElement>(null);
  const gChannelRef = useRef<HTMLCanvasElement>(null);
  const bChannelRef = useRef<HTMLCanvasElement>(null);
  const [inspectorData, setInspectorData] = useState<InspectorData | null>(null);
  const originalImageDataRef = useRef<ImageData | null>(null);

  const getTransformValue = (type: TransformationType): number => {
    switch (type) {
      case 'brightness': return brightness;
      case 'contrast': return contrast;
      case 'saturation': return saturation;
      case 'hue': return hue;
      case 'whites': return whites;
      case 'blacks': return blacks;
    }
  };

  const applyTransformation = (rgb: RGB, type: TransformationType): RGB => {
    const value = getTransformValue(type);
    switch (type) {
      case 'brightness': return applyBrightness(rgb, value);
      case 'contrast': return applyContrast(rgb, value);
      case 'saturation': return linearSaturation
        ? applySaturationLinear(rgb, value)
        : applySaturation(rgb, value);
      case 'vibrance': return linearSaturation
        ? applyVibranceLinear(rgb, vibrance ?? 0)
        : applyVibrance(rgb, vibrance ?? 0);
      case 'hue': return applyHue(rgb, value);
      case 'whites': return applyWhites(rgb, value);
      case 'blacks': return applyBlacks(rgb, value);
    }
  };

  useEffect(() => {
    if (!canvasRef.current || !image || dechanneled) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    // Set intrinsic canvas size to image pixels; CSS will scale to fit container
    canvas.width = image.width;
    canvas.height = image.height;

    // Clear and draw original image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;

    // Store original image data for inspection (refresh per image/params)
    originalImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // If showing original, skip applying transforms (canvas already has original drawn)
    if (previewOriginal) {
      return;
    }

    if (!pipeline) {
      // Legacy path using transformOrder
    type Step = { type: TransformationType; value: number } | { type: 'vibrance'; value: number };
      const steps: Step[] = transformOrder.map(t => ({ type: t, value: getTransformValue(t) })) as Step[];
    let i = 0;
    while (i < steps.length) {
      const matrixBatch: Array<{ matrix: number[]; offset: number[] } > = [];
      let batchEnd = i;
      while (batchEnd < steps.length) {
        const s = steps[batchEnd];
        const stype = s.type as TransformationType;
        const sval = (s as any).value as number;
        const isPerPixel = stype === 'vibrance' || stype === 'whites' || stype === 'blacks' || (stype === 'saturation' && linearSaturation);
        if (isPerPixel) break;
        if (stype === 'brightness') matrixBatch.push(buildBrightnessMatrix(sval));
        else if (stype === 'contrast') matrixBatch.push(buildContrastMatrix(sval));
        else if (stype === 'saturation') matrixBatch.push({ matrix: buildSaturationMatrix(sval), offset: [0,0,0] });
        else if (stype === 'hue') matrixBatch.push({ matrix: buildHueMatrix(sval), offset: [0,0,0] });
        batchEnd++;
      }
      if (matrixBatch.length > 0) {
        const composed = composeAffineTransforms(matrixBatch);
        applyMatrixToImageData(imageData, composed.matrix, composed.offset);
        i = batchEnd;
      } else {
        const s = steps[i];
        const stype = s.type as TransformationType;
        const sval = (s as any).value as number;
        for (let j = 0; j < data.length; j += 4) {
          const alpha = data[j + 3];
          if (alpha === 0) continue;
          const rgb: RGB = { r: data[j], g: data[j+1], b: data[j+2] };
          let transformed: RGB = rgb;
          if (stype === 'vibrance') {
            transformed = linearSaturation ? applyVibranceLinear(rgb, sval) : applyVibrance(rgb, sval);
          } else if (stype === 'saturation') {
            transformed = applySaturationLinear(rgb, sval);
          } else if (stype === 'whites') {
            transformed = applyWhites(rgb, sval);
          } else if (stype === 'blacks') {
            transformed = applyBlacks(rgb, sval);
          }
          data[j] = transformed.r;
          data[j+1] = transformed.g;
          data[j+2] = transformed.b;
        }
        i++;
        }
      }
    } else {
      // Instance-based path, including convolution-backed adjustments
      // Reverse pipeline so bottom item (brightness, last in array) is applied first
      for (const inst of [...pipeline].reverse()) {
        if (!inst.enabled) continue;
        if (inst.kind === 'brightness' || inst.kind === 'contrast' || inst.kind === 'saturation' || inst.kind === 'hue' || inst.kind === 'vibrance' || inst.kind === 'whites' || inst.kind === 'blacks') {
          const kind = inst.kind;
          if (kind === 'brightness' || kind === 'contrast' || (kind === 'saturation' && !linearSaturation) || kind === 'hue') {
            // matrix-friendly; compose single
            const batch: Array<{ matrix: number[]; offset: number[] }> = [];
            if (kind === 'brightness') batch.push(buildBrightnessMatrix((inst.params as { value: number }).value));
            if (kind === 'contrast') batch.push(buildContrastMatrix((inst.params as { value: number }).value));
            if (kind === 'saturation' && !linearSaturation) batch.push({ matrix: buildSaturationMatrix((inst.params as { value: number }).value), offset: [0,0,0] });
            if (kind === 'hue') batch.push({ matrix: buildHueMatrix((inst.params as { hue: number }).hue), offset: [0,0,0] });
            const composed = composeAffineTransforms(batch);
            applyMatrixToImageData(imageData, composed.matrix, composed.offset);
          } else {
            // per-pixel
            const sval = kind === 'vibrance' ? (inst.params as { vibrance: number }).vibrance : (inst.params as { value: number }).value;
            for (let j = 0; j < data.length; j += 4) {
              const alpha = data[j + 3];
              if (alpha === 0) continue;
              const rgb: RGB = { r: data[j], g: data[j+1], b: data[j+2] };
              let transformed: RGB = rgb;
              if (kind === 'vibrance') transformed = linearSaturation ? applyVibranceLinear(rgb, sval) : applyVibrance(rgb, sval);
              if (kind === 'saturation') transformed = applySaturationLinear(rgb, sval);
              if (kind === 'whites') transformed = applyWhites(rgb, sval);
              if (kind === 'blacks') transformed = applyBlacks(rgb, sval);
              data[j] = transformed.r;
              data[j+1] = transformed.g;
              data[j+2] = transformed.b;
            }
          }
        } else if (inst.kind === 'blur') {
          const p = inst.params as BlurParams;
          const out = cpuConvolutionBackend.blur(imageData, p);
          // swap buffers
          for (let j = 0; j < data.length; j++) data[j] = out.data[j];
        } else if (inst.kind === 'sharpen') {
          const p = inst.params as SharpenParams;
          const out = cpuConvolutionBackend.sharpen(imageData, p);
          for (let j = 0; j < data.length; j++) data[j] = out.data[j];
        } else if (inst.kind === 'edge') {
          const p = inst.params as EdgeParams;
          const out = cpuConvolutionBackend.edge(imageData, p);
          for (let j = 0; j < data.length; j++) data[j] = out.data[j];
        } else if (inst.kind === 'denoise') {
          const p = inst.params as DenoiseParams;
          const out = cpuConvolutionBackend.denoise(imageData, p);
          for (let j = 0; j < data.length; j++) data[j] = out.data[j];
        } else if (inst.kind === 'customConv') {
          const p = inst.params as CustomConvParams;
          const out = cpuConvolutionBackend.customConv(imageData, p);
          for (let j = 0; j < data.length; j++) data[j] = out.data[j];
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [image, pipeline, brightness, contrast, saturation, hue, whites, blacks, linearSaturation, vibrance, transformOrder, previewOriginal, dechanneled]);

  // Render dechanneled view (3 RGB channel panels)
  useEffect(() => {
    if (!dechanneled || !image || !rChannelRef.current || !gChannelRef.current || !bChannelRef.current) return;

    const rCanvas = rChannelRef.current;
    const gCanvas = gChannelRef.current;
    const bCanvas = bChannelRef.current;
    const rCtx = rCanvas.getContext("2d", { willReadFrequently: true });
    const gCtx = gCanvas.getContext("2d", { willReadFrequently: true });
    const bCtx = bCanvas.getContext("2d", { willReadFrequently: true });
    if (!rCtx || !gCtx || !bCtx) return;

    // Set canvas sizes
    rCanvas.width = image.width;
    rCanvas.height = image.height;
    gCanvas.width = image.width;
    gCanvas.height = image.height;
    bCanvas.width = image.width;
    bCanvas.height = image.height;

    // Draw original image to a temporary canvas to get processed image data
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = image.width;
    tempCanvas.height = image.height;
    const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
    if (!tempCtx) return;

    tempCtx.drawImage(image, 0, 0);
    let imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const { data } = imageData;

    // Apply transformations if not previewing original
    if (!previewOriginal) {
      if (!pipeline) {
        // Legacy path using transformOrder
        type Step = { type: TransformationType; value: number } | { type: 'vibrance'; value: number };
        const steps: Step[] = transformOrder.map(t => ({ type: t, value: getTransformValue(t) })) as Step[];
        let i = 0;
        while (i < steps.length) {
          const matrixBatch: Array<{ matrix: number[]; offset: number[] } > = [];
          let batchEnd = i;
          while (batchEnd < steps.length) {
            const s = steps[batchEnd];
            const stype = s.type as TransformationType;
            const sval = (s as any).value as number;
            const isPerPixel = stype === 'vibrance' || stype === 'whites' || stype === 'blacks' || (stype === 'saturation' && linearSaturation);
            if (isPerPixel) break;
            if (stype === 'brightness') matrixBatch.push(buildBrightnessMatrix(sval));
            else if (stype === 'contrast') matrixBatch.push(buildContrastMatrix(sval));
            else if (stype === 'saturation') matrixBatch.push({ matrix: buildSaturationMatrix(sval), offset: [0,0,0] });
            else if (stype === 'hue') matrixBatch.push({ matrix: buildHueMatrix(sval), offset: [0,0,0] });
            batchEnd++;
          }
          if (matrixBatch.length > 0) {
            const composed = composeAffineTransforms(matrixBatch);
            applyMatrixToImageData(imageData, composed.matrix, composed.offset);
            i = batchEnd;
          } else {
            const s = steps[i];
            const stype = s.type as TransformationType;
            const sval = (s as any).value as number;
            for (let j = 0; j < data.length; j += 4) {
              const alpha = data[j + 3];
              if (alpha === 0) continue;
              const rgb: RGB = { r: data[j], g: data[j+1], b: data[j+2] };
              let transformed: RGB = rgb;
              if (stype === 'vibrance') {
                transformed = linearSaturation ? applyVibranceLinear(rgb, sval) : applyVibrance(rgb, sval);
              } else if (stype === 'saturation') {
                transformed = applySaturationLinear(rgb, sval);
              } else if (stype === 'whites') {
                transformed = applyWhites(rgb, sval);
              } else if (stype === 'blacks') {
                transformed = applyBlacks(rgb, sval);
              }
              data[j] = transformed.r;
              data[j+1] = transformed.g;
              data[j+2] = transformed.b;
            }
            i++;
          }
        }
      } else {
        // Instance-based path
        for (const inst of pipeline) {
          if (!inst.enabled) continue;
          if (inst.kind === 'brightness' || inst.kind === 'contrast' || inst.kind === 'saturation' || inst.kind === 'hue' || inst.kind === 'vibrance' || inst.kind === 'whites' || inst.kind === 'blacks') {
            const kind = inst.kind;
            if (kind === 'brightness' || kind === 'contrast' || (kind === 'saturation' && !linearSaturation) || kind === 'hue') {
              const batch: Array<{ matrix: number[]; offset: number[] }> = [];
              if (kind === 'brightness') batch.push(buildBrightnessMatrix((inst.params as { value: number }).value));
              if (kind === 'contrast') batch.push(buildContrastMatrix((inst.params as { value: number }).value));
              if (kind === 'saturation' && !linearSaturation) batch.push({ matrix: buildSaturationMatrix((inst.params as { value: number }).value), offset: [0,0,0] });
              if (kind === 'hue') batch.push({ matrix: buildHueMatrix((inst.params as { hue: number }).hue), offset: [0,0,0] });
              const composed = composeAffineTransforms(batch);
              applyMatrixToImageData(imageData, composed.matrix, composed.offset);
            } else {
              const sval = kind === 'vibrance' ? (inst.params as { vibrance: number }).vibrance : (inst.params as { value: number }).value;
              for (let j = 0; j < data.length; j += 4) {
                const alpha = data[j + 3];
                if (alpha === 0) continue;
                const rgb: RGB = { r: data[j], g: data[j+1], b: data[j+2] };
                let transformed: RGB = rgb;
                if (kind === 'vibrance') transformed = linearSaturation ? applyVibranceLinear(rgb, sval) : applyVibrance(rgb, sval);
                if (kind === 'saturation') transformed = applySaturationLinear(rgb, sval);
                if (kind === 'whites') transformed = applyWhites(rgb, sval);
                if (kind === 'blacks') transformed = applyBlacks(rgb, sval);
                data[j] = transformed.r;
                data[j+1] = transformed.g;
                data[j+2] = transformed.b;
              }
            }
          } else if (inst.kind === 'blur') {
            const p = inst.params as BlurParams;
            const out = cpuConvolutionBackend.blur(imageData, p);
            for (let j = 0; j < data.length; j++) data[j] = out.data[j];
          } else if (inst.kind === 'sharpen') {
            const p = inst.params as SharpenParams;
            const out = cpuConvolutionBackend.sharpen(imageData, p);
            for (let j = 0; j < data.length; j++) data[j] = out.data[j];
          } else if (inst.kind === 'edge') {
            const p = inst.params as EdgeParams;
            const out = cpuConvolutionBackend.edge(imageData, p);
            for (let j = 0; j < data.length; j++) data[j] = out.data[j];
          } else if (inst.kind === 'denoise') {
            const p = inst.params as DenoiseParams;
            const out = cpuConvolutionBackend.denoise(imageData, p);
            for (let j = 0; j < data.length; j++) data[j] = out.data[j];
          } else if (inst.kind === 'customConv') {
            const p = inst.params as CustomConvParams;
            const out = cpuConvolutionBackend.customConv(imageData, p);
            for (let j = 0; j < data.length; j++) data[j] = out.data[j];
          }
        }
      }
    }

    // Create channel-specific image data
    const rData = rCtx.createImageData(image.width, image.height);
    const gData = gCtx.createImageData(image.width, image.height);
    const bData = bCtx.createImageData(image.width, image.height);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // Red channel: show R with red tint but brighter (R, R*0.3, R*0.3)
      rData.data[i] = r;
      rData.data[i + 1] = Math.round(r * 0.3);
      rData.data[i + 2] = Math.round(r * 0.3);
      rData.data[i + 3] = a;

      // Green channel: show G with green tint but brighter (G*0.3, G, G*0.3)
      gData.data[i] = Math.round(g * 0.3);
      gData.data[i + 1] = g;
      gData.data[i + 2] = Math.round(g * 0.3);
      gData.data[i + 3] = a;

      // Blue channel: show B with blue tint but brighter (B*0.3, B*0.3, B)
      bData.data[i] = Math.round(b * 0.3);
      bData.data[i + 1] = Math.round(b * 0.3);
      bData.data[i + 2] = b;
      bData.data[i + 3] = a;
    }

    rCtx.putImageData(rData, 0, 0);
    gCtx.putImageData(gData, 0, 0);
    bCtx.putImageData(bData, 0, 0);
  }, [dechanneled, image, pipeline, brightness, contrast, saturation, hue, whites, blacks, linearSaturation, vibrance, transformOrder, previewOriginal]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!enableInspector) return;
    const canvas = canvasRef.current;
    if (!canvas || !originalImageDataRef.current) return;

    const rect = canvas.getBoundingClientRect();

    // Compute displayed image area within the canvas element (object-contain letterboxing)
    const containerWidth = rect.width;
    const containerHeight = rect.height;
    const imgAspect = canvas.width / canvas.height;
    const containerAspect = containerWidth / containerHeight;

    let drawWidth: number;
    let drawHeight: number;
    let offsetX: number;
    let offsetY: number;

    if (containerAspect > imgAspect) {
      // Limited by height, horizontal letterboxing
      drawHeight = containerHeight;
      drawWidth = drawHeight * imgAspect;
      offsetX = (containerWidth - drawWidth) / 2;
      offsetY = 0;
    } else {
      // Limited by width, vertical letterboxing
      drawWidth = containerWidth;
      drawHeight = drawWidth / imgAspect;
      offsetX = 0;
      offsetY = (containerHeight - drawHeight) / 2;
    }

    const relX = e.clientX - rect.left - offsetX;
    const relY = e.clientY - rect.top - offsetY;

    // If cursor is in the letterboxed area, hide inspector
    if (relX < 0 || relY < 0 || relX >= drawWidth || relY >= drawHeight) {
      setInspectorData(null);
      return;
    }

    const scaleX = canvas.width / drawWidth;
    const scaleY = canvas.height / drawHeight;

    const x = Math.floor(relX * scaleX);
    const y = Math.floor(relY * scaleY);

    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
      setInspectorData(null);
      return;
    }

    const index = (y * canvas.width + x) * 4;
    const originalData = originalImageDataRef.current.data;

    const originalRGB: RGB = {
      r: originalData[index],
      g: originalData[index + 1],
      b: originalData[index + 2],
    };

    // Calculate step-by-step transformations.
    // Legacy map for existing UI:
    const stepByStep: Record<TransformationType, RGB> = {} as Record<TransformationType, RGB>;
    let rgb = originalRGB;
    const activeOrder = pipeline ? (pipeline.filter(p => p.enabled).map(p => (p.kind as any) as TransformationType).reverse()) : transformOrder;
    for (const transformType of activeOrder) {
      rgb = applyTransformation(rgb, transformType);
      stepByStep[transformType] = { ...rgb };
    }

    // New steps array for instance-based pipeline
    let steps: { id: string; kind: FilterKind; inputRGB: RGB; outputRGB: RGB }[] | undefined = undefined;
    if (pipeline) {
      steps = [];
      let color = originalRGB;
      // Reverse pipeline so bottom item (brightness, last in array) is applied first
      for (const inst of [...pipeline].reverse()) {
        if (!inst.enabled) continue;
        const inputRGB = color;
        let output: RGB = inputRGB;
        if (inst.kind === 'brightness') {
          const v = (inst.params as { value: number }).value;
          output = applyBrightness(inputRGB, v);
        } else if (inst.kind === 'contrast') {
          const v = (inst.params as { value: number }).value;
          output = applyContrast(inputRGB, v);
        } else if (inst.kind === 'saturation') {
          const v = (inst.params as { value: number }).value;
          output = linearSaturation ? applySaturationLinear(inputRGB, v) : applySaturation(inputRGB, v);
        } else if (inst.kind === 'vibrance') {
          const v = (inst.params as { vibrance: number }).vibrance;
          output = linearSaturation ? applyVibranceLinear(inputRGB, v) : applyVibrance(inputRGB, v);
        } else if (inst.kind === 'hue') {
          const deg = (inst.params as { hue: number }).hue;
          output = applyHue(inputRGB, deg);
        } else if (inst.kind === 'whites') {
          const v = (inst.params as { value: number }).value;
          output = applyWhites(inputRGB, v);
        } else if (inst.kind === 'blacks') {
          const v = (inst.params as { value: number }).value;
          output = applyBlacks(inputRGB, v);
        } else if (inst.kind === 'blur') {
          const p = inst.params as BlurParams;
          const kernel = p.kind === 'gaussian' ? gaussianKernel(p.size, p.sigma) : boxKernel(p.size);
          const [r, g, b] = convolveAtPixel(originalImageDataRef.current as ImageData, x, y, kernel, { padding: p.padding ?? 'edge', perChannel: true });
          output = { r, g, b };
        } else if (inst.kind === 'sharpen') {
          const p = inst.params as SharpenParams;
          const kernel = p.kernel ?? unsharpKernel(p.amount, p.size);
          const [r, g, b] = convolveAtPixel(originalImageDataRef.current as ImageData, x, y, kernel, { padding: p.padding ?? 'edge', perChannel: true });
          output = { r, g, b };
        } else if (inst.kind === 'edge') {
          const p = inst.params as EdgeParams;
          const { kx, ky } = p.operator === 'sobel' ? sobelKernels() : prewittKernels();
          const [rx, gx, bx] = convolveAtPixel(originalImageDataRef.current as ImageData, x, y, kx, { padding: p.padding ?? 'edge', perChannel: true });
          const [ry, gy, by] = convolveAtPixel(originalImageDataRef.current as ImageData, x, y, ky, { padding: p.padding ?? 'edge', perChannel: true });
          if (p.combine === 'x') output = { r: Math.abs(rx), g: Math.abs(gx), b: Math.abs(bx) };
          else if (p.combine === 'y') output = { r: Math.abs(ry), g: Math.abs(gy), b: Math.abs(by) };
          else output = { r: Math.hypot(rx, ry), g: Math.hypot(gx, gy), b: Math.hypot(bx, by) } as RGB;
        } else if (inst.kind === 'customConv') {
          const p = inst.params as CustomConvParams;
          const [r, g, b] = convolveAtPixel(originalImageDataRef.current as ImageData, x, y, p.kernel, { padding: p.padding ?? 'edge', perChannel: true });
          output = { r, g, b };
        } else if (inst.kind === 'denoise') {
          const p = inst.params as DenoiseParams;
          if (p.kind === 'mean') {
            const kernel = boxKernel(p.size);
            const [r, g, b] = convolveAtPixel(originalImageDataRef.current as ImageData, x, y, kernel, { padding: p.padding ?? 'edge', perChannel: true });
            output = { r, g, b };
          } else {
            // median at pixel
            const src = originalImageDataRef.current as ImageData;
            const half = Math.floor(p.size / 2);
            const pad: 'zero' | 'reflect' | 'edge' = p.padding ?? 'edge';
            const valuesR: number[] = [];
            const valuesG: number[] = [];
            const valuesB: number[] = [];
            const padIndex = (i: number, limit: number): number => {
              if (i >= 0 && i < limit) return i;
              if (pad === 'zero') return -1;
              if (pad === 'edge') return i < 0 ? 0 : limit - 1;
              let idx = i;
              if (idx < 0) idx = -idx - 1;
              const period = (limit - 1) * 2;
              idx = idx % period;
              if (idx >= limit) idx = period - idx;
              return idx;
            };
            for (let ky = -half; ky <= half; ky++) {
              for (let kx = -half; kx <= half; kx++) {
                const sx = padIndex(x + kx, src.width);
                const sy = padIndex(y + ky, src.height);
                if (sx === -1 || sy === -1) { valuesR.push(0); valuesG.push(0); valuesB.push(0); continue; }
                const idx = (sy * src.width + sx) * 4;
                valuesR.push(src.data[idx]);
                valuesG.push(src.data[idx + 1]);
                valuesB.push(src.data[idx + 2]);
              }
            }
            valuesR.sort((a,b)=>a-b); valuesG.sort((a,b)=>a-b); valuesB.sort((a,b)=>a-b);
            const m = Math.floor(valuesR.length/2);
            output = { r: valuesR[m], g: valuesG[m], b: valuesB[m] } as RGB;
          }
        }
        steps.push({ id: inst.id, kind: inst.kind, inputRGB, outputRGB: output });
        color = output;
      }
      rgb = color;
    }

    // determine active convolution-backed instance for inspector context (only if selectedInstanceId points to a convolution layer)
    let activeConv: InspectorData['activeConv'] | undefined = undefined;
    if (pipeline && selectedInstanceId) {
      const selectedConv = pipeline.find(p => p.id === selectedInstanceId && p.enabled && (p.kind === 'blur' || p.kind === 'sharpen' || p.kind === 'edge' || p.kind === 'denoise' || p.kind === 'customConv'));
      if (selectedConv) {
        if (selectedConv.kind === 'blur') {
          const p = selectedConv.params as BlurParams;
          const kernel = p.kind === 'gaussian' ? gaussianKernel(p.size, p.sigma) : boxKernel(p.size);
          activeConv = { kind: 'blur', kernel, padding: (p.padding ?? 'edge') };
        } else if (selectedConv.kind === 'sharpen') {
          const p = selectedConv.params as SharpenParams;
          const kernel = p.kernel ?? unsharpKernel(p.amount, p.size);
          activeConv = { kind: 'sharpen', kernel, padding: (p.padding ?? 'edge') };
        } else if (selectedConv.kind === 'edge') {
          const p = selectedConv.params as EdgeParams;
          const ek = p.operator === 'sobel' ? sobelKernels() : prewittKernels();
          activeConv = { kind: 'edge', edgeKernels: ek, padding: (p.padding ?? 'edge') };
        } else if (selectedConv.kind === 'denoise') {
          const p = selectedConv.params as DenoiseParams;
          const kernel = p.kind === 'mean' ? boxKernel(p.size) : undefined;
          activeConv = { kind: 'denoise', kernel, padding: (p.padding ?? 'edge') };
        } else if (selectedConv.kind === 'customConv') {
          const p = selectedConv.params as CustomConvParams;
          activeConv = { kind: 'customConv', kernel: p.kernel, padding: (p.padding ?? 'edge') };
        }
      }
    }

    // Build neighborhood window pixels for active convolution-backed instance
    let convWindow: InspectorData['convWindow'] = undefined;
    if (activeConv && originalImageDataRef.current) {
      const src = originalImageDataRef.current;
      const pad: 'zero' | 'reflect' | 'edge' = activeConv.padding;
      const size = activeConv.kernel ? activeConv.kernel.length : (activeConv.edgeKernels ? 3 : 0);
      if (size > 0) {
        const half = Math.floor(size / 2);
        const padIndexLocal = (i: number, limit: number): number => {
          if (i >= 0 && i < limit) return i;
          if (pad === 'zero') return -1;
          if (pad === 'edge') return i < 0 ? 0 : limit - 1;
          let idx = i;
          if (idx < 0) idx = -idx - 1;
          const period = (limit - 1) * 2;
          idx = idx % period;
          if (idx >= limit) idx = period - idx;
          return idx;
        };
        const rows: { r: number; g: number; b: number }[][] = [];
        for (let wy = -half; wy <= half; wy++) {
          const row: { r: number; g: number; b: number }[] = [];
          for (let wx = -half; wx <= half; wx++) {
            const sx = padIndexLocal(x + wx, src.width);
            const sy = padIndexLocal(y + wy, src.height);
            if (sx === -1 || sy === -1) { row.push({ r: 0, g: 0, b: 0 }); continue; }
            const idxPix = (sy * src.width + sx) * 4;
            row.push({ r: src.data[idxPix], g: src.data[idxPix + 1], b: src.data[idxPix + 2] });
          }
          rows.push(row);
        }
        convWindow = { size, pixels: rows };
      }
    }

    setInspectorData({
      x,
      y,
      originalRGB,
      transformedRGB: rgb,  // Final is already clamped
      stepByStep,
      transformOrder: activeOrder,
      cursorX: e.clientX,
      cursorY: e.clientY,
      steps,
      activeConv,
      convWindow
    });
  };

  const handleMouseLeave = () => {
    setInspectorData(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !originalImageDataRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    // Mirror the same letterboxing-aware mapping used in hover
    const containerWidth = rect.width;
    const containerHeight = rect.height;
    const imgAspect = canvas.width / canvas.height;
    const containerAspect = containerWidth / containerHeight;

    let drawWidth: number;
    let drawHeight: number;
    let offsetX: number;
    let offsetY: number;

    if (containerAspect > imgAspect) {
      drawHeight = containerHeight;
      drawWidth = drawHeight * imgAspect;
      offsetX = (containerWidth - drawWidth) / 2;
      offsetY = 0;
    } else {
      drawWidth = containerWidth;
      drawHeight = drawWidth / imgAspect;
      offsetX = 0;
      offsetY = (containerHeight - drawHeight) / 2;
    }

    const relX = e.clientX - rect.left - offsetX;
    const relY = e.clientY - rect.top - offsetY;

    if (relX < 0 || relY < 0 || relX >= drawWidth || relY >= drawHeight) return;

    const scaleX = canvas.width / drawWidth;
    const scaleY = canvas.height / drawHeight;

    const x = Math.floor(relX * scaleX);
    const y = Math.floor(relY * scaleY);

    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return;

    const index = (y * canvas.width + x) * 4;
    const originalData = originalImageDataRef.current.data;
    const rgb: RGB = {
      r: originalData[index],
      g: originalData[index + 1],
      b: originalData[index + 2],
    };
    onPixelSelect?.(rgb);

    // Build convolution analysis for selected conv instance (or last conv)
    if (pipeline && onSelectConvAnalysis) {
      const targetConv = (selectedInstanceId && pipeline.find(p => p.id === selectedInstanceId && (p.kind === 'blur' || p.kind === 'sharpen' || p.kind === 'edge' || p.kind === 'denoise') && p.enabled))
        || [...pipeline].reverse().find(p => p.enabled && (p.kind === 'blur' || p.kind === 'sharpen' || p.kind === 'edge' || p.kind === 'denoise'))
      ;
      if (targetConv) {
        const padIndexLocal = (i: number, limit: number, pad: 'zero'|'reflect'|'edge'): number => {
          if (i >= 0 && i < limit) return i;
          if (pad === 'zero') return -1;
          if (pad === 'edge') return i < 0 ? 0 : limit - 1;
          let idx = i;
          if (idx < 0) idx = -idx - 1;
          const period = (limit - 1) * 2;
          idx = idx % period;
          if (idx >= limit) idx = period - idx;
          return idx;
        };
        const src = originalImageDataRef.current;
        if (targetConv.kind === 'blur') {
          const p = targetConv.params as BlurParams;
          const kernel = p.kind === 'gaussian' ? gaussianKernel(p.size, p.sigma) : boxKernel(p.size);
          const size = kernel.length;
          const half = Math.floor(size / 2);
          const window: { r: number; g: number; b: number }[][] = [];
          const pr: number[][] = [], pg: number[][] = [], pb: number[][] = [];
          let sr = 0, sg = 0, sb = 0;
          for (let wy = -half, ry = 0; ry < size; wy++, ry++) {
            const row: { r: number; g: number; b: number }[] = [];
            pr[ry] = []; pg[ry] = []; pb[ry] = [];
            for (let wx = -half, rx = 0; rx < size; wx++, rx++) {
              const sx = padIndexLocal(x + wx, src.width, p.padding ?? 'edge');
              const sy = padIndexLocal(y + wy, src.height, p.padding ?? 'edge');
              const w = kernel[ry][rx];
              if (sx === -1 || sy === -1) {
                row.push({ r: 0, g: 0, b: 0 });
                pr[ry][rx] = 0; pg[ry][rx] = 0; pb[ry][rx] = 0;
                continue;
              }
              const idx2 = (sy * src.width + sx) * 4;
              const R = src.data[idx2], G = src.data[idx2 + 1], B = src.data[idx2 + 2];
              row.push({ r: R, g: G, b: B });
              pr[ry][rx] = R * w; pg[ry][rx] = G * w; pb[ry][rx] = B * w;
              sr += pr[ry][rx]; sg += pg[ry][rx]; sb += pb[ry][rx];
            }
            window.push(row);
          }
          onSelectConvAnalysis({ kind: 'blur', size, kernel, window, products: { r: pr, g: pg, b: pb }, sums: { r: sr, g: sg, b: sb } });
        } else if (targetConv.kind === 'sharpen') {
          const p = targetConv.params as SharpenParams;
          const kernel = p.kernel ?? unsharpKernel(p.amount, p.size);
          const size = kernel.length;
          const half = Math.floor(size / 2);
          const window: { r: number; g: number; b: number }[][] = [];
          const pr: number[][] = [], pg: number[][] = [], pb: number[][] = [];
          let sr = 0, sg = 0, sb = 0;
          for (let wy = -half, ry = 0; ry < size; wy++, ry++) {
            const row: { r: number; g: number; b: number }[] = [];
            pr[ry] = []; pg[ry] = []; pb[ry] = [];
            for (let wx = -half, rx = 0; rx < size; wx++, rx++) {
              const sx = padIndexLocal(x + wx, src.width, p.padding ?? 'edge');
              const sy = padIndexLocal(y + wy, src.height, p.padding ?? 'edge');
              const w = kernel[ry][rx];
              if (sx === -1 || sy === -1) {
                row.push({ r: 0, g: 0, b: 0 });
                pr[ry][rx] = 0; pg[ry][rx] = 0; pb[ry][rx] = 0;
                continue;
              }
              const idx2 = (sy * src.width + sx) * 4;
              const R = src.data[idx2], G = src.data[idx2 + 1], B = src.data[idx2 + 2];
              row.push({ r: R, g: G, b: B });
              pr[ry][rx] = R * w; pg[ry][rx] = G * w; pb[ry][rx] = B * w;
              sr += pr[ry][rx]; sg += pg[ry][rx]; sb += pb[ry][rx];
            }
            window.push(row);
          }
          onSelectConvAnalysis({ kind: 'sharpen', size, kernel, window, products: { r: pr, g: pg, b: pb }, sums: { r: sr, g: sg, b: sb } });
        } else if (targetConv.kind === 'edge') {
          const p = targetConv.params as EdgeParams;
          const { kx, ky } = p.operator === 'sobel' ? sobelKernels() : prewittKernels();
          const size = 3;
          const half = 1;
          const window: { r: number; g: number; b: number }[][] = [];
          const px: number[][] = [], py: number[][] = [];
          for (let wy = -half, ry = 0; ry < size; wy++, ry++) {
            const row: { r: number; g: number; b: number }[] = [];
            px[ry] = []; py[ry] = [];
            for (let wx = -half, rx = 0; rx < size; wx++, rx++) {
              const sx = padIndexLocal(x + wx, src.width, p.padding ?? 'edge');
              const sy = padIndexLocal(y + wy, src.height, p.padding ?? 'edge');
              const wxv = kx[ry][rx], wyv = ky[ry][rx];
              if (sx === -1 || sy === -1) {
                row.push({ r: 0, g: 0, b: 0 });
                px[ry][rx] = 0; py[ry][rx] = 0;
                continue;
              }
              const idx2 = (sy * src.width + sx) * 4;
              const R = src.data[idx2], G = src.data[idx2 + 1], B = src.data[idx2 + 2];
              row.push({ r: R, g: G, b: B });
              const gray = 0.299 * R + 0.587 * G + 0.114 * B;
              px[ry][rx] = gray * wxv;
              py[ry][rx] = gray * wyv;
            }
            window.push(row);
          }
          onSelectConvAnalysis({ kind: 'edge', size, edgeKernels: { kx, ky }, window, products: { x: px, y: py } });
        } else if (targetConv.kind === 'denoise') {
          const p = targetConv.params as DenoiseParams;
          if (p.kind === 'mean') {
            const kernel = boxKernel(p.size);
            const size = kernel.length;
            const half = Math.floor(size / 2);
            const window: { r: number; g: number; b: number }[][] = [];
            const pr: number[][] = [], pg: number[][] = [], pb: number[][] = [];
            let sr = 0, sg = 0, sb = 0;
            for (let wy = -half, ry = 0; ry < size; wy++, ry++) {
              const row: { r: number; g: number; b: number }[] = [];
              pr[ry] = []; pg[ry] = []; pb[ry] = [];
              for (let wx = -half, rx = 0; rx < size; wx++, rx++) {
                const sx = padIndexLocal(x + wx, src.width, p.padding ?? 'edge');
                const sy = padIndexLocal(y + wy, src.height, p.padding ?? 'edge');
                const w = kernel[ry][rx];
                if (sx === -1 || sy === -1) {
                  row.push({ r: 0, g: 0, b: 0 });
                  pr[ry][rx] = 0; pg[ry][rx] = 0; pb[ry][rx] = 0;
                  continue;
                }
                const idx2 = (sy * src.width + sx) * 4;
                const R = src.data[idx2], G = src.data[idx2 + 1], B = src.data[idx2 + 2];
                row.push({ r: R, g: G, b: B });
                pr[ry][rx] = R * w; pg[ry][rx] = G * w; pb[ry][rx] = B * w;
                sr += pr[ry][rx]; sg += pg[ry][rx]; sb += pb[ry][rx];
              }
              window.push(row);
            }
            onSelectConvAnalysis({ kind: 'denoise', size, kernel, window, products: { r: pr, g: pg, b: pb }, sums: { r: sr, g: sg, b: sb } });
          }
        }
      }
    }
  };

  if (dechanneled) {
    // Determine layout based on aspect ratio
    // Default to 3 columns (grid-cols-3), but use 1 column (grid-rows-3) if image is wide
    // and would fill the canvas horizontally
    const imgAspect = image ? image.width / image.height : 1;
    // Use 1 column (vertical layout) if image is very wide (aspect ratio > 2.5)
    // This means the image fills the canvas horizontally
    const useVerticalLayout = imgAspect > 2.5;

    return (
      <>
        <div className={`w-full h-full grid ${useVerticalLayout ? 'grid-rows-3' : 'grid-cols-3'} gap-2`}>
          <canvas
            ref={rChannelRef}
            className="w-full h-full object-contain rounded-lg border border-border"
          />
          <canvas
            ref={gChannelRef}
            className="w-full h-full object-contain rounded-lg border border-border"
          />
          <canvas
            ref={bChannelRef}
            className="w-full h-full object-contain rounded-lg border border-border"
          />
        </div>
      </>
    );
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain rounded-lg border border-border cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />
      {enableInspector && inspectorData && (
        <PixelInspector
          {...inspectorData}
          steps={inspectorData.steps}
          onSelectInstance={onSelectInstance}
          brightness={brightness}
          contrast={contrast}
          saturation={saturation}
          vibrance={vibrance}
          hue={hue}
          linearSaturation={linearSaturation}
        />
      )}
    </>
  );
}

