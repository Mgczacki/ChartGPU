# Worker Thread Integration Guide

## Overview

This document explains how to use the ChartGPU render coordinator in a web worker thread for improved performance and responsiveness in demanding applications. The feature separates DOM-dependent UI overlays (tooltips, legends, axis labels) from the core GPU rendering pipeline, enabling the renderer to run entirely in a worker thread while the main thread handles DOM updates.

**Target audience**: Contributors implementing worker-based architectures, advanced users optimizing high-frequency data streaming applications.

## Why Worker Thread Support?

### Performance Benefits

1. **Parallel execution**: Render computations run on a separate thread, preventing main thread blocking during intensive operations
2. **Reduced jank**: User interactions (scrolling, clicks) remain responsive during heavy rendering
3. **OffscreenCanvas rendering**: GPU operations execute in worker context without main thread synchronization

### Use Cases

- **High-frequency streaming**: Financial tickers, IoT sensor data, real-time monitoring
- **Large datasets**: Million-point charts with continuous updates
- **Complex multi-chart dashboards**: Multiple independent renderers in separate workers

## Architecture Pattern

```
┌─────────────────────────────────┐           ┌──────────────────────────────┐
│         Main Thread             │           │        Worker Thread         │
│  (DOM, User Interaction)        │           │   (GPU Rendering Only)       │
├─────────────────────────────────┤           ├──────────────────────────────┤
│                                 │           │                              │
│  1. Create OffscreenCanvas      │           │                              │
│     from HTMLCanvasElement      │           │                              │
│                                 │           │                              │
│  2. Transfer to worker          │ ────────▶ │  3. createRenderCoordinator  │
│     via postMessage             │           │     (with OffscreenCanvas)   │
│                                 │           │                              │
│  4. Capture DOM pointer events  │           │                              │
│     - pointerdown               │           │                              │
│     - pointermove               │ ────────▶ │  5. handlePointerEvent()     │
│     - pointerup                 │  (events) │     (normalized)             │
│     - pointerleave              │           │                              │
│                                 │           │                              │
│  7. Render overlays to DOM      │ ◀──────── │  6. Emit callbacks           │
│     - createTooltip()           │  (data)   │     - onTooltipUpdate        │
│     - createLegend()            │           │     - onLegendUpdate         │
│     - createTextOverlay()       │           │     - onAxisLabelsUpdate     │
│                                 │           │     - onHoverChange          │
│                                 │           │     - onCrosshairMove        │
│                                 │           │                              │
│  9. Handle device loss          │ ◀──────── │  8. onDeviceLost callback    │
│     - Notify user               │           │                              │
│     - Recreate worker/context   │           │                              │
│                                 │           │                              │
└─────────────────────────────────┘           └──────────────────────────────┘
```

## Overview Updates

**Note**: This document is designed for contributors implementing custom worker-based architectures. For most users, the built-in `ChartGPU.createInWorker()` API (documented in [`WORKER_ARCHITECTURE.md`](./WORKER_ARCHITECTURE.md)) handles all worker thread details automatically, including initialization race condition prevention and performance metrics tracking.

## Configuration

### `domOverlays` Option

The `RenderCoordinatorCallbacks.domOverlays` option controls overlay behavior:

```typescript
const coordinator = createRenderCoordinator(gpuContext, options, {
  domOverlays: false, // Disable DOM overlays, enable callbacks
  onTooltipUpdate: (data) => { /* render tooltip in main thread */ },
  onLegendUpdate: (items) => { /* render legend in main thread */ },
  // ... other callbacks
});
```

**Default**: `true` (backward compatible - DOM overlays enabled)

**When `domOverlays: false`**:
- No DOM components created (tooltip, legend, text overlay, event manager)
- Callbacks emit data instead of rendering to DOM
- `handlePointerEvent()` method becomes available for external event forwarding
- Compatible with OffscreenCanvas in worker threads

**When `domOverlays: true` (default)**:
- DOM components created automatically (requires `HTMLCanvasElement`)
- Native DOM event listeners attached to canvas
- Overlays positioned absolutely within canvas parent element
- `handlePointerEvent()` calls are ignored (DOM events take precedence)
- Not compatible with OffscreenCanvas (DOM access required)

