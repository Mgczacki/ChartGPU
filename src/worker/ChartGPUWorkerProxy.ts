/**
 * ChartGPUWorkerProxy - Main-thread proxy for worker-based chart rendering.
 * 
 * Implements ChartGPUInstance interface while delegating rendering to a Web Worker.
 * Maintains local state cache for synchronous getters and provides message-based
 * communication with request/response correlation.
 * 
 * ## Architecture
 * 
 * - **Message Correlation**: Unique message IDs track request/response pairs
 * - **State Cache**: Local copies of options, disposed, interactionX, zoomRange
 * - **Event System**: Re-emits worker events to registered listeners
 * - **Timeout Handling**: 30s default timeout for async operations
 * 
 * ## Usage
 * 
 * ```typescript
 * const worker = new Worker('chart-worker.js');
 * const proxy = new ChartGPUWorkerProxy(worker, container, options);
 * await proxy.init(); // Wait for worker initialization
 * 
 * // Use like regular ChartGPUInstance
 * proxy.on('click', (payload) => console.log(payload));
 * proxy.setOption(newOptions);
 * proxy.dispose();
 * ```
 */

import type {
  ChartGPUInstance,
  ChartGPUEventName,
  ChartGPUEventCallback,
  ChartGPUCrosshairMoveCallback,
  ChartGPUEventPayload,
  ChartGPUCrosshairMovePayload,
} from '../ChartGPU';
import type { ChartGPUOptions, DataPoint, OHLCDataPoint, PointerEventData } from '../config/types';
import type { ThemeConfig } from '../themes/types';
import type {
  WorkerInboundMessage,
  WorkerOutboundMessage,
  ReadyMessage,
  TooltipUpdateMessage,
  LegendUpdateMessage,
  AxisLabelsUpdateMessage,
} from './protocol';
import type { WorkerConfig, PendingRequest } from './types';
import { ChartGPUWorkerError } from './types';
import { createTooltip } from '../components/createTooltip';
import type { Tooltip } from '../components/createTooltip';
import { createLegend } from '../components/createLegend';
import type { Legend } from '../components/createLegend';
import { createTextOverlay } from '../components/createTextOverlay';
import type { TextOverlay } from '../components/createTextOverlay';
import { createDataZoomSlider } from '../components/createDataZoomSlider';
import type { DataZoomSlider } from '../components/createDataZoomSlider';
import { createZoomState } from '../interaction/createZoomState';
import type { ZoomState } from '../interaction/createZoomState';

type AnyChartGPUEventCallback = ChartGPUEventCallback | ChartGPUCrosshairMoveCallback;

/**
 * Generates a unique message ID for request/response correlation.
 * Uses timestamp + counter for collision resistance.
 */
let messageIdCounter = 0;
function generateMessageId(): string {
  return `msg_${Date.now()}_${++messageIdCounter}`;
}

/**
 * Generates a unique chart ID for worker communication.
 * Uses timestamp + random suffix for collision resistance.
 */
