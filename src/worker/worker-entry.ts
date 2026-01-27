/**
 * Built-in worker entry point for ChartGPU worker-based rendering.
 * 
 * This file runs in a Web Worker context and handles all chart rendering
 * using OffscreenCanvas. It communicates with the main thread via the
 * ChartGPUWorkerController.
 * 
 * Usage:
 * This file is automatically used when calling ChartGPU.createInWorker()
 * without providing a custom worker URL or instance.
 */

import { ChartGPUWorkerController } from './ChartGPUWorkerController';
import type { WorkerInboundMessage } from './protocol';

// Create worker controller instance
const controller = new ChartGPUWorkerController();

// Register message handler to send messages to main thread
controller.onMessage((msg) => {
  self.postMessage(msg);
});

// Handle messages from main thread
self.onmessage = async (event: MessageEvent<WorkerInboundMessage>) => {
  try {
    await controller.handleMessage(event.data);
  } catch (error) {
    // Send error message to main thread
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      chartId: event.data.chartId,
    });
  }
};

// Handle worker errors
self.onerror = (event) => {
  const error = event instanceof ErrorEvent ? event.error : event;
  console.error('[ChartGPU Worker] Uncaught error:', error);
  self.postMessage({
    type: 'error',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    chartId: 'unknown',
  });
};

// Handle unhandled promise rejections
self.onunhandledrejection = (event) => {
  console.error('[ChartGPU Worker] Unhandled promise rejection:', event.reason);
  self.postMessage({
    type: 'error',
    message: event.reason instanceof Error ? event.reason.message : String(event.reason),
    stack: event.reason instanceof Error ? event.reason.stack : undefined,
    chartId: 'unknown',
  });
};
