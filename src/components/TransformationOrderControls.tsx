import { DndContext, closestCenter, DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Sun, Circle, Palette, Rainbow, Droplet, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TransformationType, TRANSFORM_LABELS } from '@/types/transformations';

interface TransformationOrderControlsProps {
  order: TransformationType[];
  onOrderChange: (newOrder: TransformationType[]) => void;
}

interface SortableItemProps {
  id: TransformationType;
  index: number;
}

const getIcon = (type: TransformationType) => {
  switch (type) {
    case 'brightness':
      return <Sun className="w-4 h-4" />;
    case 'contrast':
      return <Circle className="w-4 h-4" />;
    case 'saturation':
      return <Palette className="w-4 h-4" />;
    case 'vibrance':
      return <Droplet className="w-4 h-4" />;
    case 'hue':
      return <Rainbow className="w-4 h-4" />;
  }
};

function SortableItem({ id, index }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`
        relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 
        transition-all cursor-grab active:cursor-grabbing
        ${isDragging 
          ? 'scale-105 shadow-lg opacity-50 border-primary' 
          : 'border-border bg-card hover:border-primary'
        }
      `}
    >
      <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
        {index + 1}
      </div>
      <div className="text-primary">
        {getIcon(id)}
      </div>
      <div className="text-xs font-medium text-foreground text-center">
        {TRANSFORM_LABELS[id]}
      </div>
    </div>
  );
}

export function TransformationOrderControls({ order, onOrderChange }: TransformationOrderControlsProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = order.indexOf(active.id as TransformationType);
      const newIndex = order.indexOf(over.id as TransformationType);
      onOrderChange(arrayMove(order, oldIndex, newIndex));
    }
  };

  const handleReset = () => {
    onOrderChange(['brightness', 'contrast', 'saturation', 'vibrance', 'hue']);
  };

  return (
    <Card className="p-4 border-border bg-card/50">
      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Transformation Pipeline Order</h3>
          <p className="text-xs text-muted-foreground">Drag to reorder • Order matters!</p>
        </div>
        
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={order} strategy={horizontalListSortingStrategy}>
            <div className="grid grid-cols-4 gap-3">
              {order.map((type, index) => (
                <SortableItem key={type} id={type} index={index} />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          className="w-full"
        >
          <RotateCcw className="w-3 h-3 mr-2" />
          Reset to Default
        </Button>
      </div>
    </Card>
  );
}
