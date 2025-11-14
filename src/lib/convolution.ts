import { EdgeParams, SharpenParams, BlurParams, DenoiseParams, CustomConvParams } from "@/types/transformations";

type PaddingMode = 'zero' | 'reflect' | 'edge';

export interface ConvolutionCommonParams {
  stride?: number;
  dilation?: number;
  padding?: PaddingMode;
}

export function clamp255(x: number): number {
  return x < 0 ? 0 : x > 255 ? 255 : x;
}

function padIndex(i: number, limit: number, mode: PaddingMode): number {
  if (i >= 0 && i < limit) return i;
  if (mode === 'zero') return -1; // sentinel for zero
  if (mode === 'edge') return i < 0 ? 0 : limit - 1;
  // reflect
  let idx = i;
  if (idx < 0) idx = -idx - 1;
  const period = (limit - 1) * 2;
  idx = idx % period;
  if (idx >= limit) idx = period - idx;
  return idx;
}

export function convolveAtPixel(
  source: ImageData,
  x: number,
  y: number,
  kernel: number[][],
  params: ConvolutionCommonParams & { perChannel?: boolean }
): [number, number, number] {
  const { width, height, data } = source;
  const k = kernel;
  const kSize = k.length;
  const kHalf = Math.floor(kSize / 2);
  const stride = params.stride ?? 1; // stride doesn't change per-pixel calc; used in full passes
  const dilation = params.dilation ?? 1;
  const padding: PaddingMode = params.padding ?? 'edge';
  const perChannel = params.perChannel ?? true;

  let rAcc = 0, gAcc = 0, bAcc = 0;
  for (let ky = 0; ky < kSize; ky++) {
    for (let kx = 0; kx < kSize; kx++) {
      const ix = x + (kx - kHalf) * dilation;
      const iy = y + (ky - kHalf) * dilation;
      let sx = padIndex(ix, width, padding);
      let sy = padIndex(iy, height, padding);
      const w = k[ky][kx];
      if (sx === -1 || sy === -1) {
        // zero padding
        continue;
      }
      const idx = (sy * width + sx) * 4;
      const R = data[idx], G = data[idx + 1], B = data[idx + 2];
      if (perChannel) {
        rAcc += R * w;
        gAcc += G * w;
        bAcc += B * w;
      } else {
        // luminance-only: apply on gray then broadcast
        const gray = 0.299 * R + 0.587 * G + 0.114 * B;
        rAcc += gray * w;
        gAcc += gray * w;
        bAcc += gray * w;
      }
    }
  }
  return [clamp255(rAcc), clamp255(gAcc), clamp255(bAcc)];
}

export function convolveImageData(
  imageData: ImageData,
  kernel: number[][],
  params: ConvolutionCommonParams & { perChannel?: boolean }
): ImageData {
  const { width, height, data } = imageData;
  const out = new ImageData(width, height);
  const outData = out.data;
  const stride = params.stride ?? 1;
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const [r, g, b] = convolveAtPixel(imageData, x, y, kernel, params);
      const idx = (y * width + x) * 4;
      outData[idx] = r;
      outData[idx + 1] = g;
      outData[idx + 2] = b;
      outData[idx + 3] = data[idx + 3];
    }
  }
  // For stride > 1, leave skipped pixels as zeros (or could upsample/nearest). Keep simple for now.
  if ((params.stride ?? 1) === 1) return out;
  // Fill missing with nearest previous sample to avoid black gaps
  const s = params.stride ?? 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = Math.floor(x / s) * s;
      const sy = Math.floor(y / s) * s;
      const srcIdx = (sy * width + sx) * 4;
      const dstIdx = (y * width + x) * 4;
      outData[dstIdx] = outData[srcIdx];
      outData[dstIdx + 1] = outData[srcIdx + 1];
      outData[dstIdx + 2] = outData[srcIdx + 2];
      outData[dstIdx + 3] = outData[srcIdx + 3];
    }
  }
  return out;
}

export function gaussianKernel(size: 3 | 5 | 7, sigma?: number): number[][] {
  const s = sigma ?? (size === 3 ? 0.85 : size === 5 ? 1.2 : 1.6);
  const half = Math.floor(size / 2);
  const k: number[][] = [];
  let sum = 0;
  for (let y = -half; y <= half; y++) {
    const row: number[] = [];
    for (let x = -half; x <= half; x++) {
      const v = Math.exp(-(x * x + y * y) / (2 * s * s));
      row.push(v);
      sum += v;
    }
    k.push(row);
  }
  // normalize
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) k[y][x] /= sum;
  }
  return k;
}

export function boxKernel(size: 3 | 5 | 7): number[][] {
  const v = 1 / (size * size);
  return Array.from({ length: size }, () => Array.from({ length: size }, () => v));
}

export function sobelKernels(): { kx: number[][]; ky: number[][] } {
  const kx = [
    [-1, 0, 1],
    [-2, 0, 2],
    [-1, 0, 1],
  ];
  const ky = [
    [-1, -2, -1],
    [0, 0, 0],
    [1, 2, 1],
  ];
  return { kx, ky };
}

export function prewittKernels(): { kx: number[][]; ky: number[][] } {
  const kx = [
    [-1, 0, 1],
    [-1, 0, 1],
    [-1, 0, 1],
  ];
  const ky = [
    [-1, -1, -1],
    [0, 0, 0],
    [1, 1, 1],
  ];
  return { kx, ky };
}