**Source**: [`src/core/createRenderCoordinator.ts`](../../src/core/createRenderCoordinator.ts) lines 1250-1253, 1583-1587

### Type Definitions

Key types for worker thread integration are defined in [`src/config/types.ts`](../../src/config/types.ts):

- `TooltipData` (lines 270-281): Tooltip content, params, and position
- `LegendItem` (lines 283-290): Legend item with name, color, and series index
- `AxisLabel` (lines 292-304): Axis label with text, position, and rotation
- `NormalizedPointerEvent` (lines 307-319): Canvas-local pointer event for worker forwarding
- `RenderCoordinatorCallbacks` (in `createRenderCoordinator.ts` lines 129-167): Callback interface

## Event Forwarding

### Main Thread: Capture and Normalize Events

The main thread must capture DOM pointer events and normalize them to canvas-local coordinates before posting to the worker:

```typescript
// Main thread
const canvas = document.getElementById('chart') as HTMLCanvasElement;
const offscreen = canvas.transferControlToOffscreen();

// Send offscreen canvas to worker
worker.postMessage({ type: 'init', canvas: offscreen }, [offscreen]);

// Capture and forward pointer events
canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const normalized: NormalizedPointerEvent = {
    type: 'pointermove',
    x: e.clientX - rect.left, // Canvas-local CSS pixels
    y: e.clientY - rect.top,
    buttons: e.buttons,
    timestamp: e.timeStamp,
  };
  worker.postMessage({ type: 'pointer', event: normalized });
});

// Repeat for pointerdown, pointerup, pointerleave
```

**Critical**: Event coordinates must be canvas-local CSS pixels, not page-global coordinates. Use `getBoundingClientRect()` to compute offsets.

### Worker Thread: Forward to Coordinator

The worker receives normalized events and forwards them to `handlePointerEvent()`:

```typescript
// Worker thread
let coordinator: RenderCoordinator | null = null;

self.addEventListener('message', (e) => {
  if (e.data.type === 'init') {
    const gpuContext = createGPUContext(e.data.canvas);
    coordinator = createRenderCoordinator(gpuContext, options, {
      domOverlays: false,
      // ... callbacks
    });
  }
  
  if (e.data.type === 'pointer' && coordinator) {
    coordinator.handlePointerEvent(e.data.event);
    coordinator.render(); // Trigger re-render for interaction updates
  }
});
```

**Source**: [`src/core/createRenderCoordinator.ts`](../../src/core/createRenderCoordinator.ts) lines 3569-3632 (`handlePointerEvent` implementation)

### Coordinate Validation

The `handlePointerEvent()` implementation validates coordinates to guard against serialization issues:

- Rejects `NaN` or `Infinity` values (lines 3579-3582)
- Clamps coordinates to canvas bounds
- Normalizes to grid-local coordinates for hit testing

**Safety**: Invalid events are silently ignored to prevent crashes from malformed worker messages.

## Callback Handling

### Tooltip Updates

**Signature**: `onTooltipUpdate?: (data: TooltipData | null) => void`

**When called**:
- On pointer move (when hovering over data points)
- On pointer leave (data = `null` to hide tooltip)
- On data updates (tooltip may need repositioning)

**Parameters**:
```typescript
interface TooltipData {
  readonly content: string;          // Formatted HTML content
  readonly params: TooltipParams[];  // Array for consistency (single-item or multi-item)
  readonly x: number;                // Canvas-local CSS pixel X
  readonly y: number;                // Canvas-local CSS pixel Y
}
```

**Main thread handling**:
```typescript
onTooltipUpdate: (data) => {
  if (!data) {
    tooltip.style.display = 'none';
    return;
  }
  tooltip.innerHTML = data.content;
  tooltip.style.left = `${data.x}px`;
  tooltip.style.top = `${data.y}px`;
  tooltip.style.display = 'block';
}
```

**Source**: [`src/core/createRenderCoordinator.ts`](../../src/core/createRenderCoordinator.ts) lines 1523-1536

### Legend Updates

**Signature**: `onLegendUpdate?: (items: ReadonlyArray<LegendItem>) => void`

**When called**:
- On `setOptions()` when series configuration changes
- During initialization

**Parameters**:
```typescript
interface LegendItem {
  readonly name: string;
  readonly color: string;
  readonly seriesIndex: number;
}
```

