import { BlurParams, DenoiseParams, EdgeParams, SharpenParams, CustomConvParams } from "@/types/transformations";
import { applyBlur, applyDenoise, applyEdge, applySharpen, applyCustomConv } from "./convolution";

export type ConvolutionBackend = {
  blur: (imageData: ImageData, params: BlurParams) => ImageData;
  sharpen: (imageData: ImageData, params: SharpenParams) => ImageData;
  edge: (imageData: ImageData, params: EdgeParams) => ImageData;
  denoise: (imageData: ImageData, params: DenoiseParams) => ImageData;
  customConv: (imageData: ImageData, params: CustomConvParams) => ImageData;
};

export const cpuConvolutionBackend: ConvolutionBackend = {
  blur: (imageData, params) => applyBlur(imageData, params),
  sharpen: (imageData, params) => applySharpen(imageData, params),
  edge: (imageData, params) => applyEdge(imageData, params),
  denoise: (imageData, params) => applyDenoise(imageData, params),
  customConv: (imageData, params) => applyCustomConv(imageData, params),
};


