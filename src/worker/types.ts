/**
 * Worker-related types for ChartGPU worker thread support.
 */

/**
 * Configuration for creating a worker-based chart instance.
 */
export interface WorkerConfig {
  /** Web Worker instance to use for rendering. */
  readonly worker: Worker;
  /** Chart ID for worker communication (auto-generated if not provided). */
  readonly chartId?: string;
  /** Timeout in milliseconds for message responses (default: 30000). */
  readonly messageTimeout?: number;
  /** Optional WebGPU initialization options. */
  readonly gpuOptions?: {
    readonly powerPreference?: 'low-power' | 'high-performance';
    readonly requiredFeatures?: ReadonlyArray<string>;
  };
}

/**
 * Error thrown when worker operations fail.
 */
export class ChartGPUWorkerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly operation: string,
    public readonly chartId?: string
  ) {
    super(message);
    this.name = 'ChartGPUWorkerError';
  }
}

/**
 * Internal pending request tracker for message correlation.
 */
export interface PendingRequest<T = unknown> {
  readonly resolve: (value: T) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
  readonly operation: string;
}
