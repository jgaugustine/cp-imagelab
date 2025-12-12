import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Layers } from "lucide-react";
import { ImageCanvas } from "@/components/ImageCanvas";
import { MathExplanation } from "@/components/MathExplanation";
import { TransformationType, RGB, BlurParams, SharpenParams, EdgeParams, DenoiseParams, CustomConvParams, defaultParamsFor } from "@/types/transformations";
import { AdjustmentLayer } from "@/components/AdjustmentLayer";
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
  const [whites, setWhites] = useState(0);
  const [blacks, setBlacks] = useState(0);
  const [linearSaturation, setLinearSaturation] = useState(false);
  const [transformOrder, setTransformOrder] = useState<TransformationType[]>(['hue', 'vibrance', 'saturation', 'contrast', 'brightness', 'whites', 'blacks']);
  const [selectedRGB, setSelectedRGB] = useState<RGB | null>(null);
  const [activeTab, setActiveTab] = useState<string>('brightness');
  const [previewOriginal, setPreviewOriginal] = useState(false);
  const [dechanneled, setDechanneled] = useState(false);
  const [convAnalysis, setConvAnalysis] = useState<any | null>(null);
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
                  variant={dechanneled ? "default" : "outline"}
                  onClick={() => setDechanneled(!dechanneled)}
                  aria-pressed={dechanneled}
                >
                  <Layers className="w-4 h-4 mr-2" />
                  Dechannel
                </Button>
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
                </div> : <div className="aspect-video w-full overflow-hidden"><CanvasAny key={dechanneled ? 'dechanneled' : 'normal'} image={image} pipeline={_props.pipeline} onSelectInstance={_props.setSelectedInstanceId} selectedInstanceId={_props.selectedInstanceId ?? null} brightness={brightness} contrast={contrast} saturation={saturation} hue={hue} whites={whites} blacks={blacks} linearSaturation={linearSaturation} vibrance={vibrance} transformOrder={transformOrder} onPixelSelect={setSelectedRGB} onSelectConvAnalysis={setConvAnalysis} previewOriginal={previewOriginal} dechanneled={dechanneled} /></div>}
            </Card>

            <Card className="p-6 border-border bg-card">
              <h2 className="text-xl font-semibold text-primary mb-6">Transformation Controls</h2>
              
              <AdjustmentLayer
                transformOrder={transformOrder}
                onOrderChange={setTransformOrder}
                pipeline={_props.pipeline}
                onReorderInstances={_props.pipelineApi?.reorderInstances}
                onAddInstance={_props.pipelineApi?.addInstance}
                onDuplicateInstance={_props.pipelineApi?.duplicateInstance}
                onDeleteInstance={_props.pipelineApi?.deleteInstance}
                onToggleInstance={_props.pipelineApi?.toggleInstance}
                image={image}
                linearSaturation={linearSaturation}
                onChangeInstanceParams={(id, kind, nextValue) => {
                  _props.pipelineApi?.updateInstanceParams?.(id, (prev) => {
                    if (kind === 'vibrance') return { ...prev, params: { vibrance: nextValue } };
                    if (kind === 'hue') return { ...prev, params: { hue: nextValue } };
                    if (kind === 'blur') {
                      const p = prev.params as BlurParams;
                      if (p.kind === 'gaussian') {
                        const sigma = Math.max(0.05, Number(nextValue) || 0.05);
                        return { ...prev, params: { ...p, sigma } };
                      } else {
                        const size = ((): 3|5|7 => {
                          const v = Math.round(Number(nextValue));
                          if (v <= 4) return 3; if (v <= 6) return 5; return 7;
                        })();
                        return { ...prev, params: { ...p, size } };
                      }
                    }
                    if (kind === 'sharpen') {
                      const p = prev.params as SharpenParams;
                      const amount = Math.max(0, Number(nextValue) || 0);
                      return { ...prev, params: { ...p, amount } };
                    }
                    if (kind === 'edge') {
                      const p = prev.params as EdgeParams;
                      const size = (Number(nextValue) || 3) <= 4 ? 3 : 5;
                      return { ...prev, params: { ...p, size } };
                    }
                    if (kind === 'denoise') {
                      const p = prev.params as DenoiseParams;
                      const strength = Math.max(0, Math.min(1, Number(nextValue)));
                      return { ...prev, params: { ...p, strength } };
                    }
                    if (kind === 'customConv') {
                      const p = prev.params as CustomConvParams;
                      const newSize = ((): 3|5|7|9 => {
                        const v = Math.round(Number(nextValue));
                        if (v <= 4) return 3; if (v <= 6) return 5; if (v <= 8) return 7; return 9;
                      })();
                      // Resize kernel when size changes
                      const oldSize = p.kernel.length;
                      const newKernel: number[][] = Array.from({ length: newSize }, () => 
                        Array.from({ length: newSize }, () => 0)
                      );
                      // Copy existing values, centered
                      const offset = Math.floor((newSize - oldSize) / 2);
                      for (let y = 0; y < oldSize && y + offset < newSize; y++) {
                        for (let x = 0; x < oldSize && x + offset < newSize; x++) {
                          if (y + offset >= 0 && x + offset >= 0) {
                            newKernel[y + offset][x + offset] = p.kernel[y][x];
                          }
                        }
                      }
                      // If expanding, initialize center to 1 (identity-like) if it's zero
                      if (newSize > oldSize) {
                        const center = Math.floor(newSize / 2);
                        if (newKernel[center][center] === 0) {
                          newKernel[center][center] = 1;
                        }
                      }
                      return { ...prev, params: { ...p, size: newSize, kernel: newKernel } };
                    }
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
                whites={whites}
                setWhites={setWhites}
                blacks={blacks}
                setBlacks={setBlacks}
                onResetAll={() => {
                  // Reset legacy sliders
                  setBrightness(0);
                  setContrast(1);
                  setSaturation(1);
                  setHue(0);
                  setVibrance(0);
                  setWhites(0);
                  setBlacks(0);
                  setLinearSaturation(false);
                  // Reset all pipeline instances to their defaults
                  if (_props.pipeline && _props.pipelineApi?.updateInstanceParams) {
                    _props.pipeline.forEach(instance => {
                      const defaultParams = defaultParamsFor(instance.kind);
                      _props.pipelineApi?.updateInstanceParams(instance.id, (prev) => ({
                        ...prev,
                        params: defaultParams
                      }));
                    });
                  }
                }}
                onCardClick={(transformType) => setActiveTab(transformType as string)}
                onInstanceSelect={(instanceId) => {
                  _props.setSelectedInstanceId?.(instanceId);
                  // Also set activeTab based on the instance kind
                  const instance = _props.pipeline?.find(p => p.id === instanceId);
                  if (instance) {
                    setActiveTab(instance.kind);
                  }
                }}
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
              whites={whites}
              blacks={blacks}
              linearSaturation={linearSaturation}
              onToggleLinearSaturation={setLinearSaturation}
              selectedRGB={selectedRGB || undefined}
              transformOrder={transformOrder}
              pipeline={_props.pipeline}
              selectedInstanceId={_props.selectedInstanceId ?? null}
              hasImage={!!image}
              activeTab={activeTab}
              convAnalysis={convAnalysis}
              onUpdateInstanceParams={_props.pipelineApi?.updateInstanceParams}
              image={image}
              onActiveTabChange={setActiveTab}
            />
          </div>
        </div>
      </div>
    </div>;
}