import { DndContext, closestCenter, DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Sun, Circle, Palette, Rainbow, Droplet, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TransformationType } from '@/types/transformations';
import { DraggableSliderCard } from './DraggableSliderCard';

interface TransformationSlidersProps {
  transformOrder: TransformationType[];
  onOrderChange: (newOrder: TransformationType[]) => void;
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
  onResetAll: () => void;
  onCardClick?: (transformType: TransformationType) => void;
  activeTab?: string;
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
  }
};

const getTransformConfig = (type: TransformationType) => {
  switch (type) {
    case 'brightness':
      return { min: -100, max: 100, step: 1, formatValue: (v: number) => v > 0 ? `+${v}` : `${v}` };
    case 'contrast':
      return { min: 0, max: 2, step: 0.01, formatValue: (v: number) => `${v.toFixed(2)}x` };
    case 'saturation':
      return { min: 0, max: 2, step: 0.01, formatValue: (v: number) => `${v.toFixed(2)}x` };
    case 'vibrance':
      return { min: -1, max: 1, step: 0.01, formatValue: (v: number) => v >= 0 ? `+${v.toFixed(2)}` : `${v.toFixed(2)}` };
    case 'hue':
      return { min: -180, max: 180, step: 1, formatValue: (v: number) => `${v > 0 ? '+' : ''}${v}°` };
  }
};

const getValue = (type: TransformationType, props: TransformationSlidersProps): number => {
  switch (type) {
    case 'brightness': return props.brightness;
    case 'contrast': return props.contrast;
    case 'saturation': return props.saturation;
    case 'vibrance': return props.vibrance;
    case 'hue': return props.hue;
  }
};

const getOnChange = (type: TransformationType, props: TransformationSlidersProps): (value: number) => void => {
  switch (type) {
    case 'brightness': return props.setBrightness;
    case 'contrast': return props.setContrast;
    case 'saturation': return props.setSaturation;
    case 'vibrance': return props.setVibrance;
    case 'hue': return props.setHue;
  }
};

const TRANSFORM_LABELS: Record<TransformationType, string> = {
  brightness: 'Brightness',
  contrast: 'Contrast',
  saturation: 'Saturation',
  vibrance: 'Vibrance',
  hue: 'Hue Rotation'
};

export function TransformationSliders({
  transformOrder,
  onOrderChange,
  onResetAll,
  onCardClick,
  activeTab,
  ...rest
}: TransformationSlidersProps) {
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

    if (over && active.id !== over.id) {
      const oldIndex = transformOrder.indexOf(active.id as TransformationType);
      const newIndex = transformOrder.indexOf(over.id as TransformationType);
      onOrderChange(arrayMove(transformOrder, oldIndex, newIndex));
    }
  };

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={transformOrder} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {transformOrder.map((type, index) => {
              const config = getTransformConfig(type);
              const value = getValue(type, rest);
              const onChange = getOnChange(type, rest);
              
              return (
                <DraggableSliderCard
                  key={type}
                  id={type}
                  index={index}
                  value={value}
                  onChange={onChange}
                  min={config.min}
                  max={config.max}
                  step={config.step}
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

