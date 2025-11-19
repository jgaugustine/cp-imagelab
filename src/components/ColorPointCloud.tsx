import { useEffect, useRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import { TransformationType, RGB, FilterInstance, BlurParams, SharpenParams, EdgeParams, DenoiseParams, CustomConvParams } from '@/types/transformations';
import { cpuConvolutionBackend } from '@/lib/convolutionBackend';
import { gaussianKernel, boxKernel, sobelKernels, prewittKernels, unsharpKernel } from '@/lib/convolution';

// Quaternion-based rotation for smoother, gimbal-lock-free rotation
type Quaternion = [number, number, number, number]; // [w, x, y, z]

function quaternionMultiply(q1: Quaternion, q2: Quaternion): Quaternion {
  const [w1, x1, y1, z1] = q1;
  const [w2, x2, y2, z2] = q2;
  return [
    w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
    w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
    w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
    w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
  ];
}

function quaternionFromAxisAngle(axis: [number, number, number], angle: number): Quaternion {
  const halfAngle = angle / 2;
  const s = Math.sin(halfAngle);
  return [
    Math.cos(halfAngle),
    axis[0] * s,
    axis[1] * s,
    axis[2] * s,
  ];
}

function quaternionToEuler(q: Quaternion): { yaw: number; pitch: number } {
  const [w, x, y, z] = q;
  const sinP = 2 * (w * y - z * x);
  const pitch = Math.asin(Math.max(-1, Math.min(1, sinP)));
  const sinY = 2 * (w * z + x * y);
  const cosY = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(sinY, cosY);
  return { yaw: (yaw * 180) / Math.PI, pitch: (pitch * 180) / Math.PI };
}

function eulerToQuaternion(yawDeg: number, pitchDeg: number): Quaternion {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  const cp = Math.cos(pitch / 2);
  const sp = Math.sin(pitch / 2);
  return [
    cy * cp,
    cy * sp,
    sy * cp,
    -sy * sp,
  ];
}

function rotateVector(x: number, y: number, z: number, q: Quaternion): THREE.Vector3 {
  const [w, qx, qy, qz] = q;
  // Rotate vector using quaternion: v' = q * v * q^-1
  const ix = w * x + qy * z - qz * y;
  const iy = w * y + qz * x - qx * z;
  const iz = w * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return new THREE.Vector3(
    ix * w + iw * -qx + iy * -qz - iz * -qy,
    iy * w + iw * -qy + iz * -qx - ix * -qz,
    iz * w + iw * -qz + ix * -qy - iy * -qx
  );
}

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
  
  // 3D navigation state
  const [yaw, setYaw] = useState<number>(-35);
  const [pitch, setPitch] = useState<number>(20);
  const [distance, setDistance] = useState<number>(200);
  const [target, setTarget] = useState<[number, number, number]>([0, 0, 0]);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const rotationQuaternionRef = useRef<Quaternion>(eulerToQuaternion(-35, 20));
  const startSphereRef = useRef<[number, number, number] | null>(null);
  const distanceRef = useRef(distance);
  const targetRef = useRef<[number, number, number]>([0, 0, 0]);
  const isPanningRef = useRef(false);
  const lastPanPositionRef = useRef<{ x: number; y: number } | null>(null);
  
  // Keep refs in sync
  useEffect(() => {
    distanceRef.current = distance;
  }, [distance]);
  
  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  // Helper function to update camera position from quaternion, distance, and target
  const updateCameraPosition = (camera: THREE.PerspectiveCamera, q: Quaternion, dist: number, tgt: [number, number, number]) => {
    // Start with base direction (looking from positive x, y, z towards origin)
    const baseDir = new THREE.Vector3(1, 1, 1).normalize();
    const rotatedDir = rotateVector(baseDir.x, baseDir.y, baseDir.z, q);
    // Position camera at target + rotated direction * distance
    const targetVec = new THREE.Vector3(tgt[0], tgt[1], tgt[2]);
    camera.position.copy(targetVec.clone().add(rotatedDir.clone().multiplyScalar(dist)));
    camera.lookAt(targetVec);
  };

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

  // Initialize Three.js scene (only once)
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    if (width === 0 || height === 0) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    sceneRef.current = scene;

    // Camera - position will be set by quaternion rotation
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    updateCameraPosition(camera, rotationQuaternionRef.current, distanceRef.current, targetRef.current);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Points geometry (will be populated later)
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
      size: 1,
      vertexColors: true,
      sizeAttenuation: false
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);
    pointsRef.current = points;

    // Animation loop
    const animate = () => {
      if (!rendererRef.current || !sceneRef.current || !cameraRef.current) return;
      animationFrameRef.current = requestAnimationFrame(animate);
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup function
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener('resize', handleResize);
      if (containerRef.current && renderer.domElement.parentNode) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, []); // Only run once on mount

  // Update camera position when zoom changes (but preserve rotation)
  useEffect(() => {
    if (!cameraRef.current || isDraggingRef.current) return;
    updateCameraPosition(cameraRef.current, rotationQuaternionRef.current, baseDistance * zoom);
  }, [zoom]);

  // Sync quaternion with yaw/pitch when they change (but not during dragging or zooming)
  useEffect(() => {
    if (!isDraggingRef.current && cameraRef.current) {
      rotationQuaternionRef.current = eulerToQuaternion(yaw, pitch);
      updateCameraPosition(cameraRef.current, rotationQuaternionRef.current, baseDistance * zoom);
    }
  }, [yaw, pitch]);

  // Arcball: convert screen coordinates to sphere coordinates
  function screenToSphere(x: number, y: number, rect: DOMRect): [number, number, number] | null {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = Math.min(rect.width, rect.height) / 2;
    
    const dx = (x - centerX) / radius;
    const dy = (y - centerY) / radius;
    const d2 = dx * dx + dy * dy;
    
    if (d2 > 1) {
      // Outside sphere, project to edge
      const d = Math.sqrt(d2);
      return [dx / d, dy / d, 0];
    } else {
      // Inside sphere
      const dz = Math.sqrt(1 - d2);
      return [dx, dy, dz];
    }
  }

  // Set up arcball controls
  useEffect(() => {
    if (!rendererRef.current || !image) return;
    
    const canvas = rendererRef.current.domElement;
    if (!canvas) return;
    
    const onDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sphere = screenToSphere(e.clientX, e.clientY, rect);
      if (sphere) {
        isDraggingRef.current = true;
        setIsDragging(true);
        startSphereRef.current = sphere;
      }
    };
    
    const onMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !startSphereRef.current) return;
      
      const rect = canvas.getBoundingClientRect();
      const currentSphere = screenToSphere(e.clientX, e.clientY, rect);
      if (!currentSphere) return;
      
      // Calculate rotation axis and angle
      const [sx, sy, sz] = startSphereRef.current;
      const [cx, cy, cz] = currentSphere;
      
      // Cross product gives rotation axis
      const axis: [number, number, number] = [
        sy * cz - sz * cy,
        sz * cx - sx * cz,
        sx * cy - sy * cx,
      ];
      
      const axisLength = Math.sqrt(axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]);
      if (axisLength < 0.0001) return; // Too small movement
      
      // Normalize axis
      const normalizedAxis: [number, number, number] = [
        axis[0] / axisLength,
        axis[1] / axisLength,
        axis[2] / axisLength,
      ];
      
      // Dot product gives angle
      const dot = sx * cx + sy * cy + sz * cz;
      const angle = Math.acos(Math.max(-1, Math.min(1, dot))) * 0.8; // Scale for sensitivity
      
      // Create rotation quaternion
      const deltaQ = quaternionFromAxisAngle(normalizedAxis, angle);
      
      // Apply rotation
      rotationQuaternionRef.current = quaternionMultiply(deltaQ, rotationQuaternionRef.current);
      
      // Convert back to Euler for state
      const euler = quaternionToEuler(rotationQuaternionRef.current);
      setYaw(euler.yaw);
      setPitch(euler.pitch);
      
      // Update camera position
      if (cameraRef.current) {
        updateCameraPosition(cameraRef.current, rotationQuaternionRef.current, baseDistance * zoomRef.current);
      }
      
      // Update start position for next frame
      startSphereRef.current = currentSphere;
    };
    
    const onUp = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
      startSphereRef.current = null;
    };
    
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(e.deltaY * 0.0015); // Reversed: positive deltaY zooms in
      const newZoom = Math.max(0.5, Math.min(3, zoomRef.current * factor));
      setZoom(newZoom);
      // Update camera immediately to avoid delay
      if (cameraRef.current) {
        updateCameraPosition(cameraRef.current, rotationQuaternionRef.current, baseDistance * newZoom);
      }
    };
    
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    
    // Touch handlers with pinch-to-zoom support
    let initialDistance = 0;
    let initialZoom = zoomRef.current;
    
    const onTDown = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const t = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const sphere = screenToSphere(t.clientX, t.clientY, rect);
        if (sphere) {
          isDraggingRef.current = true;
          setIsDragging(true);
          startSphereRef.current = sphere;
        }
      } else if (e.touches.length === 2) {
        // Pinch to zoom
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        initialDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        initialZoom = zoomRef.current;
        isDraggingRef.current = false;
        setIsDragging(false);
      }
    };
    
    const onTMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && isDraggingRef.current && startSphereRef.current) {
        const t = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const currentSphere = screenToSphere(t.clientX, t.clientY, rect);
        if (!currentSphere) return;
        
        const [sx, sy, sz] = startSphereRef.current;
        const [cx, cy, cz] = currentSphere;
        
        const axis: [number, number, number] = [
          sy * cz - sz * cy,
          sz * cx - sx * cz,
          sx * cy - sy * cx,
        ];
        
        const axisLength = Math.sqrt(axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]);
        if (axisLength < 0.0001) return;
        
        const normalizedAxis: [number, number, number] = [
          axis[0] / axisLength,
          axis[1] / axisLength,
          axis[2] / axisLength,
        ];
        
        const dot = sx * cx + sy * cy + sz * cz;
        const angle = Math.acos(Math.max(-1, Math.min(1, dot))) * 0.8;
        
        const deltaQ = quaternionFromAxisAngle(normalizedAxis, angle);
        rotationQuaternionRef.current = quaternionMultiply(deltaQ, rotationQuaternionRef.current);
        
        const euler = quaternionToEuler(rotationQuaternionRef.current);
        setYaw(euler.yaw);
        setPitch(euler.pitch);
        
        if (cameraRef.current) {
          updateCameraPosition(cameraRef.current, rotationQuaternionRef.current, baseDistance * zoomRef.current);
        }
        
        startSphereRef.current = currentSphere;
      } else if (e.touches.length === 2 && initialDistance > 0) {
        // Pinch to zoom
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const scale = currentDistance / initialDistance;
        const newZoom = Math.max(0.5, Math.min(3, initialZoom * scale));
        setZoom(newZoom);
        if (cameraRef.current) {
          updateCameraPosition(cameraRef.current, rotationQuaternionRef.current, baseDistance * newZoom);
        }
      }
    };
    
    const onTUp = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        isDraggingRef.current = false;
        setIsDragging(false);
        startSphereRef.current = null;
        initialDistance = 0;
      } else if (e.touches.length === 1) {
        // Switch from pinch to rotate
        const t = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const sphere = screenToSphere(t.clientX, t.clientY, rect);
        if (sphere) {
          isDraggingRef.current = true;
          setIsDragging(true);
          startSphereRef.current = sphere;
        }
      }
    };
    
    canvas.addEventListener('touchstart', onTDown, { passive: false });
    window.addEventListener('touchmove', onTMove, { passive: false });
    window.addEventListener('touchend', onTUp);
    
    return () => {
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', onTDown);
      window.removeEventListener('touchmove', onTMove);
      window.removeEventListener('touchend', onTUp);
    };
  }, [image]);

  // Update points when pixels change (camera stays fixed)
  useEffect(() => {
    if (!pointsRef.current || !transformedPixels || transformedPixels.length === 0) {
      // Clear geometry if no pixels
      if (pointsRef.current) {
        const geometry = pointsRef.current.geometry;
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));
        geometry.setDrawRange(0, 0);
      }
      return;
    }

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