export function unsharpKernel(amount: number, size: 3 | 5): number[][] {
  const blur = size === 3 ? boxKernel(3) : boxKernel(5);
  // Start from identity delta kernel then subtract blurred scaled by amount
  const k = blur.map(row => row.map(v => -amount * v));
  const c = Math.floor(size / 2);
  k[c][c] += 1 + amount;
  return k;
}

export function laplacianKernel(alpha: number): number[][] {
  // 3x3 Laplacian, scaled by alpha: sharpened = original + alpha * Laplacian(original)
  // Kernel applied directly acts like: center positive, neighbors negative
  const a = alpha;
  return [
    [0, -a, 0],
    [-a, 1 + 4 * a, -a],
    [0, -a, 0]
  ];
}

export function edgeEnhanceKernel(alpha: number): number[][] {
  // Simple edge enhance kernel variant
  const a = alpha;
  return [
    [0, -a, 0],
    [-a, 1 + 4 * a, -a],
    [0, -a, 0]
  ];
}

export function applyBlur(imageData: ImageData, params: BlurParams): ImageData {
  const kernel = params.kind === 'gaussian' ? gaussianKernel(params.size, params.sigma) : boxKernel(params.size);
  return convolveImageData(imageData, kernel, { stride: params.stride ?? 1, padding: params.padding ?? 'edge', perChannel: true });
}

export function applySharpen(imageData: ImageData, params: SharpenParams): ImageData {
  const kernel = params.kernel
    ?? (params.kind === 'unsharp'
      ? unsharpKernel(params.amount, params.size)
      : params.kind === 'laplacian'
      ? laplacianKernel(params.amount)
      : edgeEnhanceKernel(params.amount));
  return convolveImageData(imageData, kernel, { stride: params.stride ?? 1, padding: params.padding ?? 'edge', perChannel: true });
}

export function applyEdge(imageData: ImageData, params: EdgeParams): ImageData {
  const { width, height, data } = imageData;
  const out = new ImageData(width, height);
  const { kx, ky } = params.operator === 'sobel' ? sobelKernels() : prewittKernels();
  const perChannel = true;
  const padding: PaddingMode = params.padding ?? 'edge';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [rx, gx, bx] = convolveAtPixel(imageData, x, y, kx, { padding, perChannel });
      const [ry, gy, by] = convolveAtPixel(imageData, x, y, ky, { padding, perChannel });
      let r = 0, g = 0, b = 0;
      if (params.combine === 'x') {
        r = Math.abs(rx); g = Math.abs(gx); b = Math.abs(bx);
      } else if (params.combine === 'y') {
        r = Math.abs(ry); g = Math.abs(gy); b = Math.abs(by);
      } else {
        r = Math.hypot(rx, ry); g = Math.hypot(gx, gy); b = Math.hypot(bx, by);
      }
      const idx = (y * width + x) * 4;
      out.data[idx] = clamp255(r);
      out.data[idx + 1] = clamp255(g);
      out.data[idx + 2] = clamp255(b);
      out.data[idx + 3] = data[idx + 3];
    }
  }
  return out;
}

export function applyDenoise(imageData: ImageData, params: DenoiseParams): ImageData {
  if (params.kind === 'mean') {
    const kernel = boxKernel(params.size);
    const filtered = convolveImageData(imageData, kernel, { stride: params.stride ?? 1, padding: params.padding ?? 'edge', perChannel: true });
    const k = Math.max(0, Math.min(1, params.strength ?? 0.5));
    // Blend original and filtered by strength k
    const out = new ImageData(imageData.width, imageData.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      out.data[i] = clamp255(imageData.data[i] * (1 - k) + filtered.data[i] * k);
      out.data[i + 1] = clamp255(imageData.data[i + 1] * (1 - k) + filtered.data[i + 1] * k);
      out.data[i + 2] = clamp255(imageData.data[i + 2] * (1 - k) + filtered.data[i + 2] * k);
      out.data[i + 3] = imageData.data[i + 3];
    }
    return out;
  }
  // median filter
  const { width, height, data } = imageData;
  const out = new ImageData(width, height);
  const kSize = params.size;
  const kHalf = Math.floor(kSize / 2);
  const pad: PaddingMode = params.padding ?? 'edge';
  const windowR = new Array<number>(kSize * kSize);
  const windowG = new Array<number>(kSize * kSize);
  const windowB = new Array<number>(kSize * kSize);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let t = 0;
      for (let ky = -kHalf; ky <= kHalf; ky++) {
        for (let kx = -kHalf; kx <= kHalf; kx++) {
          const sx = padIndex(x + kx, width, pad);
          const sy = padIndex(y + ky, height, pad);
          if (sx === -1 || sy === -1) {
            windowR[t] = 0; windowG[t] = 0; windowB[t] = 0; t++;
            continue;
          }
          const idx = (sy * width + sx) * 4;
          windowR[t] = data[idx];
          windowG[t] = data[idx + 1];
          windowB[t] = data[idx + 2];
          t++;
        }
      }
      windowR.sort((a, b) => a - b);
      windowG.sort((a, b) => a - b);
      windowB.sort((a, b) => a - b);
      const mid = Math.floor(windowR.length / 2);
      const idxOut = (y * width + x) * 4;
      out.data[idxOut] = windowR[mid];
      out.data[idxOut + 1] = windowG[mid];
      out.data[idxOut + 2] = windowB[mid];
      out.data[idxOut + 3] = data[idxOut + 3];
    }
  }
  return out;
}

export function applyCustomConv(imageData: ImageData, params: CustomConvParams): ImageData {
  return convolveImageData(imageData, params.kernel, { 
    stride: params.stride ?? 1, 
    padding: params.padding ?? 'edge', 
    perChannel: true 
  });
}


