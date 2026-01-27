# Render Coordinator Summary

**⚠️ IMPORTANT FOR LLMs**: Use this summary instead of reading the full `createRenderCoordinator.ts` file (3852 lines). This document contains only the essential public interfaces and factory function signature needed for understanding the RenderCoordinator API.

For complete implementation details, see [`createRenderCoordinator.ts`](../../src/core/createRenderCoordinator.ts).

## Public Interfaces

### GPUContextLike

```typescript
export interface GPUContextLike {
  readonly device: GPUDevice | null;
  readonly canvas: SupportedCanvas | null;
  readonly canvasContext: GPUCanvasContext | null;
  readonly preferredFormat: GPUTextureFormat | null;
  readonly initialized: boolean;
  readonly devicePixelRatio?: number;
}
```

### RenderCoordinator

```typescript
export interface RenderCoordinator {
  setOptions(resolvedOptions: ResolvedChartGPUOptions): void;
  /**
   * Appends new points to a cartesian series' runtime data without requiring a full `setOptions(...)`
   * resolver pass.
   *
   * Appends are coalesced and flushed once per render frame.
   */
  appendData(seriesIndex: number, newPoints: ReadonlyArray<DataPoint> | ReadonlyArray<OHLCDataPoint>): void;
  /**
   * Gets the current "interaction x" in domain units (or `null` when inactive).
   *
   * This is derived from pointer movement inside the plot grid and can also be driven
   * externally via `setInteractionX(...)` (e.g. chart sync).
   */
  getInteractionX(): number | null;
  /**
   * Drives the chart's crosshair + tooltip from a domain-space x value.
   *
   * Passing `null` clears the interaction (hides crosshair/tooltip).
   */
  setInteractionX(x: number | null, source?: unknown): void;
  /**
   * Subscribes to interaction x changes (domain units).
   *
   * Returns an unsubscribe function.
   */
  onInteractionXChange(callback: (x: number | null, source?: unknown) => void): () => void;
  /**
   * Returns the current percent-space zoom window (or `null` when zoom is disabled).
   */
  getZoomRange(): Readonly<{ start: number; end: number }> | null;
  /**
   * Sets the percent-space zoom window.
   *
   * No-op when zoom is disabled.
   */
  setZoomRange(start: number, end: number): void;
  /**
   * Subscribes to zoom window changes (percent space).
   *
   * Returns an unsubscribe function.
   */
  onZoomRangeChange(cb: (range: Readonly<{ start: number; end: number }>) => void): () => void;
  /**
   * Accepts a pointer event with pre-computed grid coordinates for worker thread event forwarding.
   * Only available when domOverlays is false.
   */
  handlePointerEvent(event: PointerEventData): void;
  render(): void;
  dispose(): void;
}
```

### RenderCoordinatorCallbacks

```typescript
export type RenderCoordinatorCallbacks = Readonly<{
  /**
   * Optional hook for render-on-demand systems (like `ChartGPU`) to re-render when
   * interaction state changes (e.g. crosshair on pointer move).
   */
  readonly onRequestRender?: () => void;
  /**
   * When false, DOM overlays (tooltip, legend, text overlay, event manager) are disabled.
   * Instead, callbacks are used to emit data for external rendering.
   * Default: true (DOM overlays enabled).
   */
  readonly domOverlays?: boolean;
  /**
   * Called when tooltip data changes (only when domOverlays is false).
   * Receives tooltip data including content, params array, and position, or null when hidden.
   */
  readonly onTooltipUpdate?: (data: TooltipData | null) => void;
  /**
   * Called when legend items change (only when domOverlays is false).
   */
  readonly onLegendUpdate?: (items: ReadonlyArray<LegendItem>) => void;
  /**
   * Called when axis labels change (only when domOverlays is false).
   */
  readonly onAxisLabelsUpdate?: (xLabels: ReadonlyArray<AxisLabel>, yLabels: ReadonlyArray<AxisLabel>) => void;
  /**
   * Called when hover state changes (only when domOverlays is false).
   */
  readonly onHoverChange?: (payload: ChartGPUEventPayload | null) => void;
  /**
   * Called when crosshair moves (only when domOverlays is false).
   * Receives canvas-local CSS pixel x coordinate, or null when crosshair is hidden.
   */
  readonly onCrosshairMove?: (x: number | null) => void;
  /**
   * Called when user taps/clicks (only when domOverlays is false).
   * Includes hit test result with seriesIndex, dataIndex, and value.
   * Main thread is responsible for tap detection; worker thread performs hit testing.
   */
  readonly onClickData?: (payload: {
    readonly x: number;
    readonly y: number;
    readonly gridX: number;
    readonly gridY: number;
    readonly isInGrid: boolean;
    readonly nearest: NearestPointMatch | null;
    readonly pieSlice: PieSliceMatch | null;
    readonly candlestick: CandlestickMatch | null;
  }) => void;
  /**
   * Called when GPU device is lost.
   */
  readonly onDeviceLost?: (reason: string) => void;
}>;
```

## Factory Function

```typescript
export function createRenderCoordinator(
  gpuContext: GPUContextLike,
  options: ResolvedChartGPUOptions,
  callbacks?: RenderCoordinatorCallbacks
): RenderCoordinator
```

## Related Types

- `ResolvedChartGPUOptions`: See [`types.ts`](../../src/config/types.ts)
- `DataPoint`, `OHLCDataPoint`: See [`types.ts`](../../src/config/types.ts)
- `PointerEventData`: See [`types.ts`](../../src/config/types.ts)
- `TooltipData`, `LegendItem`, `AxisLabel`: See [`types.ts`](../../src/config/types.ts)
- `ChartGPUEventPayload`: See [`types.ts`](../../src/config/types.ts)
- `NearestPointMatch`, `PieSliceMatch`, `CandlestickMatch`: See [`types.ts`](../../src/config/types.ts)

## Documentation

For detailed documentation on RenderCoordinator usage, responsibilities, and worker thread support, see [INTERNALS.md](INTERNALS.md#render-coordinator-internal--contributor-notes).