**Main thread handling**:
```typescript
onLegendUpdate: (items) => {
  legendContainer.innerHTML = '';
  items.forEach((item) => {
    const div = document.createElement('div');
    div.innerHTML = `
      <span style="background: ${item.color}; width: 12px; height: 12px; display: inline-block;"></span>
      ${item.name}
    `;
    legendContainer.appendChild(div);
  });
}
```

**Source**: [`src/core/createRenderCoordinator.ts`](../../src/core/createRenderCoordinator.ts) lines 1557-1567

### Axis Label Updates

**Signature**: `onAxisLabelsUpdate?: (xLabels: ReadonlyArray<AxisLabel>, yLabels: ReadonlyArray<AxisLabel>) => void`

**When called**:
- On every render (labels may change with zoom/pan)
- When axis configuration changes

**Parameters**:
```typescript
interface AxisLabel {
  readonly axis: 'x' | 'y';
  readonly text: string;
  readonly position: number;  // CSS pixels from canvas edge
  readonly rotation?: number; // Degrees, for rotated x-axis labels
  readonly isTitle?: boolean; // True for axis title vs tick label
}
```

**Main thread handling**:
```typescript
onAxisLabelsUpdate: (xLabels, yLabels) => {
  overlayContainer.innerHTML = '';
  
  xLabels.forEach((label) => {
    const span = document.createElement('span');
    span.textContent = label.text;
    span.style.position = 'absolute';
    span.style.left = `${label.position}px`;
    span.style.bottom = '0';
    if (label.rotation) {
      span.style.transform = `rotate(${label.rotation}deg)`;
    }
    overlayContainer.appendChild(span);
  });
  
  // Similar for yLabels
}
```

**Source**: [`src/core/createRenderCoordinator.ts`](../../src/core/createRenderCoordinator.ts) lines 3563-3565

### Hover State Changes

**Signature**: `onHoverChange?: (payload: ChartGPUEventPayload | null) => void`

**When called**:
- When hovering over a data point (payload != `null`)
- When leaving hover area (payload = `null`)

**Use case**: Custom highlighting, external UI updates, analytics tracking

**Source**: [`src/core/createRenderCoordinator.ts`](../../src/core/createRenderCoordinator.ts) lines 1551-1555

### Crosshair Movement

**Signature**: `onCrosshairMove?: (x: number | null) => void`

**When called**:
- On pointer move within grid area (x = canvas-local CSS pixel X coordinate)
- On pointer leave (x = `null` to hide crosshair)

**Use case**: Synchronized crosshairs across multiple charts, external cursor tracking

**Source**: [`src/core/createRenderCoordinator.ts`](../../src/core/createRenderCoordinator.ts) lines 1545-1549

## Device Loss Handling

### GPU Device Loss

WebGPU devices can be lost due to:
- Driver crashes or updates
- GPU reset (OS-level timeout recovery)
- System sleep/wake cycles
- Browser resource limits

### `onDeviceLost` Callback

**Signature**: `onDeviceLost?: (reason: string) => void`

**When called**:
- When `device.lost` promise resolves (device is permanently lost)
- Coordinator becomes non-functional after this callback

**Worker thread behavior**:
```typescript
device.lost.then((info) => {
  callbacks?.onDeviceLost?.(info.message || info.reason || 'unknown');
}).catch(() => {
  // Ignore errors in device.lost promise
});
```

**Main thread handling**:
```typescript
onDeviceLost: (reason) => {
  console.error('GPU device lost:', reason);
  
  // Option 1: Notify user and request page reload
  alert('Graphics device lost. Please reload the page.');
  
  // Option 2: Recreate worker and coordinator
  worker.terminate();
  worker = new Worker('chart-worker.js');
  // ... re-initialize
}
```

**Important**: Do NOT call `coordinator.dispose()` after device loss. The coordinator is already non-functional and disposed resources may cause errors. Simply terminate the worker and recreate if needed.

**Source**: [`src/core/createRenderCoordinator.ts`](../../src/core/createRenderCoordinator.ts) lines 1242-1246

## Implementation Checklist

### Worker Thread Setup

