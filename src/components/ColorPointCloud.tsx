import { useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { TransformationType, RGB, FilterInstance, BlurParams, SharpenParams, EdgeParams, DenoiseParams, CustomConvParams } from '@/types/transformations';
import { cpuConvolutionBackend } from '@/lib/convolutionBackend';
import { gaussianKernel, boxKernel, sobelKernels, prewittKernels, unsharpKernel } from '@/lib/convolution';

interface ColorPointCloudProps {
  image: HTMLImageElement | null;
  pipeline?: FilterInstance[];
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  linearSaturation?: boolean;
  vibrance?: number;
  transformOrder: TransformationType[];
}

const clamp = (val: number): number => Math.max(0, Math.min(255, val));

// Reuse transformation functions from ImageCanvas
const buildBrightnessMatrix = (value: number): { matrix: number[]; offset: number[] } => {
  const matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const offset = [value, value, value];
  return { matrix, offset };
};

const buildContrastMatrix = (value: number): { matrix: number[]; offset: number[] } => {
  const matrix = [value, 0, 0, 0, value, 0, 0, 0, value];
  const offset = [128 * (1 - value), 128 * (1 - value), 128 * (1 - value)];
  return { matrix, offset };
};

const buildSaturationMatrix = (saturation: number): number[] => {
  if (saturation === 1) {
    return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }
  const wR = 0.299;
  const wG = 0.587;
  const wB = 0.114;
  const s = saturation;
  return [
    wR + (1 - wR) * s, wG * (1 - s), wB * (1 - s),
    wR * (1 - s), wG + (1 - wG) * s, wB * (1 - s),
    wR * (1 - s), wG * (1 - s), wB + (1 - wB) * s
  ];
};

const buildHueMatrix = (value: number): number[] => {
  if (value === 0) {
    return [1, 0, 0, 0, 1, 0, 0, 0, 1];
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
  const gray = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  if (saturation === 0) {
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
  const rl = srgbToLinear(rgb.r);
  const gl = srgbToLinear(rgb.g);
  const bl = srgbToLinear(rgb.b);
  const Y = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  if (saturation === 0) {
    const enc = linearToSrgb(Y);
    const g = clamp(enc);
    return { r: g, g, b: g };
  }
  const factor = saturation;
  const rlin = Y + (rl - Y) * factor;
  const glin = Y + (gl - Y) * factor;
  const blin = Y + (bl - Y) * factor;
  return {
    r: clamp(linearToSrgb(rlin)),
    g: clamp(linearToSrgb(glin)),
    b: clamp(linearToSrgb(blin))
  };
};

const applyVibrance = (rgb: RGB, vibrance: number): RGB => {
  if (vibrance === 0) return rgb;
  const R = rgb.r, G = rgb.g, B = rgb.b;
  const maxC = Math.max(R, G, B);
  const minC = Math.min(R, G, B);
  const sEst = maxC === 0 ? 0 : (maxC - minC) / maxC;
  const f = 1 + vibrance * (1 - sEst);
  const gray = 0.299 * R + 0.587 * G + 0.114 * B;
  if (R === G && G === B) return { r: R, g: G, b: B };
  return {
    r: clamp(gray + (R - gray) * f),
    g: clamp(gray + (G - gray) * f),
    b: clamp(gray + (B - gray) * f)
  };
};

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

const applyHue = (rgb: RGB, value: number): RGB => {
  const matrix = buildHueMatrix(value);
  return {
    r: clamp(rgb.r * matrix[0] + rgb.g * matrix[1] + rgb.b * matrix[2]),
    g: clamp(rgb.r * matrix[3] + rgb.g * matrix[4] + rgb.b * matrix[5]),
    b: clamp(rgb.r * matrix[6] + rgb.g * matrix[7] + rgb.b * matrix[8])
  };
};

const composeAffineTransforms = (transforms: Array<{ matrix: number[]; offset: number[] }>): { matrix: number[]; offset: number[] } => {
  if (transforms.length === 0) {
    return { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], offset: [0, 0, 0] };
  }
  if (transforms.length === 1) {
    return transforms[0];
  }
  let resultMatrix = [...transforms[0].matrix];
  let resultOffset = [...transforms[0].offset];
  for (let i = 1; i < transforms.length; i++) {
    const M2 = transforms[i].matrix;
    const o2 = transforms[i].offset;
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

const applyMatrixToImageData = (imageData: ImageData, matrix: number[], offset: number[]): void => {
  const { data } = imageData;
  const m = matrix;
  const o = offset;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    data[i] = clamp(r * m[0] + g * m[1] + b * m[2] + o[0]);
    data[i + 1] = clamp(r * m[3] + g * m[4] + b * m[5] + o[1]);
    data[i + 2] = clamp(r * m[6] + g * m[7] + b * m[8] + o[2]);
  }
};

export function ColorPointCloud({ image, pipeline, brightness, contrast, saturation, hue, linearSaturation = false, vibrance = 0, transformOrder }: ColorPointCloudProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Extract and transform pixel data
  const transformedPixels = useMemo(() => {
    if (!image) return null;

    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;

    // Apply transformations (same logic as ImageCanvas)
    if (!pipeline) {
      // Legacy path using transformOrder
      type Step = { type: TransformationType; value: number } | { type: 'vibrance'; value: number };
      const steps: Step[] = transformOrder.map(t => {
        if (t === 'brightness') return { type: t, value: brightness };
        if (t === 'contrast') return { type: t, value: contrast };
        if (t === 'saturation') return { type: t, value: saturation };
        if (t === 'hue') return { type: t, value: hue };
        return { type: 'vibrance' as const, value: vibrance };
      }) as Step[];

      let i = 0;
      while (i < steps.length) {
        const matrixBatch: Array<{ matrix: number[]; offset: number[] }> = [];
        let batchEnd = i;
        while (batchEnd < steps.length) {
          const s = steps[batchEnd];
          const stype = s.type as TransformationType;
          const sval = (s as any).value as number;
          const isPerPixel = stype === 'vibrance' || (stype === 'saturation' && linearSaturation);
          if (isPerPixel) break;
          if (stype === 'brightness') matrixBatch.push(buildBrightnessMatrix(sval));
          else if (stype === 'contrast') matrixBatch.push(buildContrastMatrix(sval));
          else if (stype === 'saturation') matrixBatch.push({ matrix: buildSaturationMatrix(sval), offset: [0, 0, 0] });
          else if (stype === 'hue') matrixBatch.push({ matrix: buildHueMatrix(sval), offset: [0, 0, 0] });
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
            const rgb: RGB = { r: data[j], g: data[j + 1], b: data[j + 2] };
            let transformed: RGB = rgb;
            if (stype === 'vibrance') {
              transformed = linearSaturation ? applyVibranceLinear(rgb, sval) : applyVibrance(rgb, sval);
            } else if (stype === 'saturation') {
              transformed = applySaturationLinear(rgb, sval);
            }
            data[j] = transformed.r;
            data[j + 1] = transformed.g;
            data[j + 2] = transformed.b;
          }
          i++;
        }
      }
    } else {
      // Instance-based path
      for (const inst of [...pipeline].reverse()) {
        if (!inst.enabled) continue;
        if (inst.kind === 'brightness' || inst.kind === 'contrast' || inst.kind === 'saturation' || inst.kind === 'hue' || inst.kind === 'vibrance') {
          const kind = inst.kind;
          if (kind === 'brightness' || kind === 'contrast' || (kind === 'saturation' && !linearSaturation) || kind === 'hue') {
            const batch: Array<{ matrix: number[]; offset: number[] }> = [];
            if (kind === 'brightness') batch.push(buildBrightnessMatrix((inst.params as { value: number }).value));
            if (kind === 'contrast') batch.push(buildContrastMatrix((inst.params as { value: number }).value));
            if (kind === 'saturation' && !linearSaturation) batch.push({ matrix: buildSaturationMatrix((inst.params as { value: number }).value), offset: [0, 0, 0] });
            if (kind === 'hue') batch.push({ matrix: buildHueMatrix((inst.params as { hue: number }).hue), offset: [0, 0, 0] });
            const composed = composeAffineTransforms(batch);
            applyMatrixToImageData(imageData, composed.matrix, composed.offset);
          } else {
            const sval = kind === 'vibrance' ? (inst.params as { vibrance: number }).vibrance : (inst.params as { value: number }).value;
            for (let j = 0; j < data.length; j += 4) {
              const alpha = data[j + 3];
              if (alpha === 0) continue;
              const rgb: RGB = { r: data[j], g: data[j + 1], b: data[j + 2] };
              let transformed: RGB = rgb;
              if (kind === 'vibrance') transformed = linearSaturation ? applyVibranceLinear(rgb, sval) : applyVibrance(rgb, sval);
              if (kind === 'saturation') transformed = applySaturationLinear(rgb, sval);
              data[j] = transformed.r;
              data[j + 1] = transformed.g;
              data[j + 2] = transformed.b;
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

    // Extract pixel data
    const pixels: { position: [number, number, number]; color: [number, number, number] }[] = [];
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha === 0) continue; // Skip transparent pixels
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Position at (R, G, B) coordinates, centered around origin (-128 to 128)
      pixels.push({
        position: [r - 128, g - 128, b - 128],
        color: [r / 255, g / 255, b / 255]
      });
    }

    return pixels;
  }, [image, pipeline, brightness, contrast, saturation, hue, linearSaturation, vibrance, transformOrder]);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current || !transformedPixels || transformedPixels.length === 0) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let geometry: THREE.BufferGeometry | null = null;
    let material: THREE.PointsMaterial | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;

    try {
      const container = containerRef.current;
      const width = container.clientWidth;
      const height = container.clientHeight;
      
      if (width === 0 || height === 0) return;

      // Scene
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a1a);
      sceneRef.current = scene;

      // Camera
      camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      camera.position.set(200, 200, 200);
      camera.lookAt(0, 0, 0);
      cameraRef.current = camera;

      // Renderer
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(window.devicePixelRatio);
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // Points geometry
      geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(transformedPixels.length * 3);
      const colors = new Float32Array(transformedPixels.length * 3);

      transformedPixels.forEach((pixel, i) => {
        positions[i * 3] = pixel.position[0];
        positions[i * 3 + 1] = pixel.position[1];
        positions[i * 3 + 2] = pixel.position[2];
        colors[i * 3] = pixel.color[0];
        colors[i * 3 + 1] = pixel.color[1];
        colors[i * 3 + 2] = pixel.color[2];
      });

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      // Points material
      material = new THREE.PointsMaterial({
        size: 1,
        vertexColors: true,
        sizeAttenuation: false
      });

      const points = new THREE.Points(geometry, material);
      scene.add(points);
      pointsRef.current = points;

      // Orbit controls (using a simple implementation)
      let isDragging = false;
      let previousMousePosition = { x: 0, y: 0 };

      const onMouseDown = (e: MouseEvent) => {
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
      };

      const onMouseMove = (e: MouseEvent) => {
        if (!isDragging || !camera) return;
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;
        camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), deltaX * 0.01);
        const axis = new THREE.Vector3(1, 0, 0);
        camera.position.applyAxisAngle(axis, deltaY * 0.01);
        camera.lookAt(0, 0, 0);
        previousMousePosition = { x: e.clientX, y: e.clientY };
      };

      const onMouseUp = () => {
        isDragging = false;
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (!camera) return;
        const distance = camera.position.length();
        const newDistance = distance + e.deltaY * 0.1;
        if (newDistance > 10 && newDistance < 1000) {
          camera.position.normalize().multiplyScalar(newDistance);
        }
      };

      renderer.domElement.addEventListener('mousedown', onMouseDown);
      renderer.domElement.addEventListener('mousemove', onMouseMove);
      renderer.domElement.addEventListener('mouseup', onMouseUp);
      renderer.domElement.addEventListener('wheel', onWheel);

      // Animation loop
      const animate = () => {
        if (!renderer || !scene || !camera) return;
        animationFrameRef.current = requestAnimationFrame(animate);
        renderer.render(scene, camera);
      };
      animate();

      // Handle resize
      const handleResize = () => {
        if (!containerRef.current || !camera || !renderer) return;
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      };
      window.addEventListener('resize', handleResize);

      // Cleanup function
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        if (renderer) {
          renderer.domElement.removeEventListener('mousedown', onMouseDown);
          renderer.domElement.removeEventListener('mousemove', onMouseMove);
          renderer.domElement.removeEventListener('mouseup', onMouseUp);
          renderer.domElement.removeEventListener('wheel', onWheel);
          window.removeEventListener('resize', handleResize);
          if (containerRef.current && renderer.domElement.parentNode) {
            containerRef.current.removeChild(renderer.domElement);
          }
          renderer.dispose();
        }
        if (geometry) geometry.dispose();
        if (material) material.dispose();
      };
    } catch (error) {
      console.error('Error initializing ColorPointCloud:', error);
      // Cleanup on error
      if (renderer) renderer.dispose();
      if (geometry) geometry.dispose();
      if (material) material.dispose();
      return () => {}; // Return empty cleanup function on error
    }
  }, [transformedPixels]);

  // Update points when pixels change
  useEffect(() => {
    if (!pointsRef.current || !transformedPixels || transformedPixels.length === 0) return;

    const geometry = pointsRef.current.geometry;
    const positions = new Float32Array(transformedPixels.length * 3);
    const colors = new Float32Array(transformedPixels.length * 3);

    transformedPixels.forEach((pixel, i) => {
      positions[i * 3] = pixel.position[0];
      positions[i * 3 + 1] = pixel.position[1];
      positions[i * 3 + 2] = pixel.position[2];
      colors[i * 3] = pixel.color[0];
      colors[i * 3 + 1] = pixel.color[1];
      colors[i * 3 + 2] = pixel.color[2];
    });

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setDrawRange(0, transformedPixels.length);
  }, [transformedPixels]);

  if (!image) {
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
        No image loaded
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full min-h-[600px]" />
  );
}

