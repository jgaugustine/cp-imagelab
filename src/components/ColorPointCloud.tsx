import { useEffect, useRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import { TransformationType, RGB, FilterInstance, BlurParams, SharpenParams, EdgeParams, DenoiseParams, CustomConvParams } from '@/types/transformations';
import { cpuConvolutionBackend } from '@/lib/convolutionBackend';
import { gaussianKernel, boxKernel, sobelKernels, prewittKernels, unsharpKernel } from '@/lib/convolution';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

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

// Helper function to create text sprite
function createTextSprite(text: string, color: string = '#ffffff'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not get canvas context');
  
  canvas.width = 256;
  canvas.height = 256;
  
  context.fillStyle = 'rgba(0, 0, 0, 0)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  
  context.font = 'Bold 64px Arial';
  context.fillStyle = color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(20, 20, 1);
  
  return sprite;
}

// Helper function to create a simple arrow using a cone only (simpler, avoids stack issues)
function createArrow(direction: THREE.Vector3, length: number, color: number): THREE.Mesh {
  // Normalize direction without mutating the original
  const dir = direction.clone().normalize();
  
  // Create arrowhead using a cone
  const coneRadius = Math.max(1, length * 0.05);
  const coneGeometry = new THREE.ConeGeometry(coneRadius, length, 8, 1);
  const coneMaterial = new THREE.MeshBasicMaterial({ 
    color,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: true
  });
  const cone = new THREE.Mesh(coneGeometry, coneMaterial);
  cone.visible = true;
  cone.renderOrder = 1000;
  
  // Position cone at the end point
  const endPoint = new THREE.Vector3(
    dir.x * length,
    dir.y * length,
    dir.z * length
  );
  cone.position.copy(endPoint);
  
  // Rotate cone to point in the direction
  const up = new THREE.Vector3(0, 1, 0);
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(up, dir);
  cone.quaternion.copy(quaternion);
  
  return cone;
}

// Helper function to create labeled axes that extend in both directions
function createLabeledAxes(
  center: [number, number, number], 
  axisLength: number = 50,
  labels: { x: string; y: string; z: string } = { x: 'X', y: 'Y', z: 'Z' }
): THREE.Group {
  const group = new THREE.Group();
  group.visible = true;
  
  const xLabel = labels.x;
  const yLabel = labels.y;
  const zLabel = labels.z;
  
  // X-axis (red) - extends in both +X and -X directions
  const xGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-axisLength, 0, 0),
    new THREE.Vector3(axisLength, 0, 0)
  ]);
  const xMaterial = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
  const xLine = new THREE.Line(xGeometry, xMaterial);
  group.add(xLine);
  
  // X-axis arrow (positive direction)
  const xArrow = createArrow(new THREE.Vector3(1, 0, 0), axisLength * 0.15, 0xff0000);
  xArrow.position.set(axisLength * 0.85, 0, 0);
  group.add(xArrow);
  
  // X-axis label
  try {
    const xSprite = createTextSprite(xLabel, '#ff0000');
    xSprite.position.set(axisLength * 1.1, 0, 0);
    group.add(xSprite);
  } catch (e) {
    console.warn('Failed to create X-axis label:', e);
  }
  
  // Y-axis (green) - extends in both +Y and -Y directions
  const yGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -axisLength, 0),
    new THREE.Vector3(0, axisLength, 0)
  ]);
  const yMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
  const yLine = new THREE.Line(yGeometry, yMaterial);
  group.add(yLine);
  
  // Y-axis arrow (positive direction)
  const yArrow = createArrow(new THREE.Vector3(0, 1, 0), axisLength * 0.15, 0x00ff00);
  yArrow.position.set(0, axisLength * 0.85, 0);
  group.add(yArrow);
  
  // Y-axis label
  try {
    const ySprite = createTextSprite(yLabel, '#00ff00');
    ySprite.position.set(0, axisLength * 1.1, 0);
    group.add(ySprite);
  } catch (e) {
    console.warn('Failed to create Y-axis label:', e);
  }
  
  // Z-axis (blue) - extends in both +Z and -Z directions
  const zGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, -axisLength),
    new THREE.Vector3(0, 0, axisLength)
  ]);
  const zMaterial = new THREE.LineBasicMaterial({ color: 0x0000ff, linewidth: 2 });
  const zLine = new THREE.Line(zGeometry, zMaterial);
  group.add(zLine);
  
  // Z-axis arrow (positive direction)
  const zArrow = createArrow(new THREE.Vector3(0, 0, 1), axisLength * 0.15, 0x0000ff);
  zArrow.position.set(0, 0, axisLength * 0.85);
  group.add(zArrow);
  
  // Z-axis label
  try {
    const zSprite = createTextSprite(zLabel, '#0000ff');
    zSprite.position.set(0, 0, axisLength * 1.1);
    group.add(zSprite);
  } catch (e) {
    console.warn('Failed to create Z-axis label:', e);
  }
  
  // Position the group at the center
  group.position.set(center[0], center[1], center[2]);
  
  return group;
}

