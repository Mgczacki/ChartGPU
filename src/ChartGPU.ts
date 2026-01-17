import { GPUContext } from './core/GPUContext';
import type { ChartGPUOptions } from './config/types';

export interface ChartGPUInstance {
  readonly options: Readonly<ChartGPUOptions>;
  readonly disposed: boolean;
  setOption(options: ChartGPUOptions): void;
  resize(): void;
  dispose(): void;
}

export async function createChartGPU(
  container: HTMLElement,
  options: ChartGPUOptions
): Promise<ChartGPUInstance> {
  const canvas = document.createElement('canvas');

  // Ensure the canvas participates in layout and can size via the container.
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';

  // Append before awaiting so it appears immediately and has measurable size.
  container.appendChild(canvas);

  let disposed = false;
  let gpuContext: GPUContext | null = null;
  let currentOptions: ChartGPUOptions = options;
  let lastConfigured: { width: number; height: number; format: GPUTextureFormat } | null = null;

  const resize = (): void => {
    if (disposed) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const maxDimension = gpuContext?.device?.limits.maxTextureDimension2D ?? 8192;
    const width = Math.min(maxDimension, Math.max(1, Math.round(rect.width * dpr)));
    const height = Math.min(maxDimension, Math.max(1, Math.round(rect.height * dpr)));

    const sizeChanged = canvas.width !== width || canvas.height !== height;
    if (sizeChanged) {
      canvas.width = width;
      canvas.height = height;
    }

    const device = gpuContext?.device;
    const canvasContext = gpuContext?.canvasContext;
    const preferredFormat = gpuContext?.preferredFormat;

    if (device && canvasContext && preferredFormat) {
      const shouldConfigure =
        sizeChanged ||
        !lastConfigured ||
        lastConfigured.width !== canvas.width ||
        lastConfigured.height !== canvas.height ||
        lastConfigured.format !== preferredFormat;

      if (shouldConfigure) {
        canvasContext.configure({
          device,
          format: preferredFormat,
          alphaMode: 'opaque',
        });
        lastConfigured = { width: canvas.width, height: canvas.height, format: preferredFormat };
      }
    }
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;

    try {
      gpuContext?.destroy();
    } finally {
      gpuContext = null;
      canvas.remove();
    }
  };

  const instance: ChartGPUInstance = {
    get options() {
      return currentOptions;
    },
    get disposed() {
      return disposed;
    },
    setOption(nextOptions) {
      if (disposed) return;
      currentOptions = nextOptions;
    },
    resize,
    dispose,
  };

  try {
    instance.resize();
    gpuContext = await GPUContext.create(canvas);
    gpuContext.device?.lost.then((info) => {
      if (disposed) return;
      if (info.reason !== 'destroyed') {
        console.warn('WebGPU device lost:', info);
      }
      dispose();
    });
    instance.resize();
    return instance;
  } catch (error) {
    instance.dispose();
    throw error;
  }
}

export const ChartGPU = {
  create: createChartGPU,
};

