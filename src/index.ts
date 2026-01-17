/**
 * ChartGPU - A GPU-accelerated charting library built with WebGPU
 */

export const version = '1.0.0';

// Chart API (Phase 1)
export { ChartGPU } from './ChartGPU';
export type {
  AxisConfig,
  ChartGPUOptions,
  DataPoint,
  GridConfig,
  LineStyleConfig,
  SeriesConfig,
} from './config/types';

// Core exports - Functional API (preferred)
export type { GPUContextState } from './core/GPUContext';
export {
  createGPUContext,
  createGPUContextAsync,
  initializeGPUContext,
  getCanvasTexture,
  clearScreen,
  destroyGPUContext,
} from './core/GPUContext';

// Class-based API (for backward compatibility)
export { GPUContext } from './core/GPUContext';

// Render scheduler - Functional API (preferred)
export type { RenderSchedulerState, RenderCallback } from './core/RenderScheduler';
export {
  createRenderScheduler,
  createRenderSchedulerAsync,
  startRenderScheduler,
  stopRenderScheduler,
  requestRender,
  destroyRenderScheduler,
} from './core/RenderScheduler';

// Class-based API (for backward compatibility)
export { RenderScheduler } from './core/RenderScheduler';