interface ColorPointCloudProps {
  image: HTMLImageElement | null;
  pipeline?: FilterInstance[];
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  whites?: number;
  blacks?: number;
  linearSaturation?: boolean;
  vibrance?: number;
  transformOrder: TransformationType[];
  onColorSpaceChange?: (colorSpace: ColorSpace) => void;
}

const clamp = (val: number): number => Math.max(0, Math.min(255, val));

// Color space type
type ColorSpace = 'rgb' | 'hsv' | 'hsl' | 'lab' | 'ycbcr';

// Color space conversion functions
function rgbToHsv(rgb: RGB): { h: number; s: number; v: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  
  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
  }
  h = h * 60;
  if (h < 0) h += 360;
  
  const s = max === 0 ? 0 : delta / max;
  const v = max;
  
  return { h, s, v };
}

function rgbToHsl(rgb: RGB): { h: number; s: number; l: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  
  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
  }
  h = h * 60;
  if (h < 0) h += 360;
  
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  
  return { h, s, l };
}

// RGB to XYZ conversion (D65 illuminant, sRGB reference white)
function rgbToXyz(rgb: RGB): { x: number; y: number; z: number } {
  // Convert sRGB to linear RGB
  const linearize = (c: number) => {
    const val = c / 255;
    return val <= 0.04045 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  };
  
  const r = linearize(rgb.r);
  const g = linearize(rgb.g);
  const b = linearize(rgb.b);
  
  // sRGB to XYZ matrix (D65)
  const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  const z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;
  
  return { x, y, z };
}

// XYZ to Lab conversion (D65 reference white)
function xyzToLab(xyz: { x: number; y: number; z: number }): { l: number; a: number; b: number } {
  // D65 reference white (sRGB)
  const xn = 0.95047;
  const yn = 1.0;
  const zn = 1.08883;
  
  // Clamp values to avoid division by zero or negative values
  const x = Math.max(0, xyz.x);
  const y = Math.max(0, xyz.y);
  const z = Math.max(0, xyz.z);
  
  const fx = x / xn > 0.008856 ? Math.pow(x / xn, 1/3) : (7.787 * x / xn + 16/116);
  const fy = y / yn > 0.008856 ? Math.pow(y / yn, 1/3) : (7.787 * y / yn + 16/116);
  const fz = z / zn > 0.008856 ? Math.pow(z / zn, 1/3) : (7.787 * z / zn + 16/116);
  
  const l = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const b = 200 * (fy - fz);
  
  return { l, a, b };
}

function rgbToLab(rgb: RGB): { l: number; a: number; b: number } {
  const xyz = rgbToXyz(rgb);
  return xyzToLab(xyz);
}

function rgbToYcbcr(rgb: RGB): { y: number; cb: number; cr: number } {
  // ITU-R BT.601 standard conversion
  // Y is in range 0-255
  // Cb and Cr formulas produce values in range 0-255 (centered at 128)
  // We subtract 128 to get -128 to 127 range for visualization
  const y = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  const cb = -0.168736 * rgb.r - 0.331264 * rgb.g + 0.5 * rgb.b + 128;
  const cr = 0.5 * rgb.r - 0.418688 * rgb.g - 0.081312 * rgb.b + 128;
  
  // Normalize Cb and Cr to -128 to 127 range
  return { 
    y, 
    cb: cb - 128, 
    cr: cr - 128 
  };
}

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

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const applyWhites = (rgb: RGB, value: number): RGB => {
  if (value === 0) return rgb;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  const weight = smoothstep(0.4, 0.8, luminance);
  const adjustment = value * weight;
  return {
    r: clamp(rgb.r + adjustment),
    g: clamp(rgb.g + adjustment),
    b: clamp(rgb.b + adjustment)
  };
};

