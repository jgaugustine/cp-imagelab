import { DndContext, closestCenter, DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Sun, Circle, Palette, Rainbow, Droplet, RotateCcw, CircleDot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TransformationType, FilterKind, FilterInstance, formatValueFor, BlurParams, SharpenParams, EdgeParams, DenoiseParams, CustomConvParams } from '@/types/transformations';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus } from 'lucide-react';
import { DraggableSliderCard } from './DraggableSliderCard';

interface AdjustmentLayerProps {
  transformOrder: TransformationType[];
  onOrderChange: (newOrder: TransformationType[]) => void;
  // New instance-based API (optional until refactor completes)
  pipeline?: FilterInstance[];
  onReorderInstances?: (activeId: string, overId: string) => void;
  onAddInstance?: (kind: FilterKind) => void;
  onDuplicateInstance?: (id: string) => void;
  onDeleteInstance?: (id: string) => void;
  onToggleInstance?: (id: string) => void;
  onChangeInstanceParams?: (id: string, kind: FilterKind, nextValue: number) => void;
  brightness: number;
  setBrightness: (value: number) => void;
  contrast: number;
  setContrast: (value: number) => void;
  saturation: number;
  setSaturation: (value: number) => void;
  vibrance: number;
  setVibrance: (value: number) => void;
  hue: number;
  setHue: (value: number) => void;
  whites: number;
  setWhites: (value: number) => void;
  blacks: number;
  setBlacks: (value: number) => void;
  onResetAll: () => void;
  onCardClick?: (transformType: TransformationType) => void;
  onInstanceSelect?: (instanceId: string) => void;
  activeTab?: string;
  image?: HTMLImageElement | null;
}

const getIcon = (type: TransformationType) => {
  switch (type) {
    case 'brightness':
      return <Sun className="w-5 h-5" />;
    case 'contrast':
      return <Circle className="w-5 h-5" />;
    case 'saturation':
      return <Palette className="w-5 h-5" />;
    case 'vibrance':
      return <Droplet className="w-5 h-5" />;
    case 'hue':
      return <Rainbow className="w-5 h-5" />;
    case 'whites':
      return <CircleDot className="w-5 h-5" />;
    case 'blacks':
      return <Circle className="w-5 h-5" />;
  }
};

const getTransformConfig = (type: TransformationType) => {
  switch (type) {
    case 'brightness':
      return { min: -100, max: 100, step: 1, defaultValue: 0, formatValue: (v: number) => v > 0 ? `+${v}` : `${v}` };
    case 'contrast':
      return { min: 0, max: 2, step: 0.01, defaultValue: 1, formatValue: (v: number) => `${v.toFixed(2)}x` };
    case 'saturation':
      return { min: 0, max: 2, step: 0.01, defaultValue: 1, formatValue: (v: number) => `${v.toFixed(2)}x` };
    case 'vibrance':
      return { min: -1, max: 1, step: 0.01, defaultValue: 0, formatValue: (v: number) => v >= 0 ? `+${v.toFixed(2)}` : `${v.toFixed(2)}` };
    case 'hue':
      return { min: -180, max: 180, step: 1, defaultValue: 0, formatValue: (v: number) => `${v > 0 ? '+' : ''}${v}°` };
    case 'whites':
      return { min: -100, max: 100, step: 1, defaultValue: 0, formatValue: (v: number) => v > 0 ? `+${v}` : `${v}` };
    case 'blacks':
      return { min: -100, max: 100, step: 1, defaultValue: 0, formatValue: (v: number) => v > 0 ? `+${v}` : `${v}` };
  }
};

type ValueProps = Pick<AdjustmentLayerProps,
  'brightness' | 'contrast' | 'saturation' | 'vibrance' | 'hue' | 'whites' | 'blacks'
>;

const getValue = (type: TransformationType, props: ValueProps): number => {
  switch (type) {
    case 'brightness': return props.brightness;
    case 'contrast': return props.contrast;
    case 'saturation': return props.saturation;
    case 'vibrance': return props.vibrance;
    case 'hue': return props.hue;
    case 'whites': return props.whites;
    case 'blacks': return props.blacks;
  }
};

type SetterProps = Pick<AdjustmentLayerProps,
  'setBrightness' | 'setContrast' | 'setSaturation' | 'setVibrance' | 'setHue' | 'setWhites' | 'setBlacks'
>;

const getOnChange = (type: TransformationType, props: SetterProps): (value: number) => void => {
  switch (type) {
    case 'brightness': return props.setBrightness;
    case 'contrast': return props.setContrast;
    case 'saturation': return props.setSaturation;
    case 'vibrance': return props.setVibrance;
    case 'hue': return props.setHue;
    case 'whites': return props.setWhites;
    case 'blacks': return props.setBlacks;
  }
};

const TRANSFORM_LABELS: Record<TransformationType, string> = {
  brightness: 'Brightness',
  contrast: 'Contrast',
  saturation: 'Saturation',
  vibrance: 'Vibrance',
  hue: 'Hue Rotation',
  whites: 'Whites',
  blacks: 'Blacks'
};

