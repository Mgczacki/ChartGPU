/**
 * Public API for worker thread integration.
 *
 * This module provides the message protocol types and utilities for communicating
 * with ChartGPU running in a Web Worker with OffscreenCanvas.
 *
 * @example Worker entry point (worker.ts)
 * ```typescript
 * import { ChartGPUWorkerController, WorkerInboundMessage } from 'chartgpu/worker';
 *
 * const controller = new ChartGPUWorkerController();
 *
 * // Send messages to main thread
 * controller.onMessage((msg) => {
 *   self.postMessage(msg);
 * });
 *
 * // Handle messages from main thread
 * self.onmessage = async (event) => {
 *   await controller.handleMessage(event.data as WorkerInboundMessage);
 * };
 * ```
 *
 * @module chartgpu/worker
 */

// =============================================================================
// Protocol Types
// =============================================================================

// Discriminated unions for all messages
export type {
  WorkerInboundMessage,
  WorkerOutboundMessage,
} from './protocol';

// Inbound message types (Main → Worker)
export type {
  InitMessage,
  SetOptionMessage,
  AppendDataMessage,
  AppendDataBatchMessage,
  ResizeMessage,
  ForwardPointerEventMessage,
  SetZoomRangeMessage,
  SetInteractionXMessage,
  SetAnimationMessage,
  DisposeMessage,
} from './protocol';

// Outbound message types (Worker → Main)
export type {
  ReadyMessage,
  RenderedMessage,
  TooltipUpdateMessage,
  LegendUpdateMessage,
  AxisLabelsUpdateMessage,
  WorkerEventPayload,
  HoverChangeMessage,
  ClickMessage,
  CrosshairMoveMessage,
  ZoomChangeMessage,
  DeviceLostMessage,
  DisposedMessage,
  ErrorMessage,
} from './protocol';

// =============================================================================
// Protocol Utilities
// =============================================================================

export { getTransferables } from './protocol';

// =============================================================================
// Worker Controller
// =============================================================================

export { ChartGPUWorkerController } from './ChartGPUWorkerController';

// =============================================================================
// Worker Proxy (Main Thread)
// =============================================================================

export { ChartGPUWorkerProxy } from './ChartGPUWorkerProxy';
export { createChartInWorker } from './createChartInWorker';
export type { WorkerConfig, PendingRequest } from './types';
export { ChartGPUWorkerError } from './types';

// =============================================================================
// Re-exported Types from Main Library
// =============================================================================

// Configuration types used in protocol messages
export type {
  ChartGPUOptions,
  AnimationConfig,
  PointerEventData,
  TooltipData,
  LegendItem,
  AxisLabel,
} from '../config/types';
