import { useState, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { ImageCanvas } from "@/components/ImageCanvas";
import { MathExplanation } from "@/components/MathExplanation";
import { TransformationType, RGB } from "@/types/transformations";
import { TransformationOrderControls } from "@/components/TransformationOrderControls";
import { downsizeImageToDataURL } from "@/lib/imageResize";
export default function Index() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(1);
  const [saturation, setSaturation] = useState(1);
  const [hue, setHue] = useState(0);
  const [vibrance, setVibrance] = useState(0);
  const [linearSaturation, setLinearSaturation] = useState(false);
  const [transformOrder, setTransformOrder] = useState<TransformationType[]>(['brightness', 'contrast', 'saturation', 'vibrance', 'hue']);
  const [selectedRGB, setSelectedRGB] = useState<RGB | null>(null);
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
                </div> : <div className="aspect-video w-full overflow-hidden"><CanvasAny image={image} brightness={brightness} contrast={contrast} saturation={saturation} hue={hue} linearSaturation={linearSaturation} vibrance={vibrance} transformOrder={transformOrder} onPixelSelect={setSelectedRGB} /></div>}
            </Card>

            <Card className="p-6 border-border bg-card">
              <h2 className="text-xl font-semibold text-primary mb-6">Transformation Controls</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Brightness: {brightness > 0 ? '+' : ''}{brightness}
                  </label>
                  <Slider value={[brightness]} onValueChange={([v]) => setBrightness(v)} min={-100} max={100} step={1} />
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Contrast: {contrast.toFixed(2)}x
                  </label>
                  <Slider value={[contrast]} onValueChange={([v]) => setContrast(v)} min={0} max={2} step={0.01} />
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Saturation: {saturation.toFixed(2)}x
                  </label>
                  <Slider value={[saturation]} onValueChange={([v]) => setSaturation(v)} min={0} max={2} step={0.01} />
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Vibrance: {vibrance >= 0 ? '+' : ''}{vibrance.toFixed(2)}
                  </label>
                  <Slider value={[vibrance]} onValueChange={([v]) => setVibrance(v)} min={-1} max={1} step={0.01} />
                </div>


                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Hue Rotation: {hue > 0 ? '+' : ''}{hue}°
                  </label>
                  <Slider value={[hue]} onValueChange={([v]) => setHue(v)} min={-180} max={180} step={1} />
                </div>

                <Button variant="outline" className="w-full" onClick={() => {
                setBrightness(0);
                setContrast(1);
                setSaturation(1);
                setHue(0);
                setVibrance(0);
                setLinearSaturation(false);
              }}>
                  Reset All
                </Button>
              </div>
            </Card>
          </div>

          {/* Right Panel - Pipeline Order & Mathematical Explanation */}
          <div className="space-y-6">
            <TransformationOrderControls order={transformOrder} onOrderChange={setTransformOrder} />
            
            <MathAny
              brightness={brightness}
              contrast={contrast}
              saturation={saturation}
              hue={hue}
              vibrance={vibrance}
              linearSaturation={linearSaturation}
              onToggleLinearSaturation={setLinearSaturation}
              selectedRGB={selectedRGB || undefined}
              hasImage={!!image}
            />
          </div>
        </div>
      </div>
    </div>;
}