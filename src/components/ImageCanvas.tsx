import { useEffect, useRef, useState } from "react";
import { Matrix } from "ml-matrix";
import { PixelInspector } from "./PixelInspector";
import { TransformationType, RGB } from "@/types/transformations";

interface ImageCanvasProps {
  image: HTMLImageElement;
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  // When true, compute saturation in linear-light space instead of gamma-encoded sRGB
  linearSaturation?: boolean;
  // Additional chroma boost for low-saturation colors (0..1 typical)
  vibrance?: number;
  transformOrder: TransformationType[];
  // When true, show the pixel inspector overlay on hover
  enableInspector?: boolean;
  // Emit original pixel RGB when user clicks on the canvas
  onPixelSelect?: (rgb: RGB) => void;
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
}

const clamp = (val: number): number => Math.max(0, Math.min(255, val));

// Helper functions for matrix operations using ml-matrix library
// Convert flat array [m00, m01, m02, m10, m11, m12, m20, m21, m22] to Matrix instance
const flatToMatrix = (flat: number[]): Matrix => {
  return new Matrix([
    [flat[0], flat[1], flat[2]],
    [flat[3], flat[4], flat[5]],
    [flat[6], flat[7], flat[8]]
  ]);
};

// Convert Matrix instance to flat array
const matrixToFlat = (matrix: Matrix): number[] => {
  const rows = matrix.to2DArray();
  return [
    rows[0][0], rows[0][1], rows[0][2],
    rows[1][0], rows[1][1], rows[1][2],
    rows[2][0], rows[2][1], rows[2][2]
  ];
};

// Multiply two 3x3 matrices using dot product (equivalent to Python's @ operator)
// Uses ml-matrix's .mmul() method for explicit matrix multiplication
// Example: matrixMultiply(A, B) computes B @ A (matrix multiplication)
const matrixMultiply = (m1: number[], m2: number[]): number[] => {
  const M1 = flatToMatrix(m1);
  const M2 = flatToMatrix(m2);
  const result = M2.mmul(M1); // Explicit dot product: M2 @ M1 (like Python's @ operator)
  return matrixToFlat(result);
};

// Multiply 3x3 matrix by 3x1 vector using dot product (equivalent to Python's @ operator)
// Uses ml-matrix's .mmul() method for explicit matrix-vector multiplication
// Example: matrixVectorMultiply(M, v) computes M @ v (matrix-vector product)
const matrixVectorMultiply = (matrix: number[], vector: number[]): number[] => {
  const M = flatToMatrix(matrix);
  const v = new Matrix([[vector[0]], [vector[1]], [vector[2]]]);
  const result = M.mmul(v); // Explicit dot product: M @ v (like Python's @ operator)
  return [result.get(0, 0), result.get(1, 0), result.get(2, 0)];
};

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
  // Convert to linear-light
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

// Compose multiple affine transformations into a single matrix + offset
// For transformations that only have a matrix (no offset), pass offset: [0, 0, 0]
// Composition: if y = M2 * (M1 * x + o1) + o2, then y = (M2 * M1) * x + (M2 * o1 + o2)
// Uses explicit matrix multiplication (dot product) from ml-matrix library
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
  
  // Compose with each subsequent transformation using explicit matrix multiplication
  for (let i = 1; i < transforms.length; i++) {
    const M2 = transforms[i].matrix;
    const o2 = transforms[i].offset;
    
    // Multiply matrices using dot product: M_result = M2 @ M1 (equivalent to Python's @ operator)
    resultMatrix = matrixMultiply(resultMatrix, M2);
    
    // Transform previous offset through M2 using matrix-vector multiplication: M2 @ o1 + o2
    const transformedOffset = matrixVectorMultiply(M2, resultOffset);
    resultOffset = [
      transformedOffset[0] + o2[0],
      transformedOffset[1] + o2[1],
      transformedOffset[2] + o2[2]
    ];
  }
  
  return { matrix: resultMatrix, offset: resultOffset };
};

// Apply 3x3 matrix to RGB vector using explicit matrix-vector multiplication (dot product)
const applyMatrix = (rgb: RGB, matrix: number[]): RGB => {
  const result = matrixVectorMultiply(matrix, [rgb.r, rgb.g, rgb.b]);
  return {
    r: clamp(result[0]),
    g: clamp(result[1]),
    b: clamp(result[2])
  };
};

// Apply affine transformation (matrix + offset) to RGB vector using explicit matrix-vector multiplication
const applyAffineTransform = (rgb: RGB, matrix: number[], offset: number[]): RGB => {
  const result = matrixVectorMultiply(matrix, [rgb.r, rgb.g, rgb.b]);
  return {
    r: clamp(result[0] + offset[0]),
    g: clamp(result[1] + offset[1]),
    b: clamp(result[2] + offset[2])
  };
};

