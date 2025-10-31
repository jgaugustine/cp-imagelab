import { useEffect, useRef, useState } from "react";
import { PixelInspector } from "./PixelInspector";
import { TransformationType, RGB } from "@/types/transformations";
import { srgbToLinear, linearToSrgb } from "@/lib/utils";

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
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// sRGB <-> linear-light helpers moved to @/lib/utils

// Linear-light transforms on [0,1]
const applyExposureLinear = (lin: { r: number; g: number; b: number }, stops: number) => {
  const f = Math.pow(2, stops);
  return {
    r: clamp01(lin.r * f),
    g: clamp01(lin.g * f),
    b: clamp01(lin.b * f)
  };
};

const applyContrastLinear = (lin: { r: number; g: number; b: number }, contrast: number) => {
  const ref = 0.5;
  return {
    r: clamp01((lin.r - ref) * contrast + ref),
    g: clamp01((lin.g - ref) * contrast + ref),
    b: clamp01((lin.b - ref) * contrast + ref)
  };
};

// gamma-space saturation removed; all saturation done in linear-light

const applySaturationLinear = (lin: { r: number; g: number; b: number }, saturation: number, vibrance: number) => {
  if (saturation === 1 && vibrance === 0) return lin;
  const Y = 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b;
  const maxL = Math.max(lin.r, lin.g, lin.b);
  const minL = Math.min(lin.r, lin.g, lin.b);
  const sEst = maxL === 0 ? 0 : (maxL - minL) / maxL;
  const factor = saturation + vibrance * (1 - sEst);
  return {
    r: clamp01(Y + (lin.r - Y) * factor),
    g: clamp01(Y + (lin.g - Y) * factor),
    b: clamp01(Y + (lin.b - Y) * factor)
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

const applyHueLinear = (lin: { r: number; g: number; b: number }, value: number) => {
  if (value === 0) return lin;
  const angle = (value * Math.PI) / 180;
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
    r: clamp01(lin.r * m[0] + lin.g * m[1] + lin.b * m[2]),
    g: clamp01(lin.r * m[3] + lin.g * m[4] + lin.b * m[5]),
    b: clamp01(lin.r * m[6] + lin.g * m[7] + lin.b * m[8]),
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

  const applyTransformationLinear = (lin: { r: number; g: number; b: number }, type: TransformationType): { r: number; g: number; b: number } => {
    switch (type) {
      case 'brightness':
        return applyExposureLinear(lin, (brightness ?? 0) / 50);
      case 'contrast':
        return applyContrastLinear(lin, contrast);
      case 'saturation':
        return applySaturationLinear(lin, saturation, vibrance ?? 0);
      case 'vibrance':
        return applySaturationLinear(lin, 1, vibrance ?? 0);
      case 'hue':
        return applyHueLinear(lin, hue);
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

    // Apply transformations in user-defined order (linearize once per pixel)
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      // Skip transforming fully transparent pixels to preserve background
      if (alpha === 0) {
        continue;
      }
      let lin = {
        r: srgbToLinear(data[i]),
        g: srgbToLinear(data[i + 1]),
        b: srgbToLinear(data[i + 2])
      };

      for (const transformType of transformOrder) {
        lin = applyTransformationLinear(lin, transformType);
      }

      data[i] = clamp(linearToSrgb(lin.r));
      data[i + 1] = clamp(linearToSrgb(lin.g));
      data[i + 2] = clamp(linearToSrgb(lin.b));
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

    // Calculate step-by-step transformations in current order (linear pipeline)
    const stepByStep: Record<TransformationType, RGB> = {} as Record<TransformationType, RGB>;
    let linStep = {
      r: srgbToLinear(originalRGB.r),
      g: srgbToLinear(originalRGB.g),
      b: srgbToLinear(originalRGB.b),
    };
    for (const transformType of transformOrder) {
      linStep = applyTransformationLinear(linStep, transformType);
      // Store sRGB-encoded snapshot for inspector
      stepByStep[transformType] = {
        r: clamp(linearToSrgb(linStep.r)),
        g: clamp(linearToSrgb(linStep.g)),
        b: clamp(linearToSrgb(linStep.b)),
      };
    }

    setInspectorData({
      x,
      y,
      originalRGB,
      transformedRGB: stepByStep[transformOrder[transformOrder.length - 1]] ?? originalRGB,
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
