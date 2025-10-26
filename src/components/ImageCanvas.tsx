import { useEffect, useRef, useState } from "react";
import { PixelInspector } from "./PixelInspector";

interface ImageCanvasProps {
  image: HTMLImageElement;
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
}

interface InspectorData {
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
  cursorX: number;
  cursorY: number;
}

export function ImageCanvas({ image, brightness, contrast, saturation, hue }: ImageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [inspectorData, setInspectorData] = useState<InspectorData | null>(null);
  const originalImageDataRef = useRef<ImageData | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !image) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    // Set canvas size to match image aspect ratio
    const maxWidth = canvas.parentElement?.clientWidth || 800;
    const scale = maxWidth / image.width;
    canvas.width = image.width;
    canvas.height = image.height;
    canvas.style.width = `${maxWidth}px`;
    canvas.style.height = `${image.height * scale}px`;

    // Draw original image
    ctx.drawImage(image, 0, 0);

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Store original image data for inspection
    if (!originalImageDataRef.current) {
      originalImageDataRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    // Apply transformations
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // 1. Brightness (Matrix Addition)
      r += brightness;
      g += brightness;
      b += brightness;

      // 2. Contrast (Scalar Multiplication)
      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;

      // 3. Saturation (RGB → HSL transformation)
      if (saturation !== 1) {
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        r = gray + (r - gray) * saturation;
        g = gray + (g - gray) * saturation;
        b = gray + (b - gray) * saturation;
      }

      // 4. Hue Rotation (Color space rotation matrix)
      if (hue !== 0) {
        const angle = (hue * Math.PI) / 180;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        // Hue rotation matrix
        const matrix = [
          cosA + (1 - cosA) / 3, 1/3 * (1 - cosA) - Math.sqrt(1/3) * sinA, 1/3 * (1 - cosA) + Math.sqrt(1/3) * sinA,
          1/3 * (1 - cosA) + Math.sqrt(1/3) * sinA, cosA + 1/3 * (1 - cosA), 1/3 * (1 - cosA) - Math.sqrt(1/3) * sinA,
          1/3 * (1 - cosA) - Math.sqrt(1/3) * sinA, 1/3 * (1 - cosA) + Math.sqrt(1/3) * sinA, cosA + 1/3 * (1 - cosA)
        ];

        const newR = r * matrix[0] + g * matrix[1] + b * matrix[2];
        const newG = r * matrix[3] + g * matrix[4] + b * matrix[5];
        const newB = r * matrix[6] + g * matrix[7] + b * matrix[8];

        r = newR;
        g = newG;
        b = newB;
      }

      // Clamp values
      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
    }

    ctx.putImageData(imageData, 0, 0);
  }, [image, brightness, contrast, saturation, hue]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
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

    const originalRGB = {
      r: originalData[index],
      g: originalData[index + 1],
      b: originalData[index + 2],
    };

    // Calculate step-by-step transformations
    let r = originalRGB.r;
    let g = originalRGB.g;
    let b = originalRGB.b;

    // 1. Brightness
    r += brightness;
    g += brightness;
    b += brightness;
    const afterBrightness = { r, g, b };

    // 2. Contrast
    r = (r - 128) * contrast + 128;
    g = (g - 128) * contrast + 128;
    b = (b - 128) * contrast + 128;
    const afterContrast = { r, g, b };

    // 3. Saturation
    if (saturation !== 1) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * saturation;
      g = gray + (g - gray) * saturation;
      b = gray + (b - gray) * saturation;
    }
    const afterSaturation = { r, g, b };

    // 4. Hue rotation
    if (hue !== 0) {
      const angle = (hue * Math.PI) / 180;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const matrix = [
        cosA + (1 - cosA) / 3, 1/3 * (1 - cosA) - Math.sqrt(1/3) * sinA, 1/3 * (1 - cosA) + Math.sqrt(1/3) * sinA,
        1/3 * (1 - cosA) + Math.sqrt(1/3) * sinA, cosA + 1/3 * (1 - cosA), 1/3 * (1 - cosA) - Math.sqrt(1/3) * sinA,
        1/3 * (1 - cosA) - Math.sqrt(1/3) * sinA, 1/3 * (1 - cosA) + Math.sqrt(1/3) * sinA, cosA + 1/3 * (1 - cosA)
      ];

      const newR = r * matrix[0] + g * matrix[1] + b * matrix[2];
      const newG = r * matrix[3] + g * matrix[4] + b * matrix[5];
      const newB = r * matrix[6] + g * matrix[7] + b * matrix[8];

      r = newR;
      g = newG;
      b = newB;
    }
    const afterHue = { r, g, b };

    // Clamp final values
    const transformedRGB = {
      r: Math.max(0, Math.min(255, r)),
      g: Math.max(0, Math.min(255, g)),
      b: Math.max(0, Math.min(255, b)),
    };

    setInspectorData({
      x,
      y,
      originalRGB,
      transformedRGB,
      stepByStep: {
        afterBrightness,
        afterContrast,
        afterSaturation,
        afterHue,
      },
      cursorX: e.clientX,
      cursorY: e.clientY,
    });
  };

  const handleMouseLeave = () => {
    setInspectorData(null);
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        className="w-full rounded-lg border border-border cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      {inspectorData && (
        <PixelInspector
          {...inspectorData}
          brightness={brightness}
          contrast={contrast}
          saturation={saturation}
          hue={hue}
        />
      )}
    </>
  );
}
