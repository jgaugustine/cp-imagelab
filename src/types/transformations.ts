export type TransformationType = 'brightness' | 'contrast' | 'saturation' | 'vibrance' | 'hue';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export const TRANSFORM_LABELS: Record<TransformationType, string> = {
  brightness: 'Brightness',
  contrast: 'Contrast',
  saturation: 'Saturation',
  vibrance: 'Vibrance',
  hue: 'Hue'
};

export const TRANSFORM_ICONS: Record<TransformationType, string> = {
  brightness: 'Sun',
  contrast: 'CircleHalf',
  saturation: 'Palette',
  vibrance: 'Droplet',
  hue: 'Rainbow'
};

// Instance-based pipeline types (additive; keeps existing exports intact)
export type FilterKind = TransformationType | 'blur' | 'sharpen' | 'edge' | 'denoise';

export type BlurParams = {
  kind: 'box' | 'gaussian';
  size: 3 | 5 | 7;
  sigma?: number;
  stride?: number;
  padding?: 'zero' | 'reflect' | 'edge';
};

export type SharpenParams = {
  amount: number;
  size: 3 | 5;
  stride?: number;
  padding?: 'zero' | 'reflect' | 'edge';
  kernel?: number[][];
};

export type EdgeParams = {
  operator: 'sobel' | 'prewitt';
  size: 3 | 5;
  combine: 'magnitude' | 'x' | 'y';
  stride?: number;
  padding?: 'zero' | 'reflect' | 'edge';
};

export type DenoiseParams = {
  kind: 'median' | 'mean';
  size: 3 | 5 | 7;
  stride?: number;
  padding?: 'zero' | 'reflect' | 'edge';
};

export type FilterParams =
  | { value: number }
  | { vibrance: number }
  | { hue: number }
  | BlurParams
  | SharpenParams
  | EdgeParams
  | DenoiseParams;

export interface FilterInstance {
  id: string;
  kind: FilterKind;
  params: FilterParams;
  enabled: boolean;
}

// Helper: provide default params for each kind
export function defaultParamsFor(kind: FilterKind): FilterParams {
  switch (kind) {
    case 'brightness':
      return { value: 0 };
    case 'contrast':
      return { value: 1 };
    case 'saturation':
      return { value: 1 };
    case 'vibrance':
      return { vibrance: 0 };
    case 'hue':
      return { hue: 0 };
    case 'blur':
      return { kind: 'gaussian', size: 5, sigma: 1.0, stride: 1, padding: 'edge' } as BlurParams;
    case 'sharpen':
      return { amount: 1.0, size: 3, stride: 1, padding: 'edge' } as SharpenParams;
    case 'edge':
      return { operator: 'sobel', size: 3, combine: 'magnitude', stride: 1, padding: 'edge' } as EdgeParams;
    case 'denoise':
      return { kind: 'mean', size: 3, stride: 1, padding: 'edge' } as DenoiseParams;
  }
}

// Helper: format primary value for UI badges/labels
export function formatValueFor(kind: FilterKind, params: FilterParams): string {
  if (kind === 'brightness') {
    const v = (params as { value: number }).value;
    return v > 0 ? `+${v}` : `${v}`;
  }
  if (kind === 'contrast' || kind === 'saturation') {
    const v = (params as { value: number }).value;
    return `${v.toFixed(2)}x`;
  }
  if (kind === 'vibrance') {
    const v = (params as { vibrance: number }).vibrance;
    return v >= 0 ? `+${v.toFixed(2)}` : `${v.toFixed(2)}`;
  }
  if (kind === 'hue') {
    const deg = (params as { hue: number }).hue;
    return `${deg > 0 ? '+' : ''}${deg}°`;
  }
  if (kind === 'blur') {
    const p = params as BlurParams;
    const s = p.stride ?? 1;
    return `${p.kind} ${p.size}×${p.size} s${s}`;
  }
  if (kind === 'sharpen') {
    const p = params as SharpenParams;
    const s = p.stride ?? 1;
    return `amt ${p.amount.toFixed(2)} ${p.size}×${p.size} s${s}`;
  }
  if (kind === 'edge') {
    const p = params as EdgeParams;
    const s = p.stride ?? 1;
    return `${p.operator} ${p.combine} ${p.size}×${p.size} s${s}`;
  }
  if (kind === 'denoise') {
    const p = params as DenoiseParams;
    const s = p.stride ?? 1;
    return `${p.kind} ${p.size}×${p.size} s${s}`;
  }
  return '';
}

// Central registry (lightweight; image processing remains in components for now)
export interface TransformRegistryItem {
  kind: FilterKind;
  label: string;
  // whether this transform is inherently per-pixel (cannot be represented purely by a single 3x3 + offset)
  isPerPixel: boolean;
  // supply default params
  defaults: () => FilterParams;
}

export const TRANSFORM_REGISTRY: Record<FilterKind, TransformRegistryItem> = {
  brightness: {
    kind: 'brightness',
    label: TRANSFORM_LABELS.brightness,
    isPerPixel: false,
    defaults: () => ({ value: 0 })
  },
  contrast: {
    kind: 'contrast',
    label: TRANSFORM_LABELS.contrast,
    isPerPixel: false,
    defaults: () => ({ value: 1 })
  },
  saturation: {
    kind: 'saturation',
    label: TRANSFORM_LABELS.saturation,
    // Note: can be matrix (gamma) or per-pixel (linear). We keep false here; caller decides per mode.
    isPerPixel: false,
    defaults: () => ({ value: 1 })
  },
  vibrance: {
    kind: 'vibrance',
    label: TRANSFORM_LABELS.vibrance,
    isPerPixel: true,
    defaults: () => ({ vibrance: 0 })
  },
  hue: {
    kind: 'hue',
    label: TRANSFORM_LABELS.hue,
    isPerPixel: false,
    defaults: () => ({ hue: 0 })
  },
  blur: {
    kind: 'blur',
    label: 'Blur',
    isPerPixel: true,
    defaults: () => ({ kind: 'gaussian', size: 5, sigma: 1.0, stride: 1, padding: 'edge' } as BlurParams)
  },
  sharpen: {
    kind: 'sharpen',
    label: 'Sharpen',
    isPerPixel: true,
    defaults: () => ({ amount: 1.0, size: 3, stride: 1, padding: 'edge' } as SharpenParams)
  },
  edge: {
    kind: 'edge',
    label: 'Edge Detect',
    isPerPixel: true,
    defaults: () => ({ operator: 'sobel', size: 3, combine: 'magnitude', stride: 1, padding: 'edge' } as EdgeParams)
  },
  denoise: {
    kind: 'denoise',
    label: 'Denoise',
    isPerPixel: true,
    defaults: () => ({ kind: 'mean', size: 3, stride: 1, padding: 'edge' } as DenoiseParams)
  }
};
