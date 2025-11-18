import { useEffect, useRef, useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { convolveAtPixel } from "@/lib/convolution";
import { BlurParams, SharpenParams, EdgeParams, DenoiseParams, FilterInstance } from "@/types/transformations";
import { gaussianKernel, boxKernel, sobelKernels, prewittKernels, unsharpKernel } from "@/lib/convolution";
import { KernelMultiplicationDiagram } from "./KernelMultiplicationDiagram";

interface InteractiveConvolutionVisualizerProps {
  image: HTMLImageElement;
  regionX: number;
  regionY: number;
  instance: FilterInstance;
  onBack?: () => void;
}

const REGION_SIZE = 32;

function padIndex(i: number, limit: number, mode: 'zero' | 'edge' | 'reflect'): number {
  if (i >= 0 && i < limit) return i;
  if (mode === 'zero') return -1;
  if (mode === 'edge') return i < 0 ? 0 : limit - 1;
  let idx = i;
  if (idx < 0) idx = -idx - 1;
  const period = (limit - 1) * 2;
  idx %= period;
  if (idx >= limit) idx = period - idx;
  return idx;
}

export function InteractiveConvolutionVisualizer({
  image,
  regionX,
  regionY,
  instance,
  onBack,
}: InteractiveConvolutionVisualizerProps) {
  const inputCanvasRef = useRef<HTMLCanvasElement>(null);
  const inputOverlayRef = useRef<HTMLCanvasElement>(null);
  const outputCanvasRef = useRef<HTMLCanvasElement>(null);
  const outputOverlayRef = useRef<HTMLCanvasElement>(null);
  const [kernelPosX, setKernelPosX] = useState(0);
  const [kernelPosY, setKernelPosY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [originalImageData, setOriginalImageData] = useState<ImageData | null>(null);

  // Safety check: ensure instance is valid and has a supported kind
  if (!instance || !instance.kind || !['blur', 'sharpen', 'edge', 'denoise'].includes(instance.kind)) {
    return (
      <Card className="p-4 border-border bg-card">
        <p className="text-sm text-muted-foreground">
          This convolution type is not supported in the interactive visualizer.
        </p>
        {onBack && (
          <Button onClick={onBack} variant="outline" size="sm" className="mt-4">
            Back to Region Selection
          </Button>
        )}
      </Card>
    );
  }

  // Get kernel and params based on instance type
  const { kernel, kernelX, kernelY, padding, size } = useMemo(() => {
    if (!instance || !instance.params) {
      return { kernel: undefined, kernelX: undefined, kernelY: undefined, padding: 'edge' as const, size: 0 };
    }

    try {
      if (instance.kind === 'blur') {
        const p = instance.params as BlurParams;
        if (!p || typeof p.size !== 'number') {
          return { kernel: undefined, kernelX: undefined, kernelY: undefined, padding: 'edge' as const, size: 0 };
        }
        const k = p.kind === 'gaussian' ? gaussianKernel(p.size, p.sigma) : boxKernel(p.size);
        return { kernel: k, kernelX: undefined, kernelY: undefined, padding: p.padding ?? 'edge', size: k.length };
      } else if (instance.kind === 'sharpen') {
        const p = instance.params as SharpenParams;
        if (!p || typeof p.amount !== 'number' || typeof p.size !== 'number') {
          return { kernel: undefined, kernelX: undefined, kernelY: undefined, padding: 'edge' as const, size: 0 };
        }
        const k = p.kernel ?? unsharpKernel(p.amount, p.size);
        return { kernel: k, kernelX: undefined, kernelY: undefined, padding: p.padding ?? 'edge', size: k.length };
      } else if (instance.kind === 'edge') {
        const p = instance.params as EdgeParams;
        if (!p || !p.operator) {
          return { kernel: undefined, kernelX: undefined, kernelY: undefined, padding: 'edge' as const, size: 0 };
        }
        const { kx, ky } = p.operator === 'sobel' ? sobelKernels() : prewittKernels();
        return { kernel: undefined, kernelX: kx, kernelY: ky, padding: p.padding ?? 'edge', size: 3 };
      } else if (instance.kind === 'denoise') {
        const p = instance.params as DenoiseParams;
        if (!p || p.kind !== 'mean' || typeof p.size !== 'number') {
          return { kernel: undefined, kernelX: undefined, kernelY: undefined, padding: 'edge' as const, size: 0 };
        }
        const k = boxKernel(p.size);
        return { kernel: k, kernelX: undefined, kernelY: undefined, padding: p.padding ?? 'edge', size: k.length };
      }
    } catch (error) {
      console.error('Error computing kernel:', error);
      return { kernel: undefined, kernelX: undefined, kernelY: undefined, padding: 'edge' as const, size: 0 };
    }

    return { kernel: undefined, kernelX: undefined, kernelY: undefined, padding: 'edge' as const, size: 0 };
  }, [instance]);

  // Load original image data
  useEffect(() => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = image.width;
    tempCanvas.height = image.height;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(image, 0, 0);
    setOriginalImageData(ctx.getImageData(0, 0, image.width, image.height));
  }, [image]);

  // Get the 64x64 region from original image
  const regionData = useMemo(() => {
    if (!originalImageData) return null;

    const canvas = document.createElement('canvas');
    canvas.width = REGION_SIZE;
    canvas.height = REGION_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.createImageData(REGION_SIZE, REGION_SIZE);
    const pad = padding as 'zero' | 'edge' | 'reflect';

    for (let y = 0; y < REGION_SIZE; y++) {
      for (let x = 0; x < REGION_SIZE; x++) {
        const srcX = padIndex(regionX + x, originalImageData.width, pad);
        const srcY = padIndex(regionY + y, originalImageData.height, pad);

        const dstIdx = (y * REGION_SIZE + x) * 4;
        if (srcX === -1 || srcY === -1) {
          imageData.data[dstIdx] = 0;
          imageData.data[dstIdx + 1] = 0;
          imageData.data[dstIdx + 2] = 0;
          imageData.data[dstIdx + 3] = 255;
        } else {
          const srcIdx = (srcY * originalImageData.width + srcX) * 4;
          imageData.data[dstIdx] = originalImageData.data[srcIdx];
          imageData.data[dstIdx + 1] = originalImageData.data[srcIdx + 1];
          imageData.data[dstIdx + 2] = originalImageData.data[srcIdx + 2];
          imageData.data[dstIdx + 3] = 255;
        }
      }
    }

    return imageData;
  }, [originalImageData, regionX, regionY, padding]);

  // Compute output region (convolved)
  const outputData = useMemo(() => {
    if (!originalImageData || !kernel || size === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = REGION_SIZE;
    canvas.height = REGION_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.createImageData(REGION_SIZE, REGION_SIZE);
    const pad = padding as 'zero' | 'edge' | 'reflect';
    const kHalf = Math.floor(size / 2);

    for (let y = 0; y < REGION_SIZE; y++) {
      for (let x = 0; x < REGION_SIZE; x++) {
        const globalX = regionX + x;
        const globalY = regionY + y;
        
        // Check if kernel would extend beyond image bounds
        // Like setosa.io: show black pixels where kernel can't be fully applied
        const minX = globalX - kHalf;
        const maxX = globalX + kHalf;
        const minY = globalY - kHalf;
        const maxY = globalY + kHalf;
        
        const isEdge = minX < 0 || maxX >= originalImageData.width ||
                       minY < 0 || maxY >= originalImageData.height;
        
        if (isEdge) {
          // Make edge pixels black (like setosa.io demo)
          const idx = (y * REGION_SIZE + x) * 4;
          imageData.data[idx] = 0;
          imageData.data[idx + 1] = 0;
          imageData.data[idx + 2] = 0;
          imageData.data[idx + 3] = 255;
        } else {
          const [r, g, b] = convolveAtPixel(
            originalImageData,
            globalX,
            globalY,
            kernel,
            { padding: pad, perChannel: true }
          );
          const idx = (y * REGION_SIZE + x) * 4;
          imageData.data[idx] = r;
          imageData.data[idx + 1] = g;
          imageData.data[idx + 2] = b;
          imageData.data[idx + 3] = 255;
        }
      }
    }

    return imageData;
  }, [originalImageData, regionX, regionY, kernel, padding, size]);

  // Edge detection output
  const edgeOutputData = useMemo(() => {
    if (!originalImageData || !kernelX || !kernelY) return null;

    const canvas = document.createElement('canvas');
    canvas.width = REGION_SIZE;
    canvas.height = REGION_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const imageData = ctx.createImageData(REGION_SIZE, REGION_SIZE);
    const pad = padding as 'zero' | 'edge' | 'reflect';
    const p = instance.params as EdgeParams;
    const kHalf = Math.floor(size / 2);

    for (let y = 0; y < REGION_SIZE; y++) {
      for (let x = 0; x < REGION_SIZE; x++) {
        const globalX = regionX + x;
        const globalY = regionY + y;
        
        // Check if kernel would extend beyond image bounds
        // Like setosa.io: show black pixels where kernel can't be fully applied
        const minX = globalX - kHalf;
        const maxX = globalX + kHalf;
        const minY = globalY - kHalf;
        const maxY = globalY + kHalf;
        
        const isEdge = minX < 0 || maxX >= originalImageData.width ||
                       minY < 0 || maxY >= originalImageData.height;
        
        if (isEdge) {
          // Make edge pixels black (like setosa.io demo)
          const idx = (y * REGION_SIZE + x) * 4;
          imageData.data[idx] = 0;
          imageData.data[idx + 1] = 0;
          imageData.data[idx + 2] = 0;
          imageData.data[idx + 3] = 255;
        } else {
          const [rx, gx, bx] = convolveAtPixel(originalImageData, globalX, globalY, kernelX, { padding: pad, perChannel: true });
          const [ry, gy, by] = convolveAtPixel(originalImageData, globalX, globalY, kernelY, { padding: pad, perChannel: true });
          
          let r, g, b;
          if (p.combine === 'x') {
            r = Math.abs(rx);
            g = Math.abs(gx);
            b = Math.abs(bx);
          } else if (p.combine === 'y') {
            r = Math.abs(ry);
            g = Math.abs(gy);
            b = Math.abs(by);
          } else {
            r = Math.hypot(rx, ry);
            g = Math.hypot(gx, gy);
            b = Math.hypot(bx, by);
          }

          const idx = (y * REGION_SIZE + x) * 4;
          imageData.data[idx] = Math.max(0, Math.min(255, r));
          imageData.data[idx + 1] = Math.max(0, Math.min(255, g));
          imageData.data[idx + 2] = Math.max(0, Math.min(255, b));
          imageData.data[idx + 3] = 255;
        }
      }
    }

    return imageData;
  }, [originalImageData, regionX, regionY, kernelX, kernelY, padding, instance.params, size]);

  // Draw input canvas
  useEffect(() => {
    const canvas = inputCanvasRef.current;
    if (!canvas || !regionData) return;

    canvas.width = REGION_SIZE;
    canvas.height = REGION_SIZE;

    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) return;

    // Disable image smoothing for pixelated rendering
    ctx.imageSmoothingEnabled = false;
    
    ctx.putImageData(regionData, 0, 0);
  }, [regionData]);

  // Draw input overlay with dashed red grid (separate canvas for crisp lines)
  useEffect(() => {
    const overlay = inputOverlayRef.current;
    const inputCanvas = inputCanvasRef.current;
    if (!overlay || !inputCanvas || size === 0) return;

    const drawGrid = () => {
      // Get the actual display size of the input canvas
      const rect = inputCanvas.getBoundingClientRect();
      const displayWidth = Math.floor(rect.width);
      const displayHeight = Math.floor(rect.height);
      
      if (displayWidth === 0 || displayHeight === 0) return;
      
      // Set overlay canvas to match display size (not internal pixel size)
      overlay.width = displayWidth;
      overlay.height = displayHeight;

      const ctx = overlay.getContext('2d', { willReadFrequently: false });
      if (!ctx) return;

      // Clear overlay
      ctx.clearRect(0, 0, displayWidth, displayHeight);

      // Calculate scale factor from internal size to display size
      const scaleX = displayWidth / REGION_SIZE;
      const scaleY = displayHeight / REGION_SIZE;

      const kx = Math.max(0, Math.min(REGION_SIZE - size, kernelPosX));
      const ky = Math.max(0, Math.min(REGION_SIZE - size, kernelPosY));

      // Scale coordinates to display size
      const scaledKx = kx * scaleX;
      const scaledKy = ky * scaleY;
      const scaledSize = size * scaleX;
      const pixelSize = scaleX; // Size of one pixel in display coordinates

      // Draw dashed red grid outlining each cell
      // Draw at pixel boundaries (not half-pixel offsets) for proper alignment
      ctx.strokeStyle = "#ff0000";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]); // Dash pattern: 2px dash, 2px gap
      ctx.imageSmoothingEnabled = false; // Match input canvas smoothing setting
      
      // Draw outer box - at pixel boundaries
      ctx.beginPath();
      ctx.rect(scaledKx, scaledKy, scaledSize, scaledSize);
      ctx.stroke();
      
      // Draw vertical grid lines between pixel columns
      for (let i = 1; i < size; i++) {
        const x = scaledKx + i * pixelSize;
        ctx.beginPath();
        ctx.moveTo(x, scaledKy);
        ctx.lineTo(x, scaledKy + scaledSize);
        ctx.stroke();
      }
      
      // Draw horizontal grid lines between pixel rows
      for (let i = 1; i < size; i++) {
        const y = scaledKy + i * pixelSize;
        ctx.beginPath();
        ctx.moveTo(scaledKx, y);
        ctx.lineTo(scaledKx + scaledSize, y);
        ctx.stroke();
      }
    };

    // Draw immediately
    drawGrid();

    // Also redraw on window resize
    const handleResize = () => {
      drawGrid();
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [kernelPosX, kernelPosY, size]);

  // Draw output canvas
  useEffect(() => {
    const canvas = outputCanvasRef.current;
    if (!canvas) return;

    const data = outputData || edgeOutputData;
    if (!data) return;

    canvas.width = REGION_SIZE;
    canvas.height = REGION_SIZE;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.putImageData(data, 0, 0);
  }, [outputData, edgeOutputData]);

  // Draw output overlay with grid and pixel highlight
  useEffect(() => {
    const overlay = outputOverlayRef.current;
    const outputCanvas = outputCanvasRef.current;
    if (!overlay || !outputCanvas || size === 0) return;

    const drawOverlay = () => {
      // Get the actual display size of the output canvas
      const rect = outputCanvas.getBoundingClientRect();
      const displayWidth = Math.floor(rect.width);
      const displayHeight = Math.floor(rect.height);
      
      if (displayWidth === 0 || displayHeight === 0) return;
      
      // Set overlay canvas to match display size (not internal pixel size)
      overlay.width = displayWidth;
      overlay.height = displayHeight;

      const ctx = overlay.getContext('2d', { willReadFrequently: false });
      if (!ctx) return;

      // Clear overlay
      ctx.clearRect(0, 0, displayWidth, displayHeight);

      // Calculate scale factor from internal size to display size
      const scaleX = displayWidth / REGION_SIZE;
      const scaleY = displayHeight / REGION_SIZE;

      const kx = Math.max(0, Math.min(REGION_SIZE - size, kernelPosX));
      const ky = Math.max(0, Math.min(REGION_SIZE - size, kernelPosY));
      const half = Math.floor(size / 2);
      const centerX = kx + half;
      const centerY = ky + half;

      // Scale coordinates to display size
      const pixelSize = scaleX; // Size of one pixel in display coordinates
      const scaledCenterX = centerX * scaleX;
      const scaledCenterY = centerY * scaleY;

      // Highlight output pixel corresponding to kernel center with red outline (full opacity)
      ctx.strokeStyle = "#ff0000";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.imageSmoothingEnabled = false;
      ctx.beginPath();
      ctx.rect(scaledCenterX, scaledCenterY, pixelSize, pixelSize);
      ctx.stroke();
    };

    // Draw immediately
    drawOverlay();

    // Also redraw on window resize
    const handleResize = () => {
      drawOverlay();
    };
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [kernelPosX, kernelPosY, size]);

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = inputCanvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = REGION_SIZE / rect.width;
    const scaleY = REGION_SIZE / rect.height;

    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    return { x, y };
  };

  const handleInputMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (size === 0) return;
    const coords = getCanvasCoordinates(e);
    if (!coords) return;

    const half = Math.floor(size / 2);
    const kx = Math.max(0, Math.min(REGION_SIZE - size, coords.x - half));
    const ky = Math.max(0, Math.min(REGION_SIZE - size, coords.y - half));

    setKernelPosX(kx);
    setKernelPosY(ky);
    setIsDragging(true);
  };

  const handleInputMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || size === 0) return;
    const coords = getCanvasCoordinates(e);
    if (!coords) return;

    const half = Math.floor(size / 2);
    const kx = Math.max(0, Math.min(REGION_SIZE - size, coords.x - half));
    const ky = Math.max(0, Math.min(REGION_SIZE - size, coords.y - half));

    setKernelPosX(kx);
    setKernelPosY(ky);
  };

  const handleInputMouseUp = () => {
    setIsDragging(false);
  };

  const currentOutputPixel = useMemo(() => {
    if (!outputData && !edgeOutputData) return null;
    if (size === 0) return null;

    const half = Math.floor(size / 2);
    const kx = Math.max(0, Math.min(REGION_SIZE - size, kernelPosX));
    const ky = Math.max(0, Math.min(REGION_SIZE - size, kernelPosY));
    const centerX = kx + half;
    const centerY = ky + half;

    const data = outputData || edgeOutputData;
    if (!data) return null;

    const idx = (centerY * REGION_SIZE + centerX) * 4;
    return {
      r: data.data[idx],
      g: data.data[idx + 1],
      b: data.data[idx + 2],
    };
  }, [outputData, edgeOutputData, kernelPosX, kernelPosY, size]);

  type VisualizationEntry = {
    title: string;
    size: number;
    cells: { r: number; g: number; b: number; weight: number }[];
    totals?: { r: number; g: number; b: number };
  };

  const kernelVisualizations = useMemo<VisualizationEntry[]>(() => {
    if (!regionData || size === 0) return [];

    const makeVisualization = (weights: number[][] | undefined, title: string) => {
      if (!weights || weights.length === 0) return null;
      const kSize = weights.length;
      const cells: VisualizationEntry["cells"] = [];
      const totals = { r: 0, g: 0, b: 0 };

      for (let y = 0; y < kSize; y++) {
        for (let x = 0; x < kSize; x++) {
          const px = Math.max(0, Math.min(REGION_SIZE - 1, kernelPosX + x));
          const py = Math.max(0, Math.min(REGION_SIZE - 1, kernelPosY + y));
          const idx = (py * REGION_SIZE + px) * 4;
          const r = regionData.data[idx];
          const g = regionData.data[idx + 1];
          const b = regionData.data[idx + 2];
          const weight = weights[y]?.[x] ?? 0;
          cells.push({ r, g, b, weight });
          totals.r += r * weight;
          totals.g += g * weight;
          totals.b += b * weight;
        }
      }

      return { title, size: kSize, cells, totals };
    };

    const visuals: VisualizationEntry[] = [];

    if (kernel) {
      const vis = makeVisualization(kernel, "Kernel × RGB");
      if (vis) visuals.push(vis);
    } else if (kernelX && kernelY) {
      const visX = makeVisualization(kernelX, "Horizontal Kernel × RGB");
      const visY = makeVisualization(kernelY, "Vertical Kernel × RGB");
      if (visX) visuals.push(visX);
      if (visY) visuals.push(visY);
    }

    return visuals;
  }, [regionData, kernel, kernelX, kernelY, kernelPosX, kernelPosY, size]);

  if (!kernel && !kernelX) {
    return (
      <Card className="p-4 border-border bg-card">
        <p className="text-sm text-muted-foreground">
          This convolution type is not supported in the interactive visualizer.
        </p>
        {onBack && (
          <Button onClick={onBack} variant="outline" size="sm" className="mt-4">
            Back to Region Selection
          </Button>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-4 border-border bg-card">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-1">
              Interactive Convolution Visualization
            </h4>
            <p className="text-xs text-muted-foreground">
              Click and drag on the input region to move the kernel. The output pixel is highlighted on the right.
            </p>
          </div>
          {onBack && (
            <Button onClick={onBack} variant="outline" size="sm">
              Change Region
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Input region */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-foreground">Input (32×32)</div>
            <div className="border border-border rounded-lg overflow-hidden bg-muted relative" style={{ position: 'relative' }}>
              <canvas
                ref={inputCanvasRef}
                className="w-full cursor-crosshair block"
                style={{ imageRendering: "pixelated", maxHeight: "400px", display: "block" }}
                onMouseDown={handleInputMouseDown}
                onMouseMove={handleInputMouseMove}
                onMouseUp={handleInputMouseUp}
                onMouseLeave={handleInputMouseUp}
              />
              <canvas
                ref={inputOverlayRef}
                className="pointer-events-none"
                style={{ 
                  position: "absolute",
                  top: 0,
                  left: 0,
                  imageRendering: "auto",
                  zIndex: 10,
                  display: "block",
                  pointerEvents: "none"
                }}
              />
            </div>
            {size > 0 && (
              <div className="text-xs text-muted-foreground">
                Kernel position: ({kernelPosX}, {kernelPosY})
              </div>
            )}
          </div>

          {/* Output region */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-foreground">Output (32×32)</div>
            <div className="border border-border rounded-lg overflow-hidden bg-muted relative" style={{ position: 'relative' }}>
              <canvas
                ref={outputCanvasRef}
                className="w-full block"
                style={{ imageRendering: "pixelated", maxHeight: "400px", display: "block" }}
              />
              <canvas
                ref={outputOverlayRef}
                className="pointer-events-none"
                style={{ 
                  position: "absolute",
                  top: 0,
                  left: 0,
                  imageRendering: "auto",
                  zIndex: 10,
                  display: "block",
                  pointerEvents: "none"
                }}
              />
            </div>
            {currentOutputPixel && (
              <div className="text-xs text-muted-foreground font-mono">
                Output pixel RGB: ({Math.round(currentOutputPixel.r)}, {Math.round(currentOutputPixel.g)}, {Math.round(currentOutputPixel.b)})
              </div>
            )}
          </div>
        </div>
        {kernelVisualizations.length > 0 && (
          <div className="space-y-3 pt-2 border-t border-border/60">
            <div className="text-xs font-semibold text-foreground">
              Kernel Multiplication Breakdown
            </div>
            <div className="space-y-4">
              {kernelVisualizations.map((vis) => (
                <div key={vis.title} className="w-full">
                  <KernelMultiplicationDiagram
                    title={vis.title}
                    size={vis.size}
                    cells={vis.cells}
                    totals={vis.totals}
                    highlightColor={currentOutputPixel ?? undefined}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

