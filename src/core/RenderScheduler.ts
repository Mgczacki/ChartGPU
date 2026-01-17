/**
 * RenderScheduler - 60fps render loop management
 * 
 * Manages a requestAnimationFrame-based render loop that runs at 60fps,
 * providing delta time tracking and frame scheduling control.
 * 
 * The scheduler tracks delta time between frames and supports future
 * optimizations through dirty frame marking.
 */

/**
 * Callback function type for render frames.
 * Receives delta time in milliseconds since the last frame.
 */
export type RenderCallback = (deltaTime: number) => void;

/**
 * RenderScheduler manages a 60fps render loop using requestAnimationFrame.
 * 
 * Provides start/stop control and delta time tracking for frame-based rendering.
 * The scheduler is designed to work seamlessly with WebGPU rendering pipelines.
 * 
 * @example
 * ```typescript
 * const scheduler = new RenderScheduler();
 * scheduler.start((deltaTime) => {
 *   // Render frame with delta time
 *   renderFrame(deltaTime);
 * });
 * 
 * // Later, stop the loop
 * scheduler.stop();
 * ```
 */
export class RenderScheduler {
  private rafId: number | null = null;
  private isRunning: boolean = false;
  private lastFrameTime: number = 0;
  // Reserved for future optimization: skip frames when dirty is false
  private _dirty: boolean = false;

  /**
   * Starts the render loop.
   * 
   * Begins a requestAnimationFrame loop that calls the provided callback
   * every frame with the delta time in milliseconds since the last frame.
   * 
   * @param callback - Function to call each frame with delta time
   * @throws {Error} If callback is not provided
   * @throws {Error} If scheduler is already running
   * 
   * @example
   * ```typescript
   * scheduler.start((deltaTime) => {
   *   console.log(`Frame delta: ${deltaTime}ms`);
   * });
   * ```
   */
  start(callback: RenderCallback): void {
    if (!callback) {
      throw new Error('Render callback is required');
    }

    if (this.isRunning) {
      throw new Error('RenderScheduler is already running. Call stop() before starting again.');
    }

    this.isRunning = true;
    this.lastFrameTime = performance.now();
    // Mark as dirty for first frame (reserved for future optimization)
    this._dirty = true;

    const frameHandler = (currentTime: number) => {
      if (!this.isRunning) {
        return;
      }

      const deltaTime = currentTime - this.lastFrameTime;
      this.lastFrameTime = currentTime;

      // Future optimization: skip render if not dirty
      // Currently always renders, but dirty flag is tracked for future use
      if (this._dirty) {
        // Reset dirty flag after checking (for future frame-skipping optimization)
        this._dirty = false;
      }

      // Call the render callback with delta time
      callback(deltaTime);

      // Continue the loop if still running
      if (this.isRunning) {
        this.rafId = requestAnimationFrame(frameHandler);
      }
    };

    // Start the first frame
    this.rafId = requestAnimationFrame(frameHandler);
  }

  /**
   * Stops the render loop.
   * 
   * Cancels any pending requestAnimationFrame calls and stops the loop.
   * The scheduler can be restarted by calling start() again.
   * 
   * @example
   * ```typescript
   * scheduler.stop();
   * ```
   */
  stop(): void {
    this.isRunning = false;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Marks the current frame as dirty, indicating it needs to be rendered.
   * 
   * This method is prepared for future optimization where frames can be
   * skipped if nothing has changed. Currently, all frames render regardless
   * of the dirty flag.
   * 
   * @example
   * ```typescript
   * // Mark frame as needing render after state change
   * scheduler.requestRender();
   * ```
   */
  requestRender(): void {
    this._dirty = true;
  }

  /**
   * Checks if the scheduler is currently running.
   * 
   * @returns True if the render loop is active, false otherwise
   */
  get running(): boolean {
    return this.isRunning;
  }
}
