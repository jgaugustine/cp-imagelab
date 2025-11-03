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
export type FilterKind = TransformationType;

export type FilterParams =
  | { value: number } // brightness, contrast, saturation share value
  | { vibrance: number } // vibrance
  | { hue: number }; // hue in degrees

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
  // hue
  const deg = (params as { hue: number }).hue;
  return `${deg > 0 ? '+' : ''}${deg}°`;
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
  }
};