export function AdjustmentLayer(props: AdjustmentLayerProps) {
  const {
    transformOrder,
    onOrderChange,
    pipeline,
    onReorderInstances,
    onAddInstance,
    onDuplicateInstance,
    onDeleteInstance,
    onToggleInstance,
    onChangeInstanceParams,
    onResetAll,
    onCardClick,
    onInstanceSelect,
    activeTab,
    ...rest
  } = props;
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 20
      }
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    if (props.pipeline && props.onReorderInstances) {
      props.onReorderInstances(String(active.id), String(over.id));
      return;
    }
    // Legacy order reordering
    const oldIndex = transformOrder.indexOf(active.id as TransformationType);
    const newIndex = transformOrder.indexOf(over.id as TransformationType);
    if (oldIndex !== -1 && newIndex !== -1) {
      onOrderChange(arrayMove(transformOrder, oldIndex, newIndex));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {onAddInstance && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="default" className="gap-2">
                <Plus className="w-4 h-4" />
                New Adjustment
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Add Adjustment</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onAddInstance('brightness')}>Brightness</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddInstance('contrast')}>Contrast</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddInstance('saturation')}>Saturation</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddInstance('vibrance')}>Vibrance</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddInstance('hue')}>Hue Rotation</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddInstance('whites')}>Whites</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddInstance('blacks')}>Blacks</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onAddInstance('blur')}>Blur</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddInstance('sharpen')}>Sharpen</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddInstance('denoise')}>Denoise</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddInstance('edge')}>Edge Detect</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddInstance('customConv')}>Custom Convolution</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <div className="flex-1" />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        {props.pipeline ? (
          <SortableContext items={props.pipeline.map(p => p.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {props.pipeline.map((inst, index) => {
                const kind = inst.kind;
                const isVector: boolean = (kind === 'brightness' || kind === 'contrast' || kind === 'saturation' || kind === 'vibrance' || kind === 'hue' || kind === 'whites' || kind === 'blacks');
                const config = isVector ? getTransformConfig(kind as TransformationType) : (
                  kind === 'blur'
                    ? { min: 0, max: 10, step: 0.1, defaultValue: 1, formatValue: (v: number) => `${v.toFixed(1)}` }
                    : kind === 'sharpen'
                    ? { min: 0, max: 5, step: 0.1, defaultValue: 1, formatValue: (v: number) => `${v.toFixed(1)}` }
                    : kind === 'edge'
                    ? { min: 3, max: 5, step: 2, defaultValue: 3, formatValue: (v: number) => `${v}×${v}` }
                    : kind === 'customConv'
                    ? { min: 3, max: 9, step: 2, defaultValue: 3, formatValue: (v: number) => `${v}×${v}` }
                    : /* denoise strength */ { min: 0, max: 1, step: 0.05, defaultValue: 0.5, formatValue: (v: number) => `k=${v.toFixed(2)}` }
                );
                const currentValue = kind === 'vibrance'
                  ? (inst.params as { vibrance: number }).vibrance
                  : kind === 'hue'
                  ? (inst.params as { hue: number }).hue
                  : kind === 'blur'
                  ? (() => { const p = inst.params as BlurParams; return p.kind === 'gaussian' ? (p.sigma ?? 1.0) : p.size; })()
                  : kind === 'sharpen'
                  ? (inst.params as SharpenParams).amount
                  : kind === 'edge'
                  ? (inst.params as EdgeParams).size
                  : kind === 'customConv'
                  ? (inst.params as CustomConvParams).size
                  : kind === 'denoise'
                  ? ((inst.params as DenoiseParams).strength ?? 0.5)
                  : (inst.params as { value: number }).value;
                const label = (kind === 'brightness' || kind === 'contrast' || kind === 'saturation' || kind === 'vibrance' || kind === 'hue' || kind === 'whites' || kind === 'blacks')
                  ? TRANSFORM_LABELS[kind as TransformationType]
                  : kind === 'blur' ? 'Blur' : kind === 'sharpen' ? 'Sharpen' : kind === 'edge' ? 'Edge Detect' : kind === 'customConv' ? 'Custom Convolution' : 'Denoise';
                // Reverse numbering: bottom item (last in array) gets 1, top item (first in array) gets highest number
                const displayIndex = props.pipeline.length - index - 1;
                return (
                  <DraggableSliderCard
                    key={inst.id}
                    id={inst.id}
                    index={displayIndex}
                    kind={inst.kind}
                    enabled={inst.enabled}
                    value={currentValue}
                    onChange={(v) => props.onChangeInstanceParams?.(inst.id, inst.kind, v)}
                    min={config.min}
                    max={config.max}
                    step={config.step}
                    defaultValue={config.defaultValue}
                    formatValue={config.formatValue}
                    icon={isVector ? getIcon(kind as TransformationType) : undefined}
                    label={label}
                    onDelete={props.onDeleteInstance}
                    onToggleEnabled={props.onToggleInstance}
                    onClick={onCardClick}
                    onInstanceClick={onInstanceSelect}
                    isActive={activeTab === kind}
                  />
                );
              })}
            </div>
          </SortableContext>
        ) : (
          <SortableContext items={transformOrder} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {transformOrder.map((type, index) => {
                const config = getTransformConfig(type);
                const value = getValue(type, rest);
                const onChange = getOnChange(type, rest);
                // Reverse numbering: bottom item (last in array) gets 1, top item (first in array) gets highest number
                const displayIndex = transformOrder.length - index - 1;
                return (
                  <DraggableSliderCard
                    key={type}
                    id={type}
                    index={displayIndex}
                    kind={type}
                    value={value}
                    onChange={onChange}
                    min={config.min}
                    max={config.max}
                    step={config.step}
                    defaultValue={config.defaultValue}
                    formatValue={config.formatValue}
                    icon={getIcon(type)}
                    label={TRANSFORM_LABELS[type]}
                    onClick={onCardClick}
                    isActive={activeTab === type}
                  />
                );
              })}
            </div>
          </SortableContext>
        )}
      </DndContext>

      <Button
        variant="outline"
        className="w-full"
        onClick={onResetAll}
      >
        <RotateCcw className="w-4 h-4 mr-2" />
        Reset All
      </Button>
    </div>
  );
}

