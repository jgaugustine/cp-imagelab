import { BlurParams, DenoiseParams, EdgeParams, SharpenParams } from "@/types/transformations";
import { applyBlur, applyDenoise, applyEdge, applySharpen } from "./convolution";

export type ConvolutionBackend = {
  blur: (imageData: ImageData, params: BlurParams) => ImageData;
  sharpen: (imageData: ImageData, params: SharpenParams) => ImageData;
  edge: (imageData: ImageData, params: EdgeParams) => ImageData;
  denoise: (imageData: ImageData, params: DenoiseParams) => ImageData;
};

export const cpuConvolutionBackend: ConvolutionBackend = {
  blur: (imageData, params) => applyBlur(imageData, params),
  sharpen: (imageData, params) => applySharpen(imageData, params),
  edge: (imageData, params) => applyEdge(imageData, params),
  denoise: (imageData, params) => applyDenoise(imageData, params),
};


