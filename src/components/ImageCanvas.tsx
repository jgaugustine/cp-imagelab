import { useEffect, useRef, useState } from "react";
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

const applySaturationGamma = (rgb: RGB, saturation: number, vibrance: number): RGB => {
  if (saturation === 1 && vibrance === 0) return rgb;
  // Rec.601 luma weights in gamma space (approximate)
  const gray = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  // Estimate per-pixel saturation using max/min
  const maxC = Math.max(rgb.r, rgb.g, rgb.b);
  const minC = Math.min(rgb.r, rgb.g, rgb.b);
  const s = maxC === 0 ? 0 : (maxC - minC) / maxC; // 0..1
  const vibBoost = vibrance * (1 - s); // more boost for low-sat colors
  const factor = saturation + vibBoost;
  return {
    r: clamp(gray + (rgb.r - gray) * factor),
    g: clamp(gray + (rgb.g - gray) * factor),
    b: clamp(gray + (rgb.b - gray) * factor)
  };
};

const applySaturationLinear = (rgb: RGB, saturation: number, vibrance: number): RGB => {
  if (saturation === 1 && vibrance === 0) return rgb;
  // Convert to linear-light
  const rl = srgbToLinear(rgb.r);
  const gl = srgbToLinear(rgb.g);
  const bl = srgbToLinear(rgb.b);
  // Rec.709 luma weights in linear-light
  const Y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  // Estimate saturation in linear space
  const maxL = Math.max(rl, gl, bl);
  const minL = Math.min(rl, gl, bl);
  const s = maxL === 0 ? 0 : (maxL - minL) / maxL;
  const vibBoost = vibrance * (1 - s);
  const factor = saturation + vibBoost;
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

const applyHue = (rgb: RGB, value: number): RGB => {
  if (value === 0) return rgb;
  
  const angle = (value * Math.PI) / 180;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  const matrix = [
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

  return {
    r: clamp(rgb.r * matrix[0] + rgb.g * matrix[1] + rgb.b * matrix[2]),
    g: clamp(rgb.r * matrix[3] + rgb.g * matrix[4] + rgb.b * matrix[5]),
    b: clamp(rgb.r * matrix[6] + rgb.g * matrix[7] + rgb.b * matrix[8])
  };
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
        ? applySaturationLinear(rgb, value, vibrance)
        : applySaturationGamma(rgb, value, vibrance);
      case 'vibrance': return linearSaturation
        ? applySaturationLinear(rgb, 1, vibrance)
        : applySaturationGamma(rgb, 1, vibrance);
      case 'hue': return applyHue(rgb, value);
    }
  };

  useEffect(() => {
    if (!canvasRef.current || !image) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: false });
    if (!ctx) return;

    // Set intrinsic canvas size to image pixels; CSS will scale to fit container
    canvas.width = image.width;
    canvas.height = image.height;

    // Draw original image
    ctx.drawImage(image, 0, 0);

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;

    // Store original image data for inspection (refresh per image/params)
    originalImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Apply transformations in user-defined order
    for (let i = 0; i < data.length; i += 4) {
      let rgb: RGB = { 
        r: data[i], 
        g: data[i + 1], 
        b: data[i + 2] 
      };
      
      // Apply each transformation in order with clamping
      for (const transformType of transformOrder) {
        rgb = applyTransformation(rgb, transformType);
      }
      
      data[i] = rgb.r;
      data[i + 1] = rgb.g;
      data[i + 2] = rgb.b;
    }

    ctx.putImageData(imageData, 0, 0);
  }, [image, brightness, contrast, saturation, hue, linearSaturation, vibrance, transformOrder]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!enableInspector) return;
    const canvas = canvasRef.current;
    if (!canvas || !originalImageDataRef.current) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

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
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);
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
