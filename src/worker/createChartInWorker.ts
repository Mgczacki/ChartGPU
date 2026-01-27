/**
 * Factory function for creating worker-based ChartGPU instances.
 * 
 * Creates a chart that renders in a Web Worker using OffscreenCanvas for improved
 * main thread performance. The factory handles canvas setup, worker initialization,
 * and returns a ChartGPUInstance-compatible proxy.
 * 
 * ## Usage
 * 
 * ```typescript
 * // Use built-in worker
 * const chart = await createChartInWorker(container, options);
 * 
 * // Use custom worker URL
 * const chart = await createChartInWorker(container, options, './my-worker.js');
 * 
 * // Use existing worker instance
 * const worker = new Worker('./chart-worker.js', { type: 'module' });
 * const chart = await createChartInWorker(container, options, worker);
 * ```
 * 
 * ## Error Handling
 * 
 * - Throws if container is not an HTMLElement
 * - Throws if canvas creation or transfer fails
 * - Throws if worker initialization fails (30s timeout)
 * - Cleans up resources (worker, canvas) on failure
 */

import type { ChartGPUInstance } from '../ChartGPU';
import type { ChartGPUOptions } from '../config/types';
import { ChartGPUWorkerProxy } from './ChartGPUWorkerProxy';
import { ChartGPUWorkerError } from './types';

const WORKER_INIT_TIMEOUT_MS = 30000;

/**
 * Creates a worker-based chart instance with OffscreenCanvas rendering.
 * 
 * @param container - HTML element to attach canvas to
 * @param options - Chart configuration options
 * @param workerOrUrl - Worker instance, URL, or undefined for built-in worker
 * @returns Promise that resolves to ChartGPUInstance proxy
 * @throws {ChartGPUWorkerError} If container is invalid, canvas creation fails, or worker initialization fails
 */
export async function createChartInWorker(
  container: HTMLElement,
  options: ChartGPUOptions,
  workerOrUrl?: Worker | string | URL
): Promise<ChartGPUInstance> {
  // Validate container
  if (!container || !(container instanceof HTMLElement)) {
    throw new ChartGPUWorkerError(
      'Invalid container: must be an HTMLElement',
      'INVALID_ARGUMENT',
      'createChartInWorker',
      'unknown'
    );
  }

  let worker: Worker | null = null;
  let workerCreated = false;
  const chartId = `chart_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

  try {
    // Initialize worker based on input type
    if (workerOrUrl instanceof Worker) {
      // Use provided worker instance
      worker = workerOrUrl;
      workerCreated = false;
    } else if (typeof workerOrUrl === 'string' || workerOrUrl instanceof URL) {
      // Create worker from URL string or URL object
      try {
        worker = new Worker(workerOrUrl, { type: 'module' });
        workerCreated = true;
      } catch (error) {
        throw new ChartGPUWorkerError(
          `Failed to create worker from URL: ${error instanceof Error ? error.message : String(error)}`,
          'WEBGPU_INIT_FAILED',
          'createChartInWorker',
          chartId
        );
      }
    } else {
      // Use built-in worker (bundler will resolve this)
      try {
        worker = new Worker(new URL('./worker-entry.ts', import.meta.url), { type: 'module' });
        workerCreated = true;
      } catch (error) {
        throw new ChartGPUWorkerError(
          `Failed to create built-in worker: ${error instanceof Error ? error.message : String(error)}`,
          'WEBGPU_INIT_FAILED',
          'createChartInWorker',
          chartId
        );
      }
    }

    // Create proxy instance
    const proxy = new ChartGPUWorkerProxy(
      {
        worker,
        chartId,
        messageTimeout: WORKER_INIT_TIMEOUT_MS,
      },
      container,
      options
    );

    // Initialize worker and wait for ready response
    // The proxy.init() method handles:
    // - Creating canvas element with proper styling
    // - Appending canvas to container
    // - Measuring dimensions and calculating device pixel ratio
    // - Calling canvas.transferControlToOffscreen()
    // - Sending InitMessage with offscreenCanvas, dimensions, devicePixelRatio
    // - Transferring OffscreenCanvas ownership
    // - Waiting for ready message from worker
    // - Timeout handling (30s default)
    try {
      await proxy.init();
    } catch (error) {
      // Clean up proxy resources on initialization failure
      proxy.dispose();
      throw error;
    }

    return proxy;
  } catch (error) {
    // Clean up resources on any failure
    if (worker && workerCreated) {
      // Only terminate worker if we created it (not if user provided it)
      try {
        worker.terminate();
      } catch {
        // Best effort cleanup
      }
    }

    // Re-throw as ChartGPUWorkerError if not already
    if (error instanceof ChartGPUWorkerError) {
      throw error;
    }

    throw new ChartGPUWorkerError(
      `Failed to create worker chart: ${error instanceof Error ? error.message : String(error)}`,
      'UNKNOWN',
      'createChartInWorker',
      chartId
    );
  }
}