function generateChartId(): string {
  return `chart_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Serializes DataPoint or OHLCDataPoint arrays to ArrayBuffer for zero-copy transfer.
 * 
 * @param points - Array of data points to serialize
 * @returns Tuple of [ArrayBuffer, stride] where stride is 16 for DataPoint, 40 for OHLCDataPoint
 */
function serializeDataPoints(
  points: ReadonlyArray<DataPoint> | ReadonlyArray<OHLCDataPoint>
): [ArrayBuffer, number] {
  if (points.length === 0) {
    return [new ArrayBuffer(0), 0];
  }

  // Detect point type from first element
  const firstPoint = points[0];
  const isOHLC = Array.isArray(firstPoint)
    ? firstPoint.length === 5
    : 'timestamp' in firstPoint && 'open' in firstPoint;

  if (isOHLC) {
    // OHLCDataPoint: [timestamp, open, close, low, high] (5 × 8 bytes = 40 bytes)
    const stride = 40;
    const buffer = new ArrayBuffer(points.length * stride);
    const view = new Float64Array(buffer);
    
    for (let i = 0, offset = 0; i < points.length; i++, offset += 5) {
      const p = points[i] as OHLCDataPoint;
      if (Array.isArray(p)) {
        view[offset] = p[0];     // timestamp
        view[offset + 1] = p[1]; // open
        view[offset + 2] = p[2]; // close
        view[offset + 3] = p[3]; // low
        view[offset + 4] = p[4]; // high
      } else {
        // Type assertion: we know it's OHLCDataPointObject at this point
        const ohlcObj = p as import('../config/types').OHLCDataPointObject;
        view[offset] = ohlcObj.timestamp;
        view[offset + 1] = ohlcObj.open;
        view[offset + 2] = ohlcObj.close;
        view[offset + 3] = ohlcObj.low;
        view[offset + 4] = ohlcObj.high;
      }
    }
    
    return [buffer, stride];
  } else {
    // DataPoint: [x, y] pairs (2 × 8 bytes = 16 bytes)
    const stride = 16;
    const buffer = new ArrayBuffer(points.length * stride);
    const view = new Float64Array(buffer);
    
    for (let i = 0, offset = 0; i < points.length; i++, offset += 2) {
      const p = points[i] as DataPoint;
      if (Array.isArray(p)) {
        view[offset] = p[0];     // x
        view[offset + 1] = p[1]; // y
      } else {
        // Type assertion: we know it's { x, y } at this point
        const dataObj = p as { x: number; y: number };
        view[offset] = dataObj.x;
        view[offset + 1] = dataObj.y;
      }
    }
    
    return [buffer, stride];
  }
}

/**
 * Pending overlay updates for RAF batching.
 */
type PendingOverlayUpdates = {
  tooltip?: TooltipUpdateMessage;
  legend?: LegendUpdateMessage;
  axisLabels?: AxisLabelsUpdateMessage;
};

/**
 * Serialized pointer event data for worker communication.
 * Extends PointerEventData with additional fields needed for interaction handling.
 */
interface SerializedPointerEvent {
  readonly type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointerleave' | 'wheel';
  readonly clientX: number;
  readonly clientY: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly button: number;
  readonly buttons: number;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly pointerType: string;
  readonly isPrimary: boolean;
  readonly timestamp: number;
}

/**
 * Serialized wheel event data for worker communication.
 * Includes all pointer event fields plus scroll deltas.
 */
interface SerializedWheelEvent extends SerializedPointerEvent {
  readonly type: 'wheel';
  readonly deltaX: number;
  readonly deltaY: number;
  readonly deltaZ: number;
  readonly deltaMode: number;
}

/**
 * Serializes a PointerEvent to a plain object for postMessage transfer.
 * Extracts only the serializable properties needed for worker-side interaction handling.
 * 
 * @param event - Native PointerEvent from canvas
 * @param eventType - Event type to use in serialized data
 * @returns Serialized event data
 * @throws {Error} If event is null or undefined
 */
function serializePointerEvent(event: PointerEvent, eventType: SerializedPointerEvent['type']): SerializedPointerEvent {
  if (!event) {
    throw new Error('Cannot serialize null or undefined PointerEvent');
  }
  
  return {
    type: eventType,
    clientX: event.clientX ?? 0,
    clientY: event.clientY ?? 0,
    offsetX: event.offsetX ?? 0,
    offsetY: event.offsetY ?? 0,
    button: event.button ?? 0,
    buttons: event.buttons ?? 0,
    ctrlKey: event.ctrlKey ?? false,
    shiftKey: event.shiftKey ?? false,
    altKey: event.altKey ?? false,
    metaKey: event.metaKey ?? false,
    pointerType: event.pointerType ?? 'mouse',
    isPrimary: event.isPrimary ?? true,
    timestamp: event.timeStamp ?? performance.now(),
  };
}

/**
 * Serializes a WheelEvent to a plain object for postMessage transfer.
 * Includes all pointer event fields plus wheel-specific scroll deltas.
 * 
 * @param event - Native WheelEvent from canvas
 * @returns Serialized wheel event data
 * @throws {Error} If event is null or undefined
 */
function serializeWheelEvent(event: WheelEvent): SerializedWheelEvent {
  if (!event) {
    throw new Error('Cannot serialize null or undefined WheelEvent');
  }
  
  return {
    type: 'wheel',
    clientX: event.clientX ?? 0,
    clientY: event.clientY ?? 0,
    offsetX: event.offsetX ?? 0,
    offsetY: event.offsetY ?? 0,
    button: event.button ?? 0,
    buttons: event.buttons ?? 0,
    ctrlKey: event.ctrlKey ?? false,
    shiftKey: event.shiftKey ?? false,
    altKey: event.altKey ?? false,
    metaKey: event.metaKey ?? false,
    pointerType: 'mouse', // WheelEvent is always from mouse
    isPrimary: true,
    timestamp: event.timeStamp ?? performance.now(),
    deltaX: event.deltaX ?? 0,
    deltaY: event.deltaY ?? 0,
    deltaZ: event.deltaZ ?? 0,
    deltaMode: event.deltaMode ?? 0,
  };
}

/**
 * ChartGPUWorkerProxy - Main-thread proxy for worker-based rendering.
 * 
 * Implements ChartGPUInstance interface, delegating all rendering to a Web Worker
 * while maintaining local state cache for synchronous operations.
 */
export class ChartGPUWorkerProxy implements ChartGPUInstance {
  private readonly worker: Worker;
  private readonly chartId: string;
  private readonly messageTimeout: number;
  
  // State cache (synchronized with worker)
  private cachedOptions: ChartGPUOptions;
  private isDisposed = false;
  private cachedInteractionX: number | null = null;
  private cachedZoomRange: Readonly<{ start: number; end: number }> | null = null;
  
  // Message correlation system
  private readonly pendingRequests = new Map<string, PendingRequest>();
  
  // Event system
  private readonly listeners = new Map<ChartGPUEventName, Set<AnyChartGPUEventCallback>>();
  
  // Worker message handler (bound once)
  private readonly boundMessageHandler: (event: MessageEvent) => void;
  
  // DOM overlays
  private tooltip: Tooltip | null = null;
  private legend: Legend | null = null;
  private textOverlay: TextOverlay | null = null;
  private dataZoomSlider: DataZoomSlider | null = null;
  private zoomState: ZoomState | null = null;
  
  // RAF batching for overlay updates
  private pendingOverlayUpdates: PendingOverlayUpdates = {};
  private overlayUpdateRafId: number | null = null;
  
  // Event forwarding to worker
  private readonly boundEventHandlers: {
    pointerdown: ((e: PointerEvent) => void) | null;
    pointermove: ((e: PointerEvent) => void) | null;
    pointerup: ((e: PointerEvent) => void) | null;
    pointerleave: ((e: PointerEvent) => void) | null;
    wheel: ((e: WheelEvent) => void) | null;
  } = {
    pointerdown: null,
    pointermove: null,
    pointerup: null,
    pointerleave: null,
    wheel: null,
  };
  
  // RAF throttling for pointermove events
  private pendingMoveEvent: PointerEvent | null = null;
  private moveThrottleRafId: number | null = null;
  
  // ResizeObserver and device pixel ratio monitoring
  private resizeObserver: ResizeObserver | null = null;
  private currentDpr: number = 1;
  private dprMediaQuery: MediaQueryList | null = null;
  private boundDprChangeHandler: ((e: MediaQueryListEvent) => void) | null = null;
  private pendingResize: { width: number; height: number } | null = null;
  private resizeRafId: number | null = null;
  
  /**
   * Creates a new worker-based chart proxy.
   * 
   * @param config - Worker configuration
   * @param container - HTML element to attach canvas to
   * @param options - Chart options
   */
  constructor(
    config: WorkerConfig,
    private readonly container: HTMLElement,
    options: ChartGPUOptions
  ) {
    this.worker = config.worker;
    this.chartId = config.chartId ?? generateChartId();
    this.messageTimeout = config.messageTimeout ?? 30000;
    this.cachedOptions = options;
    
    // Initialize event listener maps
    this.listeners.set('click', new Set());
    this.listeners.set('mouseover', new Set());
    this.listeners.set('mouseout', new Set());
    this.listeners.set('crosshairMove', new Set());
    
    // Bind message handler once (avoid creating new function on every message)
    this.boundMessageHandler = this.handleWorkerMessage.bind(this);
    this.worker.addEventListener('message', this.boundMessageHandler);
  }
  
  /**
   * Initializes the worker chart instance.
   * Must be called before using the chart.
   * 
   * @returns Promise that resolves when worker is ready
   */
  async init(): Promise<void> {
    // Create OffscreenCanvas for worker rendering
    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    this.container.appendChild(canvas);
    
    // Get canvas dimensions
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    
    canvas.width = width;
    canvas.height = height;
    
    // Set up event listeners on canvas BEFORE transferring to worker
    this.setupEventListeners(canvas);
    
    // Set up ResizeObserver and device pixel ratio monitoring BEFORE transferring canvas
    this.setupResizeObserver(canvas);
    this.setupDevicePixelRatioMonitoring();
    
    // Create DOM overlays AFTER canvas is in DOM (overlays need container)
    this.createOverlays();
    
    // Transfer canvas to worker
    const offscreenCanvas = canvas.transferControlToOffscreen();
    
    // Send init message and wait for ready response
    await this.sendMessageWithResponse<ReadyMessage>({
      type: 'init',
      chartId: this.chartId,
      messageId: generateMessageId(),
      canvas: offscreenCanvas,
      devicePixelRatio: dpr,
      options: this.cachedOptions,
    }, [offscreenCanvas]);
  }
  
  // =============================================================================
  // Event Forwarding to Worker
  // =============================================================================
  
  /**
   * Sets up pointer and wheel event listeners on the canvas.
   * Forwards events to worker for interaction handling (hover, click, zoom, pan).
   * 
   * @param canvas - Canvas element to attach listeners to
   */
  private setupEventListeners(canvas: HTMLCanvasElement): void {
    if (this.isDisposed) return;
    
    // Pointer down handler - for click detection and pan start
    this.boundEventHandlers.pointerdown = (e: PointerEvent) => {
      if (this.isDisposed) return;
      const serialized = serializePointerEvent(e, 'pointerdown');
      this.sendMessage({
        type: 'forwardPointerEvent',
        chartId: this.chartId,
        event: serialized as unknown as PointerEventData,
      });
    };
    
    // Pointer move handler - throttled to 60fps via RAF
    this.boundEventHandlers.pointermove = (e: PointerEvent) => {
      if (this.isDisposed) return;
      
      // Store latest move event
      this.pendingMoveEvent = e;
      
      // Schedule RAF if not already scheduled
      if (this.moveThrottleRafId === null) {
        this.moveThrottleRafId = requestAnimationFrame(() => {
          this.moveThrottleRafId = null;
          if (this.isDisposed || !this.pendingMoveEvent) return;
          
          const serialized = serializePointerEvent(this.pendingMoveEvent, 'pointermove');
          this.pendingMoveEvent = null;
          
          this.sendMessage({
            type: 'forwardPointerEvent',
            chartId: this.chartId,
            event: serialized as unknown as PointerEventData,
          });
        });
      }
    };
    
    // Pointer up handler - for click completion and pan end
    this.boundEventHandlers.pointerup = (e: PointerEvent) => {
      if (this.isDisposed) return;
      const serialized = serializePointerEvent(e, 'pointerup');
      this.sendMessage({
        type: 'forwardPointerEvent',
        chartId: this.chartId,
        event: serialized as unknown as PointerEventData,
      });
    };
    
    // Pointer leave handler - for clearing hover state
    this.boundEventHandlers.pointerleave = (e: PointerEvent) => {
      if (this.isDisposed) return;
      const serialized = serializePointerEvent(e, 'pointerleave');
      this.sendMessage({
        type: 'forwardPointerEvent',
        chartId: this.chartId,
        event: serialized as unknown as PointerEventData,
      });
    };
    
    // Wheel handler - for zoom interactions
    this.boundEventHandlers.wheel = (e: WheelEvent) => {
      if (this.isDisposed) return;
      const serialized = serializeWheelEvent(e);
      this.sendMessage({
        type: 'forwardPointerEvent',
        chartId: this.chartId,
        event: serialized as unknown as PointerEventData,
      });
    };
    
    // Attach all event listeners
    canvas.addEventListener('pointerdown', this.boundEventHandlers.pointerdown);
    canvas.addEventListener('pointermove', this.boundEventHandlers.pointermove);
    canvas.addEventListener('pointerup', this.boundEventHandlers.pointerup);
    canvas.addEventListener('pointerleave', this.boundEventHandlers.pointerleave);
    // IMPORTANT: passive: false allows preventDefault() in wheel handler for custom zoom behavior
    // Without this, browsers may apply default scroll behavior before our handler runs
    canvas.addEventListener('wheel', this.boundEventHandlers.wheel, { passive: false });
  }
  
  /**
   * Removes all event listeners from the canvas and cleans up RAF throttling.
   */
  private cleanupEventListeners(): void {
    const canvas = this.container.querySelector('canvas');
    if (!canvas) return;
    
    // Cancel pending RAF for throttled move events
    if (this.moveThrottleRafId !== null) {
      cancelAnimationFrame(this.moveThrottleRafId);
      this.moveThrottleRafId = null;
    }
    
    // Clear pending move event
    this.pendingMoveEvent = null;
    
    // Remove all event listeners
    if (this.boundEventHandlers.pointerdown) {
      canvas.removeEventListener('pointerdown', this.boundEventHandlers.pointerdown);
      this.boundEventHandlers.pointerdown = null;
    }
    if (this.boundEventHandlers.pointermove) {
      canvas.removeEventListener('pointermove', this.boundEventHandlers.pointermove);
      this.boundEventHandlers.pointermove = null;
    }
    if (this.boundEventHandlers.pointerup) {
      canvas.removeEventListener('pointerup', this.boundEventHandlers.pointerup);
      this.boundEventHandlers.pointerup = null;
    }
    if (this.boundEventHandlers.pointerleave) {
      canvas.removeEventListener('pointerleave', this.boundEventHandlers.pointerleave);
      this.boundEventHandlers.pointerleave = null;
    }
    if (this.boundEventHandlers.wheel) {
      canvas.removeEventListener('wheel', this.boundEventHandlers.wheel);
      this.boundEventHandlers.wheel = null;
    }
  }
  
  // =============================================================================
  // ResizeObserver and Device Pixel Ratio Monitoring
  // =============================================================================
  
  /**
   * Sets up ResizeObserver to monitor container size changes.
   * Uses RAF batching to throttle rapid resize events (e.g., during window drag-resize).
   * 
   * @param canvas - Canvas element to measure dimensions from
   */
  private setupResizeObserver(canvas: HTMLCanvasElement): void {
    if (this.isDisposed) return;
    
    // Track last known dimensions to avoid no-op resizes
    let lastWidth = canvas.clientWidth;
    let lastHeight = canvas.clientHeight;
    
    this.resizeObserver = new ResizeObserver(() => {
      if (this.isDisposed) return;
      
      // Measure new dimensions from canvas (CSS pixels)
      const newWidth = canvas.clientWidth;
      const newHeight = canvas.clientHeight;
      
      // Check if dimensions actually changed (ResizeObserver can fire on layout shifts)
      if (newWidth === lastWidth && newHeight === lastHeight) {
        return; // No-op resize
      }
      
      lastWidth = newWidth;
      lastHeight = newHeight;
      
      // Store pending dimensions and schedule RAF if not already scheduled
      this.pendingResize = { width: newWidth, height: newHeight };
      
      if (this.resizeRafId === null) {
        this.resizeRafId = requestAnimationFrame(() => {
          this.resizeRafId = null;
          
          // Safety: Check disposed and pendingResize before proceeding
          if (this.isDisposed) return;
          if (!this.pendingResize) return;
          
          const { width, height } = this.pendingResize;
          this.pendingResize = null;
          
          // Send resize message to worker with physical pixels
          const dpr = this.currentDpr;
          const physicalWidth = Math.max(1, Math.round(width * dpr));
          const physicalHeight = Math.max(1, Math.round(height * dpr));
          
          this.sendMessage({
            type: 'resize',
            chartId: this.chartId,
            width: physicalWidth,
            height: physicalHeight,
            devicePixelRatio: dpr,
            requestRender: true,
          });
        });
      }
    });
    
    // Start observing the canvas element (more precise than observing container)
    this.resizeObserver.observe(canvas);
  }
  
  /**
   * Sets up device pixel ratio monitoring using matchMedia.
   * Handles window zoom, moving between displays, and OS display scaling changes.
   */
  private setupDevicePixelRatioMonitoring(): void {
    if (this.isDisposed) return;
    
    // Initialize current DPR
    this.currentDpr = window.devicePixelRatio || 1;
    
    // Create media query for current DPR
    this.dprMediaQuery = window.matchMedia(`(resolution: ${this.currentDpr}dppx)`);
    
    // Bind handler once to avoid creating new functions
    this.boundDprChangeHandler = (_e: MediaQueryListEvent) => {
      if (this.isDisposed) return;
      
      // DPR has changed - update tracked value
      const newDpr = window.devicePixelRatio || 1;
      if (newDpr === this.currentDpr) return;
      
      this.currentDpr = newDpr;
      
      // Recreate media query for new DPR
      if (this.dprMediaQuery && this.boundDprChangeHandler) {
        this.dprMediaQuery.removeEventListener('change', this.boundDprChangeHandler);
      }
      this.dprMediaQuery = window.matchMedia(`(resolution: ${this.currentDpr}dppx)`);
      if (this.boundDprChangeHandler) {
        this.dprMediaQuery.addEventListener('change', this.boundDprChangeHandler);
      }
      
      // Trigger resize with new DPR
      const canvas = this.container.querySelector('canvas');
      if (!canvas) return;
      
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const physicalWidth = Math.max(1, Math.round(width * this.currentDpr));
      const physicalHeight = Math.max(1, Math.round(height * this.currentDpr));
      
      this.sendMessage({
        type: 'resize',
        chartId: this.chartId,
        width: physicalWidth,
        height: physicalHeight,
        devicePixelRatio: this.currentDpr,
        requestRender: true,
      });
    };
    
    this.dprMediaQuery.addEventListener('change', this.boundDprChangeHandler);
  }
  
  /**
   * Cleans up ResizeObserver and device pixel ratio monitoring.
   */
  private cleanupResizeMonitoring(): void {
    // Disconnect ResizeObserver
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    
    // Cancel pending RAF for resize
    if (this.resizeRafId !== null) {
      cancelAnimationFrame(this.resizeRafId);
      this.resizeRafId = null;
    }
    
    // Clear pending resize state
    this.pendingResize = null;
    
    // Remove DPR media query listener
    if (this.dprMediaQuery && this.boundDprChangeHandler) {
      this.dprMediaQuery.removeEventListener('change', this.boundDprChangeHandler);
      this.dprMediaQuery = null;
      this.boundDprChangeHandler = null;
    }
  }
  
  // =============================================================================
  // DOM Overlay Management
  // =============================================================================
  
  /**
   * Creates DOM overlays for tooltip, legend, text labels, and data zoom slider.
   * Called after canvas is appended to container.
   */
  private createOverlays(): void {
    if (this.isDisposed) return;
    
    // Always create tooltip (for hover interactions)
    this.tooltip = createTooltip(this.container);
    
    // Always create text overlay (for axis labels)
    this.textOverlay = createTextOverlay(this.container);
    
    // Always create legend (worker will send updates if needed)
    // Default position is 'right' - worker may override via messages
    this.legend = createLegend(this.container, 'right');
    
    // Create data zoom slider if configured
    const hasSliderZoom = this.cachedOptions.dataZoom?.some(z => z?.type === 'slider') ?? false;
    if (hasSliderZoom) {
      // Create zoom state that delegates to worker via setZoomRange
      const initialStart = this.cachedZoomRange?.start ?? 0;
      const initialEnd = this.cachedZoomRange?.end ?? 100;
      this.zoomState = createZoomState(initialStart, initialEnd);
      
      // Sync zoom state changes to worker
      this.zoomState.onChange((range) => {
        if (this.isDisposed) return;
        this.setZoomRange(range.start, range.end);
      });
      
      this.dataZoomSlider = createDataZoomSlider(this.container, this.zoomState);
      
      // Apply theme to slider
      const themeConfig = this.resolveThemeConfig();
      this.dataZoomSlider.update(themeConfig);
    }
  }
  
  /**
   * Resolves ThemeConfig from options, handling both string presets and custom configs.
   */
  private resolveThemeConfig(): ThemeConfig {
    const theme = this.cachedOptions.theme;
    
    // Default theme values
    const defaults: ThemeConfig = {
      colorPalette: [],
      backgroundColor: '#1a1a2e',
      textColor: '#e0e0e0',
      axisLineColor: 'rgba(224,224,224,0.2)',
      axisTickColor: 'rgba(224,224,224,0.4)',
      gridLineColor: 'rgba(224,224,224,0.1)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: 12,
    };
    
    if (!theme || typeof theme === 'string') {
      // Theme is either undefined or a string preset ('dark' | 'light')
      // For now, just use defaults
      return defaults;
    }
    
    // Theme is a custom ThemeConfig object - merge with defaults
    return {
      colorPalette: theme.colorPalette ?? defaults.colorPalette,
      backgroundColor: theme.backgroundColor ?? defaults.backgroundColor,
      textColor: theme.textColor ?? defaults.textColor,
      axisLineColor: theme.axisLineColor ?? defaults.axisLineColor,
      axisTickColor: theme.axisTickColor ?? defaults.axisTickColor,
      gridLineColor: theme.gridLineColor ?? defaults.gridLineColor,
      fontFamily: theme.fontFamily ?? defaults.fontFamily,
      fontSize: theme.fontSize ?? defaults.fontSize,
    };
  }
  
  /**
   * Disposes all DOM overlays and cleans up RAF batching.
   */
  private disposeOverlays(): void {
    // Cancel any pending RAF for overlay updates
    if (this.overlayUpdateRafId !== null) {
      cancelAnimationFrame(this.overlayUpdateRafId);
      this.overlayUpdateRafId = null;
    }
    
    // Clear pending updates
    this.pendingOverlayUpdates = {};
    
    // Dispose all overlays
    this.tooltip?.dispose();
    this.tooltip = null;
    
    this.legend?.dispose();
    this.legend = null;
    
    this.textOverlay?.dispose();
    this.textOverlay = null;
    
    this.dataZoomSlider?.dispose();
    this.dataZoomSlider = null;
    
    this.zoomState = null;
  }
  
  /**
   * Schedules overlay updates in the next RAF to batch multiple updates.
   */
  private scheduleOverlayUpdates(): void {
    if (this.isDisposed) return;
    if (this.overlayUpdateRafId !== null) return; // Already scheduled
    
    this.overlayUpdateRafId = requestAnimationFrame(() => {
      this.overlayUpdateRafId = null;
      if (this.isDisposed) return;
      
      this.applyPendingOverlayUpdates();
    });
  }
  
  /**
   * Applies all pending overlay updates in a single batch.
   */
  private applyPendingOverlayUpdates(): void {
    const { tooltip: tooltipMsg, legend: legendMsg, axisLabels: axisLabelsMsg } = this.pendingOverlayUpdates;
    
    // Apply tooltip update
    if (tooltipMsg && this.tooltip) {
      if (tooltipMsg.data) {
        this.tooltip.show(tooltipMsg.data.x, tooltipMsg.data.y, tooltipMsg.data.content);
      } else {
        this.tooltip.hide();
      }
    }
    
    // Apply legend update
    if (legendMsg && this.legend) {
      // Convert LegendItem[] to minimal SeriesConfig[] for legend component
      const minimalSeries = legendMsg.items.map((item) => ({
        type: 'line' as const,
        name: item.name,
        color: item.color,
        data: [],
      }));
      
      const themeConfig = this.resolveThemeConfig();
      this.legend.update(minimalSeries, themeConfig);
    }
    
    // Apply axis labels update
    if (axisLabelsMsg && this.textOverlay) {
      this.textOverlay.clear();
      
      // Get theme config for label styling
      const themeConfig = this.resolveThemeConfig();
      
      // Add x-axis labels
      for (const label of axisLabelsMsg.xLabels) {
        this.textOverlay.addLabel(label.text, label.position, 0, {
          fontSize: themeConfig.fontSize,
          color: themeConfig.textColor,
          anchor: 'middle',
          rotation: label.rotation,
        });
      }
      
      // Add y-axis labels
      for (const label of axisLabelsMsg.yLabels) {
        this.textOverlay.addLabel(label.text, 0, label.position, {
          fontSize: themeConfig.fontSize,
          color: themeConfig.textColor,
          anchor: 'end',
          rotation: label.rotation,
        });
      }
    }
    
    // Clear pending updates
    this.pendingOverlayUpdates = {};
  }
  
  // =============================================================================
  // ChartGPUInstance Interface Implementation
  // =============================================================================
  
  get options(): Readonly<ChartGPUOptions> {
    return this.cachedOptions;
  }
  
  get disposed(): boolean {
    return this.isDisposed;
  }
  
  setOption(options: ChartGPUOptions): void {
    if (this.isDisposed) {
      throw new ChartGPUWorkerError(
        'Cannot setOption on disposed chart',
        'DISPOSED',
        'setOption',
        this.chartId
      );
    }
    
    // Check if dataZoom slider needs to be added or removed
    const prevOptions = this.cachedOptions;
    const hadSliderZoom = prevOptions.dataZoom?.some(z => z?.type === 'slider') ?? false;
    const hasSliderZoom = options.dataZoom?.some(z => z?.type === 'slider') ?? false;
    
    this.cachedOptions = options;
    
    // Recreate overlays if dataZoom slider presence changed
    if (hadSliderZoom !== hasSliderZoom) {
      // Dispose old overlays
      this.disposeOverlays();
      // Recreate with new configuration
      this.createOverlays();
    }
    
    this.sendMessage({
      type: 'setOption',
      chartId: this.chartId,
      options,
    });
  }
  
  appendData(seriesIndex: number, newPoints: DataPoint[] | OHLCDataPoint[]): void {
    if (this.isDisposed) {
      throw new ChartGPUWorkerError(
        'Cannot appendData on disposed chart',
        'DISPOSED',
        'appendData',
        this.chartId
      );
    }
    
    if (!Number.isInteger(seriesIndex) || seriesIndex < 0) {
      throw new ChartGPUWorkerError(
        `Invalid seriesIndex: ${seriesIndex}. Must be a non-negative integer.`,
        'INVALID_ARGUMENT',
        'appendData',
        this.chartId
      );
    }
    
    if (!newPoints || newPoints.length === 0) {
      return; // No-op for empty arrays
    }
    
    const [data, stride] = serializeDataPoints(newPoints);
    
    this.sendMessage({
      type: 'appendData',
      chartId: this.chartId,
      seriesIndex,
      data,
      pointCount: newPoints.length,
      stride,
    }, [data]);
  }
  
  resize(): void {
    if (this.isDisposed) {
      return; // Silent no-op for disposed charts
    }
    
    // Get current canvas dimensions from container
    const canvas = this.container.querySelector('canvas');
    if (!canvas) {
      console.warn('ChartGPUWorkerProxy.resize(): Canvas not found in container');
      return;
    }
    
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    
    this.sendMessage({
      type: 'resize',
      chartId: this.chartId,
      width,
      height,
      devicePixelRatio: dpr,
      requestRender: true,
    });
  }
  
  dispose(): void {
    if (this.isDisposed) {
      return; // Already disposed
    }
    
    this.isDisposed = true;
    
    // Clean up event listeners FIRST to stop event flow
    this.cleanupEventListeners();
    
    // Clean up resize monitoring (ResizeObserver and DPR monitoring)
    this.cleanupResizeMonitoring();
    
    // Dispose overlays BEFORE worker disposal to prevent memory leaks
    this.disposeOverlays();
    
    // Send dispose message to worker
    this.sendMessage({
      type: 'dispose',
      chartId: this.chartId,
    });
    
    // Reject all pending requests
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new ChartGPUWorkerError(
        'Chart disposed before operation completed',
        'DISPOSED',
        pending.operation,
        this.chartId
      ));
    }
    this.pendingRequests.clear();
    
    // Clear all event listeners
    for (const listeners of this.listeners.values()) {
      listeners.clear();
    }
    
    // Remove worker message handler
    this.worker.removeEventListener('message', this.boundMessageHandler);
    
    // Remove canvas from container
    const canvas = this.container.querySelector('canvas');
    if (canvas) {
      canvas.remove();
    }
  }
  
  on(eventName: 'crosshairMove', callback: ChartGPUCrosshairMoveCallback): void;
  on(eventName: ChartGPUEventName, callback: ChartGPUEventCallback): void;
  on(eventName: ChartGPUEventName, callback: AnyChartGPUEventCallback): void {
    if (this.isDisposed) {
      return; // Silent no-op for disposed charts
    }
    
    const listeners = this.listeners.get(eventName);
    if (listeners) {
      listeners.add(callback);
    }
  }
  
  off(eventName: 'crosshairMove', callback: ChartGPUCrosshairMoveCallback): void;
  off(eventName: ChartGPUEventName, callback: ChartGPUEventCallback): void;
  off(eventName: ChartGPUEventName, callback: AnyChartGPUEventCallback): void {
    const listeners = this.listeners.get(eventName);
    if (listeners) {
      listeners.delete(callback);
    }
  }
  
  getInteractionX(): number | null {
    if (this.isDisposed) {
      return null;
    }
    return this.cachedInteractionX;
  }
  
  setInteractionX(x: number | null, source?: unknown): void {
    if (this.isDisposed) {
      return; // Silent no-op for disposed charts
    }
    
    this.cachedInteractionX = x;
    
    this.sendMessage({
      type: 'setInteractionX',
      chartId: this.chartId,
      x,
      source: source as string | undefined,
    });
  }
  
  setCrosshairX(x: number | null, source?: unknown): void {
    // Alias for setInteractionX
    this.setInteractionX(x, source);
  }
  
  onInteractionXChange(callback: (x: number | null, source?: unknown) => void): () => void {
    // Subscribe to crosshairMove events
    const wrappedCallback = (payload: ChartGPUCrosshairMovePayload) => {
      callback(payload.x, payload.source);
    };
    
    this.on('crosshairMove', wrappedCallback as ChartGPUCrosshairMoveCallback);
    
    // Return unsubscribe function
    return () => {
      this.off('crosshairMove', wrappedCallback as ChartGPUCrosshairMoveCallback);
    };
  }
  
  getZoomRange(): Readonly<{ start: number; end: number }> | null {
    if (this.isDisposed) {
      return null;
    }
    return this.cachedZoomRange;
  }
  
  setZoomRange(start: number, end: number): void {
    if (this.isDisposed) {
      return; // Silent no-op for disposed charts
    }
    
    // Validate zoom range (percent space [0, 100])
    if (start < 0 || start > 100 || end < 0 || end > 100) {
      throw new ChartGPUWorkerError(
        `Invalid zoom range: [${start}, ${end}]. Values must be in [0, 100] (percent space).`,
        'INVALID_ARGUMENT',
        'setZoomRange',
        this.chartId
      );
    }
    if (start >= end) {
      throw new ChartGPUWorkerError(
        `Invalid zoom range: start (${start}) must be less than end (${end}).`,
        'INVALID_ARGUMENT',
        'setZoomRange',
        this.chartId
      );
    }
    
    this.cachedZoomRange = { start, end };
    
    this.sendMessage({
      type: 'setZoomRange',
      chartId: this.chartId,
      start,
      end,
    });
  }
  
  // =============================================================================
  // Worker Communication
  // =============================================================================
  
  /**
   * Sends a message to the worker without expecting a response.
   * 
   * @param message - Message to send
   * @param transfer - Optional transferable objects
   */
  private sendMessage(message: WorkerInboundMessage, transfer?: Transferable[]): void {
    if (this.isDisposed) {
      return; // Silent no-op for disposed charts
    }
    
    try {
      if (transfer && transfer.length > 0) {
        this.worker.postMessage(message, transfer);
      } else {
        this.worker.postMessage(message);
      }
    } catch (error) {
      throw new ChartGPUWorkerError(
        `Failed to send message to worker: ${error instanceof Error ? error.message : String(error)}`,
        'COMMUNICATION_ERROR',
        message.type,
        this.chartId
      );
    }
  }
  
  /**
   * Sends a message to the worker and waits for a response.
   * 
   * @param message - Message to send (must have messageId)
   * @param transfer - Optional transferable objects
   * @returns Promise that resolves with the response
   */
  private sendMessageWithResponse<T extends WorkerOutboundMessage>(
    message: WorkerInboundMessage & { messageId: string },
    transfer?: Transferable[]
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const { messageId } = message;
      
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(messageId);
        reject(new ChartGPUWorkerError(
          `Operation timed out after ${this.messageTimeout}ms`,
          'TIMEOUT',
          message.type,
          this.chartId
        ));
      }, this.messageTimeout);
      
      // Track pending request
      this.pendingRequests.set(messageId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
        operation: message.type,
      });
      
      // Send message
      try {
        this.sendMessage(message, transfer);
      } catch (error) {
        // Clean up pending request on send failure
        clearTimeout(timeout);
        this.pendingRequests.delete(messageId);
        reject(error);
      }
    });
  }
  
  /**
   * Handles incoming messages from the worker.
   * Routes messages to appropriate handlers based on type.
   * 
   * @param event - Message event from worker
   */
  private handleWorkerMessage(event: MessageEvent): void {
    const message = event.data as WorkerOutboundMessage;
    
    // Ignore messages for other chart instances
    if (message.chartId !== this.chartId) {
      return;
    }
    
    // Handle message based on type
    switch (message.type) {
      case 'ready':
        this.handleReadyMessage(message);
        break;
      
      case 'rendered':
        // No-op: rendered messages are informational only
        break;
      
      case 'tooltipUpdate':
        this.handleTooltipUpdateMessage(message);
        break;
      
      case 'legendUpdate':
        this.handleLegendUpdateMessage(message);
        break;
      
      case 'axisLabelsUpdate':
        this.handleAxisLabelsUpdateMessage(message);
        break;
      
      case 'hoverChange':
        this.handleHoverChangeMessage(message);
        break;
      
      case 'click':
        this.handleClickMessage(message);
        break;
      
      case 'crosshairMove':
        this.handleCrosshairMoveMessage(message);
        break;
      
      case 'zoomChange':
        this.handleZoomChangeMessage(message);
        break;
      
      case 'deviceLost':
        this.handleDeviceLostMessage(message);
        break;
      
      case 'disposed':
        // Worker confirmed disposal - already handled locally
        break;
      
      case 'error':
        this.handleErrorMessage(message);
        break;
      
      default:
        // Exhaustive type check
        const exhaustive: never = message;
        console.warn('ChartGPUWorkerProxy: Unknown message type:', (exhaustive as any).type);
    }
  }
  
  /**
   * Handles ready message from worker.
   * Resolves the pending init request.
   */
  private handleReadyMessage(message: ReadyMessage): void {
    const pending = this.pendingRequests.get(message.messageId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(message.messageId);
      pending.resolve(message);
    }
  }
  
  /**
   * Handles hover change messages from worker.
   * Emits mouseover/mouseout events to registered listeners.
   */
  private handleHoverChangeMessage(message: import('./protocol').HoverChangeMessage): void {
    if (message.payload) {
      // Hover entered
      const payload: ChartGPUEventPayload = {
        seriesIndex: message.payload.seriesIndex,
        dataIndex: message.payload.dataIndex,
        value: message.payload.value as readonly [number, number],
        seriesName: null, // Worker doesn't send series name
        event: this.createSyntheticPointerEvent(message.payload.x, message.payload.y),
      };
      this.emit('mouseover', payload);
    } else {
      // Hover cleared
      const payload: ChartGPUEventPayload = {
        seriesIndex: null,
        dataIndex: null,
        value: null,
        seriesName: null,
        event: this.createSyntheticPointerEvent(0, 0),
      };
      this.emit('mouseout', payload);
    }
  }
  
  /**
   * Handles click messages from worker.
   * Emits click events to registered listeners.
   */
  private handleClickMessage(message: import('./protocol').ClickMessage): void {
    const payload: ChartGPUEventPayload = {
      seriesIndex: message.payload.seriesIndex,
      dataIndex: message.payload.dataIndex,
      value: message.payload.value as readonly [number, number],
      seriesName: null, // Worker doesn't send series name
      event: this.createSyntheticPointerEvent(message.payload.x, message.payload.y),
    };
    this.emit('click', payload);
  }
  
  /**
   * Handles crosshair move messages from worker.
   * Updates cached interaction X and emits crosshairMove events.
   */
  private handleCrosshairMoveMessage(message: import('./protocol').CrosshairMoveMessage): void {
    this.cachedInteractionX = message.x;
    
    const payload: ChartGPUCrosshairMovePayload = {
      x: message.x,
      source: message.source,
    };
    this.emit('crosshairMove', payload);
  }
  
  /**
   * Handles zoom change messages from worker.
   * Updates cached zoom range and zoom state.
   * 
   * NOTE: This manages echo loop prevention. The onChange callback in createOverlays()
   * forwards changes to the worker, but here we're receiving changes FROM the worker.
   * By checking if values differ before calling setRange, we prevent redundant updates.
   * ZoomState internally suppresses onChange when values are identical, providing
   * defense-in-depth against floating point precision issues.
   */
  private handleZoomChangeMessage(message: import('./protocol').ZoomChangeMessage): void {
    this.cachedZoomRange = { start: message.start, end: message.end };
    
    // Update zoom state if slider exists
    if (this.zoomState) {
      const currentRange = this.zoomState.getRange();
      
      // Only call setRange if values actually changed (prevents redundant worker messages)
      // setRange will trigger onChange, which sends message to worker, but worker's
      // internal state checking prevents infinite loops
      if (currentRange.start !== message.start || currentRange.end !== message.end) {
        this.zoomState.setRange(message.start, message.end);
      }
    }
  }
  
  /**
   * Handles device lost messages from worker.
   * Marks chart as disposed and cleans up resources.
   */
  private handleDeviceLostMessage(message: import('./protocol').DeviceLostMessage): void {
    console.error(
      `ChartGPU: WebGPU device lost for chart "${this.chartId}".`,
      `Reason: ${message.reason}`,
      message.message ? `Message: ${message.message}` : ''
    );
    
    // Device loss is terminal - dispose the chart
    this.dispose();
  }
  
  /**
   * Handles error messages from worker.
   * Rejects pending requests or logs errors.
   */
  private handleErrorMessage(message: import('./protocol').ErrorMessage): void {
    const error = new ChartGPUWorkerError(
      message.message,
      message.code,
      message.operation,
      this.chartId
    );
    
    // If this error is correlated with a pending request, reject it
    if (message.messageId) {
      const pending = this.pendingRequests.get(message.messageId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.messageId);
        pending.reject(error);
        return;
      }
    }
    
    // Otherwise, log the error
    console.error('ChartGPUWorkerProxy: Worker error:', error);
  }
  
  /**
   * Handles tooltip update messages from worker.
   * Batches updates via RAF to prevent layout thrashing.
   */
  private handleTooltipUpdateMessage(message: TooltipUpdateMessage): void {
    this.pendingOverlayUpdates.tooltip = message;
    this.scheduleOverlayUpdates();
  }
  
  /**
   * Handles legend update messages from worker.
   * Batches updates via RAF to prevent layout thrashing.
   */
  private handleLegendUpdateMessage(message: LegendUpdateMessage): void {
    this.pendingOverlayUpdates.legend = message;
    this.scheduleOverlayUpdates();
  }
  
  /**
   * Handles axis labels update messages from worker.
   * Batches updates via RAF to prevent layout thrashing.
   */
  private handleAxisLabelsUpdateMessage(message: AxisLabelsUpdateMessage): void {
    this.pendingOverlayUpdates.axisLabels = message;
    this.scheduleOverlayUpdates();
  }
  
  /**
   * Emits an event to all registered listeners.
   * 
   * @param eventName - Event name
   * @param payload - Event payload
   */
  private emit(
    eventName: ChartGPUEventName,
    payload: ChartGPUEventPayload | ChartGPUCrosshairMovePayload
  ): void {
    const listeners = this.listeners.get(eventName);
    if (!listeners) return;
    
    for (const callback of listeners) {
      try {
        (callback as (p: typeof payload) => void)(payload);
      } catch (error) {
        console.error(`Error in ${eventName} event handler:`, error);
      }
    }
  }
  
  /**
   * Creates a synthetic PointerEvent for event payloads.
   * Worker can't transfer real PointerEvents, so we create a minimal synthetic one.
   * 
   * @param x - Canvas-local CSS pixel x coordinate
   * @param y - Canvas-local CSS pixel y coordinate
   * @returns Synthetic PointerEvent
   */
  private createSyntheticPointerEvent(x: number, y: number): PointerEvent {
    // Create a minimal synthetic PointerEvent
    // This is necessary because worker can't transfer real PointerEvents
    const canvas = this.container.querySelector('canvas');
    const rect = canvas?.getBoundingClientRect() || { left: 0, top: 0 };
    
    return new PointerEvent('pointermove', {
      bubbles: false,
      cancelable: false,
      clientX: rect.left + x,
      clientY: rect.top + y,
      pointerId: -1, // Synthetic event marker
      pointerType: 'mouse',
      isPrimary: true,
    });
  }
}