- [ ] Create OffscreenCanvas from HTMLCanvasElement via `transferControlToOffscreen()`
- [ ] Transfer canvas to worker with `postMessage(canvas, [canvas])`
- [ ] Initialize GPUContext with OffscreenCanvas in worker
- [ ] Create render coordinator with `domOverlays: false`
- [ ] Initialize performance tracking state (frame timestamps, counters)
- [ ] Implement all required callbacks (tooltip, legend, axis labels)
- [ ] Set up message handler for pointer events
- [ ] Set up message handler for data updates
- [ ] Send ReadyMessage with performance capabilities after initialization
- [ ] Implement device loss recovery strategy

### Main Thread Setup

- [ ] Create HTMLCanvasElement and append to container
- [ ] Transfer control to offscreen canvas
- [ ] Attach pointer event listeners to original canvas element
- [ ] Normalize event coordinates to canvas-local CSS pixels
- [ ] **CRITICAL:** Implement `isInitialized` flag to prevent premature event forwarding
- [ ] Post normalized events to worker **ONLY if isInitialized === true**
- [ ] Create DOM elements for tooltip, legend, and axis labels
- [ ] Implement callback message handlers
- [ ] Wait for ReadyMessage and set `isInitialized = true` on receipt
- [ ] Cache performance capabilities from ReadyMessage
- [ ] Implement performance update handler for streaming metrics
- [ ] Handle device loss notifications

### Testing

- [ ] Test pointer events (hover, click, drag)
- [ ] Test tooltip positioning at canvas edges
- [ ] Test legend updates on series changes
- [ ] Test axis labels with zoom/pan
- [ ] Test device loss recovery (simulate via DevTools)
- [ ] Test worker termination and cleanup
- [ ] Test high-frequency data updates
- [ ] Profile performance vs main thread rendering

## Race Condition Prevention

### Initialization Race Condition

**Issue**: Events forwarded to worker before initialization completes cause errors.

**Problem scenario:**
1. Main thread creates OffscreenCanvas and sends InitMessage
2. User interaction triggers pointer event before worker responds
3. Main thread forwards event to worker
4. Worker receives event before ReadyMessage sent
5. Worker attempts to process event with uninitialized coordinator → crash

**Solution**: `isInitialized` flag pattern

**Implementation:**
```typescript
// Main thread proxy
class ChartGPUWorkerProxy {
  private isInitialized = false;
  
  async init() {
    // Send InitMessage
    worker.postMessage({ type: 'init', canvas, ... }, [canvas]);
    
    // Wait for ReadyMessage
    await this.waitForReady();
    
    // CRITICAL: Set flag only after worker is ready
    this.isInitialized = true;
  }
  
  private handlePointerEvent(event: PointerEvent) {
    // Guard against premature forwarding
    if (!this.isInitialized) {
      return; // Silently drop event
    }
    
    // Safe to forward - worker is ready
    this.forwardEventToWorker(event);
  }
}
```

**Why silent drop instead of error:**
- User interactions during initialization are common (e.g., hover while loading)
- Events during initialization are not critical (worker will be ready soon)
- Silent drop prevents console noise and doesn't block rendering
- Once `isInitialized = true`, all events are processed normally

**Built-in support:** [`ChartGPUWorkerProxy`](../../src/worker/ChartGPUWorkerProxy.ts) implements this pattern automatically. Custom implementations must implement similar protection.

**Source:** See [`ChartGPUWorkerProxy.init()`](../../src/worker/ChartGPUWorkerProxy.ts) and event forwarding methods

## Edge Cases and Safety

### 1. Canvas Coordinate Systems

**Issue**: OffscreenCanvas uses device pixels, DOM uses CSS pixels.

**Handling**: ✅ Coordinator internally handles DPR conversions (lines 65-84)
- `getCanvasCssWidth()` divides OffscreenCanvas width by DPR
- `getCanvasCssHeight()` does the same for height
- All coordinates passed to callbacks are CSS pixels

**No changes needed** - internal implementation handles this correctly.

### 2. Text Measurement in Workers

**Issue**: DOM APIs like `CanvasRenderingContext2D.measureText()` unavailable in workers.

**Handling**: ✅ Graceful fallback (lines 1257-1268)
- `tickMeasureCtx` is `null` in worker threads
- Axis label measurement uses fallback heuristics
- Labels may be less precise but still functional

