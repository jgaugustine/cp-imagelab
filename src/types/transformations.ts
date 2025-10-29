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
