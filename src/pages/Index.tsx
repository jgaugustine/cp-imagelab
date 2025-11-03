import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { ImageCanvas } from "@/components/ImageCanvas";
import { MathExplanation } from "@/components/MathExplanation";
import { TransformationType, RGB } from "@/types/transformations";
import { TransformationSliders } from "@/components/TransformationSliders";
import { downsizeImageToDataURL } from "@/lib/imageResize";
import { FilterInstance } from "@/types/transformations";

interface IndexProps {
  // Instance-based pipeline (introduced at App level)
  pipeline?: FilterInstance[];
  setPipeline?: (next: FilterInstance[] | ((prev: FilterInstance[]) => FilterInstance[])) => void;
  selectedInstanceId?: string | null;
  setSelectedInstanceId?: (id: string | null) => void;
  pipelineApi?: {
    addInstance: (kind: TransformationType) => void;
    duplicateInstance: (id: string) => void;
    deleteInstance: (id: string) => void;
    toggleInstance: (id: string) => void;
    reorderInstances: (activeId: string, overId: string) => void;
    updateInstanceParams: (id: string, updater: (prev: FilterInstance) => FilterInstance) => void;
  };
}

export default function Index(_props: IndexProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(1);
  const [saturation, setSaturation] = useState(1);
  const [hue, setHue] = useState(0);
  const [vibrance, setVibrance] = useState(0);
  const [linearSaturation, setLinearSaturation] = useState(false);
  const [transformOrder, setTransformOrder] = useState<TransformationType[]>(['brightness', 'contrast', 'saturation', 'vibrance', 'hue']);
  const [selectedRGB, setSelectedRGB] = useState<RGB | null>(null);
  const [activeTab, setActiveTab] = useState<string>('brightness');
  const [previewOriginal, setPreviewOriginal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const CanvasAny = ImageCanvas as any;
  const MathAny = MathExplanation as any;
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await downsizeImageToDataURL(file, 2048, 0.85);
      const img = new Image();
      img.onload = () => setImage(img);
      img.src = dataUrl;
    } catch (err) {
      // Fallback to original file if resize fails
      const reader = new FileReader();
      reader.onload = event => {
        const img = new Image();
        img.onload = () => setImage(img);
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };
  return <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-foreground">
        </h1>
          <p className="text-muted-foreground">
        </p>
        </header>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Panel - Image & Controls */}
          <div className="space-y-6">
            <Card className="p-6 border-border bg-card">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-xl font-semibold text-primary flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Image Preview
                </h2>
                {image && (
                  <div className="flex items-center gap-2">
                    <Button
                      className="shrink-0"
                      variant="outline"
                      onPointerDown={() => setPreviewOriginal(true)}
                      onPointerUp={() => setPreviewOriginal(false)}
                      onPointerLeave={() => setPreviewOriginal(false)}
                      onBlur={() => setPreviewOriginal(false)}
                      aria-pressed={previewOriginal}
                    >
                      Show Original
                    </Button>
                    <Button
                      className="shrink-0"
                      variant="outline"
                      onClick={() => {
                        setImage(null);
                        setSelectedRGB(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                    >
                      Remove Image
                    </Button>
                  </div>
                )}
              </div>
              
              {!image ? <div className="aspect-video border-2 border-dashed border-border rounded-lg flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <Upload className="w-12 h-12 text-muted-foreground mx-auto" />
                    <Button onClick={() => fileInputRef.current?.click()}>
                      Upload Image
                    </Button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                  </div>
                </div> : <div className="aspect-video w-full overflow-hidden"><CanvasAny image={image} pipeline={_props.pipeline} onSelectInstance={_props.setSelectedInstanceId} brightness={brightness} contrast={contrast} saturation={saturation} hue={hue} linearSaturation={linearSaturation} vibrance={vibrance} transformOrder={transformOrder} onPixelSelect={setSelectedRGB} previewOriginal={previewOriginal} /></div>}
            </Card>

            <Card className="p-6 border-border bg-card">
              <h2 className="text-xl font-semibold text-primary mb-6">Transformation Controls</h2>
              
              <TransformationSliders
                transformOrder={transformOrder}
                onOrderChange={setTransformOrder}
                pipeline={_props.pipeline}
                onReorderInstances={_props.pipelineApi?.reorderInstances}
                onAddInstance={_props.pipelineApi?.addInstance}
                onDuplicateInstance={_props.pipelineApi?.duplicateInstance}
                onDeleteInstance={_props.pipelineApi?.deleteInstance}
                onToggleInstance={_props.pipelineApi?.toggleInstance}
                onChangeInstanceParams={(id, kind, nextValue) => {
                  _props.pipelineApi?.updateInstanceParams?.(id, (prev) => {
                    if (kind === 'vibrance') return { ...prev, params: { vibrance: nextValue } };
                    if (kind === 'hue') return { ...prev, params: { hue: nextValue } };
                    return { ...prev, params: { value: nextValue } };
                  });
                  return;
                }}
                brightness={brightness}
                setBrightness={setBrightness}
                contrast={contrast}
                setContrast={setContrast}
                saturation={saturation}
                setSaturation={setSaturation}
                vibrance={vibrance}
                setVibrance={setVibrance}
                hue={hue}
                setHue={setHue}
                onResetAll={() => {
                  setBrightness(0);
                  setContrast(1);
                  setSaturation(1);
                  setHue(0);
                  setVibrance(0);
                  setLinearSaturation(false);
                }}
                onCardClick={(transformType) => setActiveTab(transformType)}
                activeTab={activeTab}
              />
            </Card>
          </div>

          {/* Right Panel - Mathematical Explanation */}
          <div className="space-y-6">
            <MathAny
              brightness={brightness}
              contrast={contrast}
              saturation={saturation}
              hue={hue}
              vibrance={vibrance}
              linearSaturation={linearSaturation}
              onToggleLinearSaturation={setLinearSaturation}
              selectedRGB={selectedRGB || undefined}
              transformOrder={transformOrder}
              pipeline={_props.pipeline}
              selectedInstanceId={_props.selectedInstanceId ?? null}
              hasImage={!!image}
              activeTab={activeTab}
            />
          </div>
        </div>
      </div>
    </div>;
}