// Apply matrix transformation to image data in a vectorized way
// Processes all pixels in batch using TypedArray operations
// Uses explicit matrix-vector multiplication (dot product) from ml-matrix library
const applyMatrixToImageData = (imageData: ImageData, matrix: number[], offset: number[]): void => {
  const { data } = imageData;
  
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
    
    // Apply affine transformation using explicit matrix-vector multiplication: result = M @ rgb + offset
    const result = matrixVectorMultiply(matrix, [r, g, b]);
    data[i] = clamp(result[0] + offset[0]);
    data[i + 1] = clamp(result[1] + offset[1]);
    data[i + 2] = clamp(result[2] + offset[2]);
    // Alpha channel unchanged
  }
};

const applyHue = (rgb: RGB, value: number): RGB => {
  const matrix = buildHueMatrix(value);
  return applyMatrix(rgb, matrix);
};

export function ImageCanvas({ image, brightness, contrast, saturation, hue, linearSaturation = false, vibrance = 0, transformOrder, enableInspector = true, onPixelSelect }: ImageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [inspectorData, setInspectorData] = useState<InspectorData | null>(null);
  const originalImageDataRef = useRef<ImageData | null>(null);

  const getTransformValue = (type: TransformationType): number => {
    switch (type) {
      case 'brightness': return brightness;
      case 'contrast': return contrast;
      case 'saturation': return saturation;
      case 'hue': return hue;
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
    }
  };

  useEffect(() => {
    if (!canvasRef.current || !image) return;

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

    // Process transformations sequentially, batching consecutive matrix-compatible transforms
    // This maintains correct order when matrix and per-pixel transforms are interleaved
    let i = 0;
    while (i < transformOrder.length) {
      // Check if this and following transforms are matrix-compatible
      const matrixBatch: Array<{ matrix: number[]; offset: number[] }> = [];
      let batchEnd = i;
      
      while (batchEnd < transformOrder.length) {
        const batchType = transformOrder[batchEnd];
        const batchValue = getTransformValue(batchType);
        
        // Check if this transform can use matrix operations
        const isPerPixel = batchType === 'vibrance' || (batchType === 'saturation' && linearSaturation);
        
        if (isPerPixel) {
          // Stop batching when we hit a per-pixel transform
          break;
        }
        
        // Build matrix for this transform
        if (batchType === 'brightness') {
          matrixBatch.push(buildBrightnessMatrix(batchValue));
        } else if (batchType === 'contrast') {
          matrixBatch.push(buildContrastMatrix(batchValue));
        } else if (batchType === 'saturation') {
          // Gamma saturation uses matrix
          const satMatrix = buildSaturationMatrix(batchValue);
          matrixBatch.push({ matrix: satMatrix, offset: [0, 0, 0] });
        } else if (batchType === 'hue') {
          const hueMatrix = buildHueMatrix(batchValue);
          matrixBatch.push({ matrix: hueMatrix, offset: [0, 0, 0] });
        }
        
        batchEnd++;
      }
      
      // Apply batched matrix transforms if any
      if (matrixBatch.length > 0) {
        const composed = composeAffineTransforms(matrixBatch);
        applyMatrixToImageData(imageData, composed.matrix, composed.offset);
        i = batchEnd;
      } else {
        // Apply per-pixel transform
        const perPixelType = transformOrder[i];
        const perPixelValue = getTransformValue(perPixelType);
        
        for (let j = 0; j < data.length; j += 4) {
          const alpha = data[j + 3];
          if (alpha === 0) continue;
          
          const rgb: RGB = {
            r: data[j],
            g: data[j + 1],
            b: data[j + 2]
          };
          
          let transformed: RGB;
          if (perPixelType === 'vibrance') {
            transformed = linearSaturation
              ? applyVibranceLinear(rgb, vibrance ?? 0)
              : applyVibrance(rgb, vibrance ?? 0);
          } else if (perPixelType === 'saturation') {
            transformed = applySaturationLinear(rgb, perPixelValue);
          } else {
            transformed = rgb; // Shouldn't happen
          }
          
          data[j] = transformed.r;
          data[j + 1] = transformed.g;
          data[j + 2] = transformed.b;
        }
        
        i++;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [image, brightness, contrast, saturation, hue, linearSaturation, vibrance, transformOrder]);

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

    // Calculate step-by-step transformations in current order
    const stepByStep: Record<TransformationType, RGB> = {} as Record<TransformationType, RGB>;
    let rgb = originalRGB;

    for (const transformType of transformOrder) {
      rgb = applyTransformation(rgb, transformType);
      stepByStep[transformType] = { ...rgb };  // Store clamped result
    }

    setInspectorData({
      x,
      y,
      originalRGB,
      transformedRGB: rgb,  // Final is already clamped
      stepByStep,
      transformOrder,
      cursorX: e.clientX,
      cursorY: e.clientY
    });
  };

  const handleMouseLeave = () => {
    setInspectorData(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onPixelSelect || !canvasRef.current || !originalImageDataRef.current) return;
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
    onPixelSelect(rgb);
  };

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

