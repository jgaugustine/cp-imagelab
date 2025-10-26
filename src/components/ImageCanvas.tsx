import { useEffect, useRef } from "react";

interface ImageCanvasProps {
  image: HTMLImageElement;
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
}

export function ImageCanvas({ image, brightness, contrast, saturation, hue }: ImageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-lg border border-border"
    />
  );
}