**Recommendation**: For pixel-perfect labels, consider passing pre-measured label widths from main thread.

### 3. Event Serialization

**Issue**: Structured cloning may introduce precision errors or `NaN` values.

**Handling**: ✅ Input validation in `handlePointerEvent()` (lines 3579-3582)
- Rejects non-finite coordinates
- Early return prevents crashes

**No changes needed** - validation already present.

### 4. Tooltip HTML Security

**Issue**: Tooltip content uses `innerHTML`, which is XSS-vulnerable.

**Handling**: ⚠️ User responsibility
- Default formatter generates safe content
- Custom formatters must sanitize user data
- Consider using `textContent` or DOMPurify for untrusted data

**Documented** in API docs - not specific to worker threads.

### 5. Worker Lifecycle

**Issue**: Workers must be explicitly terminated to free resources.

**Handling**: ⚠️ User responsibility
- Call `worker.terminate()` when done
- Call `coordinator.dispose()` before terminating worker (if device not lost)
- Handle worker errors and restart if needed

**Recommendation**: Implement worker supervision pattern with automatic restart on crashes.

### 6. Memory Leaks in Callbacks

**Issue**: Callback closures may retain references to disposed DOM elements.

**Handling**: ⚠️ User responsibility
- Clear DOM element references when recreating overlays
- Use weak references where possible
- Remove event listeners on cleanup

**Recommendation**: Use a cleanup function to reset all callback handlers:

```typescript
function cleanupMainThread() {
  canvas.removeEventListener('pointermove', pointerMoveHandler);
  // ... remove other listeners
  tooltipElement.remove();
  legendElement.remove();
  overlayElement.remove();
}
```

### 7. High-Frequency Event Throttling

**Issue**: Sending every `pointermove` event to worker may saturate postMessage queue.

**Handling**: ⚠️ Optional optimization
- Consider throttling events with `requestAnimationFrame()`
- Batch multiple events into single message
- Use transferable objects for large data transfers

**Recommendation**: Profile message frequency before optimizing. Modern browsers handle high-frequency postMessage efficiently.

## Performance Considerations

### Benefits

1. **Main thread unblocked**: Render computations (vertex buffer uploads, shader execution) run in parallel
2. **Consistent frame timing**: Worker renders independently of main thread jank
3. **Reduced layout thrashing**: DOM updates batched via callbacks

### Trade-offs

1. **Message overhead**: ~1-2ms per event round-trip (depends on browser/OS)
2. **Memory overhead**: Duplicate data structures in worker memory
3. **Complexity**: Two-thread coordination increases debugging difficulty

### When to Use Workers

**Recommended**:
- High-frequency streaming (> 60 updates/sec)
- Large datasets (> 100K points)
- Heavy main thread load (complex UI, animations)
- Multi-chart dashboards (separate workers per chart)

**Not recommended**:
- Simple static charts
- Low update frequency (< 10 updates/sec)
- Small datasets (< 10K points)
- Memory-constrained devices (worker overhead may exceed benefits)

## Related Documentation

- [`src/core/createRenderCoordinator.ts`](../../src/core/createRenderCoordinator.ts) - Main implementation
- [`src/config/types.ts`](../../src/config/types.ts) - Type definitions for callbacks and events
- [`src/core/GPUContext.ts`](../../src/core/GPUContext.ts) - OffscreenCanvas support
- [INTERNALS.md](../api/INTERNALS.md) - Internal module architecture
- [Performance Guide](../performance.md) - General optimization tips

## Summary

The DOM overlay separation feature enables ChartGPU to run in web worker threads by:

1. ✅ **Canvas support**: Both HTMLCanvasElement and OffscreenCanvas supported
2. ✅ **Callback-based rendering**: DOM overlays replaced with data callbacks when `domOverlays: false`
3. ✅ **Event forwarding**: `handlePointerEvent()` accepts normalized events from main thread
4. ✅ **Device loss handling**: `onDeviceLost` callback enables recovery strategies
5. ✅ **Coordinate normalization**: All callbacks use canvas-local CSS pixels for consistency

**Key constraint**: When `domOverlays: false`, the coordinator expects external event forwarding via `handlePointerEvent()`. Native DOM event listeners are not attached.