const applyBlacks = (rgb: RGB, value: number): RGB => {
  if (value === 0) return rgb;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  const weight = smoothstep(0.8, 0.2, luminance);
  const adjustment = value * weight;
  return {
    r: clamp(rgb.r + adjustment),
    g: clamp(rgb.g + adjustment),
    b: clamp(rgb.b + adjustment)
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

export function ColorPointCloud({ image, pipeline, brightness, contrast, saturation, hue, whites = 0, blacks = 0, linearSaturation = false, vibrance = 0, transformOrder, onColorSpaceChange }: ColorPointCloudProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const axesGroupRef = useRef<THREE.Group | null>(null);
  
  // Color space selection state
  const [colorSpace, setColorSpace] = useState<ColorSpace>('rgb');
  const [showAxes, setShowAxes] = useState<boolean>(false);
  
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

  // Notify parent when color space changes
  useEffect(() => {
    onColorSpaceChange?.(colorSpace);
  }, [colorSpace, onColorSpaceChange]);

  // Helper function to update camera position from quaternion, distance, and target
  const updateCameraPosition = (camera: THREE.PerspectiveCamera, q: Quaternion, dist: number, tgt: [number, number, number]) => {
    // Start with base direction (looking from positive x, y, z towards origin)
    const baseDir = new THREE.Vector3(1, 1, 1).normalize();
    const rotatedDir = rotateVector(baseDir.x, baseDir.y, baseDir.z, q);
    // Position camera at target + rotated direction * distance
    const targetVec = new THREE.Vector3(tgt[0], tgt[1], tgt[2]);
    camera.position.copy(targetVec.clone().add(rotatedDir.clone().multiplyScalar(dist)));
    
    // Calculate view direction (from camera to target)
    const viewDir = new THREE.Vector3().subVectors(targetVec, camera.position).normalize();
    
    // Update up vector based on rotation
    const worldUp = new THREE.Vector3(0, 1, 0);
    let rotatedUp = rotateVector(worldUp.x, worldUp.y, worldUp.z, q).normalize();
    
    // Ensure up vector is never parallel to view direction (causes lookAt to fail)
    const dotProduct = rotatedUp.dot(viewDir);
    const threshold = 0.99; // If almost parallel (cosine close to 1 or -1)
    
    if (Math.abs(dotProduct) > threshold) {
      // Find a perpendicular vector by crossing with a default direction
      // Try different default directions to avoid edge cases
      const defaultDir = Math.abs(viewDir.x) < 0.9 
        ? new THREE.Vector3(1, 0, 0) 
        : new THREE.Vector3(0, 0, 1);
      const perpendicular = new THREE.Vector3().crossVectors(viewDir, defaultDir).normalize();
      rotatedUp = new THREE.Vector3().crossVectors(perpendicular, viewDir).normalize();
    }
    
    // Set up vector before lookAt to ensure consistent orientation
    camera.up.copy(rotatedUp);
    camera.lookAt(targetVec);
  };

  // Extract and transform pixel data
  const transformedPixels = useMemo(() => {
    if (!image || !image.complete || image.naturalWidth === 0) return null;

    try {
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
          if (t === 'whites') return { type: t, value: whites };
          if (t === 'blacks') return { type: t, value: blacks };
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
            const isPerPixel = stype === 'vibrance' || stype === 'whites' || stype === 'blacks' || (stype === 'saturation' && linearSaturation);
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
              } else if (stype === 'whites') {
                transformed = applyWhites(rgb, sval);
              } else if (stype === 'blacks') {
                transformed = applyBlacks(rgb, sval);
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
          if (inst.kind === 'brightness' || inst.kind === 'contrast' || inst.kind === 'saturation' || inst.kind === 'hue' || inst.kind === 'vibrance' || inst.kind === 'whites' || inst.kind === 'blacks') {
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
                if (kind === 'whites') transformed = applyWhites(rgb, sval);
                if (kind === 'blacks') transformed = applyBlacks(rgb, sval);
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

      // Extract pixel data and convert to selected color space
      const pixels: { position: [number, number, number]; color: [number, number, number] }[] = [];
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha === 0) continue; // Skip transparent pixels
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const rgb: RGB = { r, g, b };
        
        // Convert to selected color space and map to 3D coordinates
        let position: [number, number, number];
        
        if (colorSpace === 'rgb') {
          // RGB: centered around origin (-128 to 128)
          position = [r - 128, g - 128, b - 128];
        } else if (colorSpace === 'hsv') {
          const hsv = rgbToHsv(rgb);
          // H scaled to -180 to 180, S/V to -128 to 127
          position = [hsv.h * 2 - 180, hsv.s * 255 - 128, hsv.v * 255 - 128];
        } else if (colorSpace === 'hsl') {
          const hsl = rgbToHsl(rgb);
          // H scaled to -180 to 180, S/L to -128 to 127
          position = [hsl.h * 2 - 180, hsl.s * 255 - 128, hsl.l * 255 - 128];
        } else if (colorSpace === 'lab') {
          const lab = rgbToLab(rgb);
          // L scaled to -128 to 127, a/b already in approximate range
          // Clamp a and b to reasonable range to avoid extreme values
          position = [
            Math.max(-200, Math.min(200, lab.a)),
            Math.max(-200, Math.min(200, lab.l * 2.55 - 128)),
            Math.max(-200, Math.min(200, lab.b))
          ];
        } else if (colorSpace === 'ycbcr') {
          const ycbcr = rgbToYcbcr(rgb);
          // Y scaled to -128 to 127, Cb/Cr already in range
          position = [ycbcr.y - 128, ycbcr.cb, ycbcr.cr];
        } else {
          // Fallback to RGB
          position = [r - 128, g - 128, b - 128];
        }
        
        // Validate position values (check for NaN or Infinity)
        if (!position.every(val => isFinite(val) && !isNaN(val))) {
          // Skip invalid pixels
          continue;
        }
        
        // Always use RGB for point colors (for consistent visual appearance)
        pixels.push({
          position,
          color: [r / 255, g / 255, b / 255]
        });
      }

      return pixels;
    } catch (error) {
      console.error('Error processing pixels:', error);
      return null;
    }
  }, [image, pipeline, brightness, contrast, saturation, hue, whites, blacks, linearSaturation, vibrance, transformOrder, colorSpace]);

  // Calculate center of point cloud - use a ref to avoid dependency issues
  const cloudCenterRef = useRef<[number, number, number]>([0, 0, 0]);
  
  // Update center when pixels change, but don't create new array references
  useEffect(() => {
    if (!transformedPixels || transformedPixels.length === 0) {
      cloudCenterRef.current = [0, 0, 0];
      return;
    }
    
    let sumX = 0, sumY = 0, sumZ = 0;
    transformedPixels.forEach(pixel => {
      sumX += pixel.position[0];
      sumY += pixel.position[1];
      sumZ += pixel.position[2];
    });
    
    const count = transformedPixels.length;
    const center: [number, number, number] = [sumX / count, sumY / count, sumZ / count];
    
    // Only update if significantly different (avoid floating point noise)
    const prev = cloudCenterRef.current;
    const threshold = 0.1;
    if (Math.abs(center[0] - prev[0]) > threshold || 
        Math.abs(center[1] - prev[1]) > threshold || 
        Math.abs(center[2] - prev[2]) > threshold) {
      cloudCenterRef.current[0] = center[0];
      cloudCenterRef.current[1] = center[1];
      cloudCenterRef.current[2] = center[2];
    }
  }, [transformedPixels]);
  
  const cloudCenter = cloudCenterRef.current;

  // Get axis labels based on color space
  const getAxisLabels = (space: ColorSpace): { x: string; y: string; z: string } => {
    switch (space) {
      case 'rgb':
        return { x: 'R', y: 'G', z: 'B' };
      case 'hsv':
        return { x: 'H', y: 'S', z: 'V' };
      case 'hsl':
        return { x: 'H', y: 'S', z: 'L' };
      case 'lab':
        return { x: 'a', y: 'L', z: 'b' };
      case 'ycbcr':
        return { x: 'Y', y: 'Cb', z: 'Cr' };
      default:
        return { x: 'X', y: 'Y', z: 'Z' };
    }
  };

  // Initialize Three.js scene (only once)
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    let resizeObserver: ResizeObserver | null = null;
    
    // Function to initialize or update Three.js
    const initThree = () => {
      try {
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        if (width === 0 || height === 0) return false;

        // If renderer already exists, just update size
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          cameraRef.current.aspect = width / height;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setSize(width, height);
          return true;
        }

        // Scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a1a);
        sceneRef.current = scene;

        // Camera - position will be set by quaternion rotation
        const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        camera.up.set(0, 1, 0); // Set up vector to Y axis
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
        
        return true;
      } catch (error) {
        console.error('Error initializing Three.js:', error);
        return false;
      }
    };

    // Try to initialize immediately
    let timeoutId: NodeJS.Timeout | null = null;
    if (!initThree()) {
      // If container has no size, wait a bit and try again
      timeoutId = setTimeout(() => {
        initThree();
      }, 100);
    }

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      if (width === 0 || height === 0) return;
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);

    // Use ResizeObserver to handle container size changes
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        handleResize();
        // If not initialized yet, try again
        if (!rendererRef.current && containerRef.current) {
          initThree();
        }
      });
      resizeObserver.observe(container);
    }

    // Cleanup function
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (rendererRef.current) {
        if (containerRef.current && rendererRef.current.domElement.parentNode) {
          containerRef.current.removeChild(rendererRef.current.domElement);
        }
        rendererRef.current.dispose();
      }
      if (pointsRef.current) {
        pointsRef.current.geometry.dispose();
        (pointsRef.current.material as THREE.PointsMaterial).dispose();
      }
    };
  }, []); // Only run once on mount

  // Update camera position when distance or target changes (but preserve rotation)
  useEffect(() => {
    if (!cameraRef.current || isDraggingRef.current || isPanningRef.current) return;
    updateCameraPosition(cameraRef.current, rotationQuaternionRef.current, distance, target);
  }, [distance, target]);

  // Sync quaternion with yaw/pitch when they change (but not during dragging or panning)
  useEffect(() => {
    if (!isDraggingRef.current && !isPanningRef.current && cameraRef.current) {
      rotationQuaternionRef.current = eulerToQuaternion(yaw, pitch);
      updateCameraPosition(cameraRef.current, rotationQuaternionRef.current, distance, target);
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
      
      // Right click or middle mouse = pan
      if (e.button === 2 || e.button === 1) {
        e.preventDefault();
        isPanningRef.current = true;
        lastPanPositionRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
      
      // Left click = rotate
      if (e.button === 0) {
        const sphere = screenToSphere(e.clientX, e.clientY, rect);
        if (sphere) {
          isDraggingRef.current = true;
          setIsDragging(true);
          startSphereRef.current = sphere;
        }
      }
    };
    
    const onMove = (e: MouseEvent) => {
      // Panning (right/middle mouse drag)
      if (isPanningRef.current && lastPanPositionRef.current && cameraRef.current) {
        const deltaX = e.clientX - lastPanPositionRef.current.x;
        const deltaY = e.clientY - lastPanPositionRef.current.y;
        
        // Calculate pan distance based on camera distance
        const panSpeed = distanceRef.current * 0.001;
        const panX = -deltaX * panSpeed;
        const panY = deltaY * panSpeed;
        
        // Get camera's right and up vectors
        const targetVec = new THREE.Vector3(targetRef.current[0], targetRef.current[1], targetRef.current[2]);
        const cameraDir = new THREE.Vector3().subVectors(targetVec, cameraRef.current.position).normalize();
        const worldUp = new THREE.Vector3(0, 1, 0);
        const cameraRight = new THREE.Vector3().crossVectors(cameraDir, worldUp).normalize();
        const cameraUp = new THREE.Vector3().crossVectors(cameraRight, cameraDir).normalize();
        
        // Pan the target
        const newTarget: [number, number, number] = [
          targetRef.current[0] + cameraRight.x * panX + cameraUp.x * panY,
          targetRef.current[1] + cameraRight.y * panX + cameraUp.y * panY,
          targetRef.current[2] + cameraRight.z * panX + cameraUp.z * panY,
        ];
        setTarget(newTarget);
        lastPanPositionRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
      
      // Rotating (left mouse drag)
      if (isDraggingRef.current && startSphereRef.current) {
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
          updateCameraPosition(cameraRef.current, rotationQuaternionRef.current, distanceRef.current, targetRef.current);
        }
        
        // Update start position for next frame
        startSphereRef.current = currentSphere;
      }
    };
    
    const onUp = (e: MouseEvent) => {
      if (e.button === 2 || e.button === 1) {
        isPanningRef.current = false;
        lastPanPositionRef.current = null;
      } else if (e.button === 0) {
        isDraggingRef.current = false;
        setIsDragging(false);
        startSphereRef.current = null;
      }
    };
    
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!cameraRef.current) return;
      
      const factor = Math.exp(e.deltaY * 0.0015);
      const oldDistance = distanceRef.current;
      const newDistance = Math.max(1, Math.min(5000, oldDistance * factor));
      
      // Calculate zoom-to-cursor: find 3D point under cursor
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      
      // Create a raycaster to find the point under the cursor
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, cameraRef.current);
      
      // Calculate the intersection point on a plane perpendicular to camera direction through target
      const targetVec = new THREE.Vector3(targetRef.current[0], targetRef.current[1], targetRef.current[2]);
      const cameraDir = new THREE.Vector3().subVectors(targetVec, cameraRef.current.position).normalize();
      // Plane normal is camera direction, plane passes through target
      const plane = new THREE.Plane();
      plane.setFromNormalAndCoplanarPoint(cameraDir, targetVec);
      const intersection = new THREE.Vector3();
      const hasIntersection = raycaster.ray.intersectPlane(plane, intersection);
      
      // If we found an intersection, adjust the target to zoom towards that point
      if (hasIntersection) {
        const zoomRatio = 1 - (newDistance / oldDistance);
        const targetOffset = new THREE.Vector3().subVectors(intersection, targetVec);
        const newTarget: [number, number, number] = [
          targetRef.current[0] + targetOffset.x * zoomRatio,
          targetRef.current[1] + targetOffset.y * zoomRatio,
          targetRef.current[2] + targetOffset.z * zoomRatio,
        ];
        targetRef.current = newTarget;
        setTarget(newTarget);
      }
      
      // Update distance ref immediately to prevent race conditions
      distanceRef.current = newDistance;
      setDistance(newDistance);
      // Update camera immediately using current quaternion (don't recalculate rotation)
      updateCameraPosition(cameraRef.current, rotationQuaternionRef.current, newDistance, targetRef.current);
    };
    
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault(); // Prevent context menu on right click
    };
    
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    
    // Touch handlers with pinch-to-zoom support
    let initialDistance = 0;
    let initialZoom = distanceRef.current;
    
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
        initialZoom = distanceRef.current;
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
          updateCameraPosition(cameraRef.current, rotationQuaternionRef.current, distanceRef.current, targetRef.current);
        }
        
        startSphereRef.current = currentSphere;
      } else if (e.touches.length === 2 && initialDistance > 0) {
        // Pinch to zoom (zoom to center for touch, since we don't have a cursor position)
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const scale = currentDistance / initialDistance;
        const newDistance = Math.max(1, Math.min(5000, initialZoom * scale));
        setDistance(newDistance);
        if (cameraRef.current) {
          updateCameraPosition(cameraRef.current, rotationQuaternionRef.current, newDistance, targetRef.current);
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
      canvas.removeEventListener('contextmenu', onContextMenu);
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

  // Manage axes visibility and updates
  useEffect(() => {
    if (!sceneRef.current) return;
    
    // Early return if we don't need axes
    if (!showAxes || !transformedPixels || transformedPixels.length === 0) {
      // Remove axes if toggle is off
      if (axesGroupRef.current) {
        const axesToRemove = axesGroupRef.current;
        axesGroupRef.current = null;
        sceneRef.current.remove(axesToRemove);
        // Simple disposal without traverse to avoid stack overflow
        if (axesToRemove.children) {
          axesToRemove.children.forEach((child) => {
            if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
              if (child.geometry) child.geometry.dispose();
              if (child.material) {
                if (Array.isArray(child.material)) {
                  child.material.forEach(m => m.dispose());
                } else {
                  child.material.dispose();
                }
              }
            } else if (child instanceof THREE.Sprite) {
              if (child.material) {
                if (child.material.map) child.material.map.dispose();
                child.material.dispose();
              }
            } else if (child instanceof THREE.Group) {
              // Dispose of group children
              child.children.forEach((grandchild) => {
                if (grandchild instanceof THREE.Mesh || grandchild instanceof THREE.Line) {
                  if (grandchild.geometry) grandchild.geometry.dispose();
                  if (grandchild.material) {
                    if (Array.isArray(grandchild.material)) {
                      grandchild.material.forEach(m => m.dispose());
                    } else {
                      grandchild.material.dispose();
                    }
                  }
                }
              });
            }
          });
        }
      }
      
      // Remove test axes
      const testAxes = sceneRef.current.getObjectByName('testAxes');
      if (testAxes) {
        sceneRef.current.remove(testAxes);
      }
      return;
    }

    // Remove existing axes if any (before creating new ones)
    if (axesGroupRef.current) {
      const axesToRemove = axesGroupRef.current;
      axesGroupRef.current = null;
      sceneRef.current.remove(axesToRemove);
      // Simple disposal without deep traverse
      if (axesToRemove.children) {
        axesToRemove.children.forEach((child) => {
          if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
              } else {
                child.material.dispose();
              }
            }
          } else if (child instanceof THREE.Sprite) {
            if (child.material) {
              if (child.material.map) child.material.map.dispose();
              child.material.dispose();
            }
          } else if (child instanceof THREE.Group) {
            child.children.forEach((grandchild) => {
              if (grandchild instanceof THREE.Mesh || grandchild instanceof THREE.Line) {
                if (grandchild.geometry) grandchild.geometry.dispose();
                if (grandchild.material) {
                  if (Array.isArray(grandchild.material)) {
                    grandchild.material.forEach(m => m.dispose());
                  } else {
                    grandchild.material.dispose();
                  }
                }
              }
            });
          }
        });
      }
    }
    

    // Add axes if toggle is on
    try {
      const labels = getAxisLabels(colorSpace);
      // Calculate axis length based on point cloud spread
      const positions = transformedPixels.map(p => p.position);
      if (positions.length === 0) return;
      
      // Calculate min/max without using spread operator to avoid stack overflow
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minZ = Infinity, maxZ = -Infinity;
      
      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        if (pos[0] < minX) minX = pos[0];
        if (pos[0] > maxX) maxX = pos[0];
        if (pos[1] < minY) minY = pos[1];
        if (pos[1] > maxY) maxY = pos[1];
        if (pos[2] < minZ) minZ = pos[2];
        if (pos[2] > maxZ) maxZ = pos[2];
      }
        
      const spreadX = maxX - minX;
      const spreadY = maxY - minY;
      const spreadZ = maxZ - minZ;
      const maxSpread = Math.max(spreadX, spreadY, spreadZ);
      // Make axes more visible - use 30% of spread or minimum 50 units
      const axisLength = Math.max(50, maxSpread * 0.3);
      
      // Create axes at the cloud center
      const axes = createLabeledAxes(cloudCenter, axisLength, labels);
      axesGroupRef.current = axes;
      axes.renderOrder = 1000; // Ensure axes render on top
      sceneRef.current.add(axes);
      
      console.log('Axes created successfully');
    } catch (error) {
      console.error('Error creating axes:', error);
    }
  }, [showAxes, colorSpace, transformedPixels]);

  if (!image) {
    return (
      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
        No image loaded
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="mb-3 flex items-center gap-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-foreground">Color Space:</label>
          <Select value={colorSpace} onValueChange={(value) => setColorSpace(value as ColorSpace)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rgb">RGB</SelectItem>
              <SelectItem value="hsv">HSV</SelectItem>
              <SelectItem value="hsl">HSL</SelectItem>
              <SelectItem value="lab">Lab</SelectItem>
              <SelectItem value="ycbcr">YCbCr</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="show-axes" className="text-sm font-medium text-foreground cursor-pointer">
            Show Axes
          </Label>
          <Switch
            id="show-axes"
            checked={showAxes}
            onCheckedChange={setShowAxes}
          />
        </div>
      </div>
      <div ref={containerRef} className="w-full flex-1" style={{ minHeight: 0 }} />
    </div>
  );
}

