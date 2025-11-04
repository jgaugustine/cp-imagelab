import { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { FilterKind, TransformationType } from '@/types/transformations';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

interface DraggableSliderCardProps {
  id: string | TransformationType;
  index: number;
  kind: FilterKind | TransformationType;
  enabled?: boolean;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  formatValue: (value: number) => string;
  icon: React.ReactNode;
  label: string;
  onDelete?: (id: string) => void;
  onToggleEnabled?: (id: string) => void;
  onClick?: (transformType: TransformationType) => void;
  onInstanceClick?: (instanceId: string) => void;
  isActive?: boolean;
}

export function DraggableSliderCard({
  id,
  index,
  kind,
  enabled = true,
  value,
  onChange,
  min,
  max,
  step,
  defaultValue,
  formatValue,
  icon,
  label,
  onDelete,
  onToggleEnabled,
  onClick,
  onInstanceClick,
  isActive,
}: DraggableSliderCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const [recentlyChanged, setRecentlyChanged] = useState(false);
  useEffect(() => {
    // Trigger a brief highlight whenever the value changes
    setRecentlyChanged(true);
    const t = setTimeout(() => setRecentlyChanged(false), 600);
    return () => clearTimeout(t);
  }, [value]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleClick = () => {
    if (isDragging) return;
    // For instance-based pipeline, call onInstanceClick if available
    if (onInstanceClick && typeof id === 'string') {
      onInstanceClick(id);
    }
    // Also call onClick for legacy compatibility
    if (onClick) {
      onClick(kind as TransformationType);
    }
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`
        relative p-4 transition-all
        ${isDragging 
          ? 'shadow-lg opacity-50 z-50 border-primary' 
          : isActive
          ? 'border-primary bg-primary/5 cursor-pointer'
          : 'border-border bg-card hover:border-primary/50 cursor-pointer'
        }
      `}
      onClick={handleClick}
    >
      <div className="flex items-start gap-3">
        {/* Drag handle and order badge */}
        <div className="flex flex-col items-center gap-2 pt-1">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="w-5 h-5" />
          </div>
          <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
            {index + 1}
          </div>
        </div>

        {/* Main content: icon, label, value, and slider */}
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-2">
            <div className="text-primary">
              {icon}
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium text-foreground">
                {label}
              </label>
            </div>
            <div className="text-sm font-mono text-muted-foreground">
              {formatValue(value)}
            </div>
          </div>
          
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <Slider
              value={[value]}
              onValueChange={([v]) => onChange(v)}
              min={min}
              max={max}
              step={step}
              disabled={isDragging}
              thumbHighlight={recentlyChanged}
              onDoubleClick={() => onChange(defaultValue)}
            />
          </div>
        </div>

        {/* Instance controls */}
        <div className="flex flex-col items-end gap-2 pt-1">
          <div className="flex items-center gap-2">
            <Switch
              checked={enabled}
              onCheckedChange={() => onToggleEnabled?.(String(id))}
              onClick={(e) => e.stopPropagation()}
              className="scale-75 origin-right"
            />
            <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); onDelete?.(String(id)); }} aria-label="Delete">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

