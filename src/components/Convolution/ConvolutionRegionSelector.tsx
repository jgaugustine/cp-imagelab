import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ConvolutionRegionSelectorProps {
  image: HTMLImageElement;
  onRegionSelected: (x: number, y: number) => void;
  onCancel?: () => void;
}

const REGION_SIZE = 32;

export function ConvolutionRegionSelector({ image, onRegionSelected, onCancel }: ConvolutionRegionSelectorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [regionX, setRegionX] = useState(Math.max(0, Math.floor(image.width / 2 - REGION_SIZE / 2)));
  const [regionY, setRegionY] = useState(Math.max(0, Math.floor(image.height / 2 - REGION_SIZE / 2)));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size to image size (will be scaled by CSS)
    canvas.width = image.width;
    canvas.height = image.height;

    // Draw the image
    ctx.drawImage(image, 0, 0);

    // Draw semi-transparent overlay
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Clear the selected region
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(image, regionX, regionY, REGION_SIZE, REGION_SIZE, regionX, regionY, REGION_SIZE, REGION_SIZE);
    ctx.restore();

    // Draw selection border
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(regionX, regionY, REGION_SIZE, REGION_SIZE);

    // Draw corner indicators
    const cornerSize = 8;
    ctx.fillStyle = "#3b82f6";
    // Top-left
    ctx.fillRect(regionX - 1, regionY - 1, cornerSize, 2);
    ctx.fillRect(regionX - 1, regionY - 1, 2, cornerSize);
    // Top-right
    ctx.fillRect(regionX + REGION_SIZE - cornerSize + 1, regionY - 1, cornerSize, 2);
    ctx.fillRect(regionX + REGION_SIZE - 1, regionY - 1, 2, cornerSize);
    // Bottom-left
    ctx.fillRect(regionX - 1, regionY + REGION_SIZE - 1, cornerSize, 2);
    ctx.fillRect(regionX - 1, regionY + REGION_SIZE - cornerSize + 1, 2, cornerSize);
    // Bottom-right
    ctx.fillRect(regionX + REGION_SIZE - cornerSize + 1, regionY + REGION_SIZE - 1, cornerSize, 2);
    ctx.fillRect(regionX + REGION_SIZE - 1, regionY + REGION_SIZE - cornerSize + 1, 2, cornerSize);

    // Draw label
    ctx.fillStyle = "#3b82f6";
    ctx.font = "12px sans-serif";
    ctx.textBaseline = "top";
    const label = `32×32 Region: (${regionX}, ${regionY})`;
    const labelWidth = ctx.measureText(label).width;
    ctx.fillRect(regionX, regionY - 18, labelWidth + 8, 16);
    ctx.fillStyle = "white";
    ctx.fillText(label, regionX + 4, regionY - 16);
  }, [image, regionX, regionY]);

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = Math.floor((e.clientX - rect.left) * scaleX);
    const y = Math.floor((e.clientY - rect.top) * scaleY);

    return { x, y };
  };

  const constrainRegion = (x: number, y: number) => {
    const maxX = Math.max(0, image.width - REGION_SIZE);
    const maxY = Math.max(0, image.height - REGION_SIZE);
    return {
      x: Math.max(0, Math.min(maxX, x)),
      y: Math.max(0, Math.min(maxY, y)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasCoordinates(e);
    if (!coords) return;

    const { x, y } = coords;
    // Check if click is within the region
    if (
      x >= regionX &&
      x < regionX + REGION_SIZE &&
      y >= regionY &&
      y < regionY + REGION_SIZE
    ) {
      setIsDragging(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;

    const coords = getCanvasCoordinates(e);
    if (!coords) return;

    const { x, y } = constrainRegion(
      coords.x - REGION_SIZE / 2,
      coords.y - REGION_SIZE / 2
    );

    setRegionX(x);
    setRegionY(y);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleConfirm = () => {
    onRegionSelected(regionX, regionY);
  };

  return (
    <Card className="p-4 border-border bg-card">
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-2">
            Select 32×32 Pixel Region
          </h4>
          <p className="text-xs text-muted-foreground mb-4">
            Click and drag the highlighted region to position it on the image.
          </p>
        </div>

        <div className="relative border border-border rounded-lg overflow-hidden bg-muted">
          <canvas
            ref={canvasRef}
            className="w-full h-auto cursor-move"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ maxHeight: "400px", objectFit: "contain" }}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleConfirm} size="sm">
            Use This Region
          </Button>
          {onCancel && (
            <Button onClick={onCancel} variant="outline" size="sm">
              Cancel
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

