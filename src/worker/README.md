# ChartGPU Worker Protocol

Type-safe message passing protocol for ChartGPU worker thread support.

## Installation

```typescript
import {
  createInitMessage,
  createResizeMessage,
  getTransferables,
  type WorkerInboundMessage,
  type WorkerOutboundMessage,
} from 'chartgpu/worker';
```

## Quick Start

### Main Thread

```typescript
// Create worker
const worker = new Worker(new URL('./chart.worker.ts', import.meta.url), {
  type: 'module',
});

// Transfer canvas to worker
const canvas = htmlCanvas.transferControlToOffscreen();
const initMsg = createInitMessage(canvas, options, devicePixelRatio);
worker.postMessage(initMsg, getTransferables(initMsg));

// Handle responses
worker.onmessage = (e: MessageEvent<WorkerOutboundMessage>) => {
  switch (e.data.type) {
    case 'ready':
      console.log('Worker ready');
      break;
    case 'rendered':
      console.log(`Frame: ${e.data.frameTime}ms`);
      break;
    case 'error':
      console.error(e.data.message);
      break;
  }
};
```

### Worker Thread

```typescript
import type { WorkerInboundMessage } from 'chartgpu/worker';
import { createReadyMessage } from 'chartgpu/worker';

self.onmessage = (e: MessageEvent<WorkerInboundMessage>) => {
  switch (e.data.type) {
    case 'init':
      initializeChart(e.data.canvas, e.data.options);
      self.postMessage(createReadyMessage());
      break;
    // ... handle other messages
  }
};
```

## Features

- **Type-safe messaging** - Compile-time guarantees for all communication
- **Functional API** - Pure factory functions for message creation
- **Zero-copy transfers** - Efficient data transfer for large datasets
- **Exhaustive checking** - TypeScript ensures all message types are handled
- **Structured clone compatible** - All types are serializable
- **Optional correlation** - Request/response tracking when needed

## Message Types

### Inbound (Main → Worker)

- `init` - Initialize worker with canvas and options
- `setOption` - Update chart options
- `appendData` - Append data to series
- `resize` - Resize canvas
- `pointerEvent` - Forward pointer events
- `setZoomRange` - Set zoom range
- `setInteractionX` - Set interaction x-coordinate
- `dispose` - Dispose resources

### Outbound (Worker → Main)

- `ready` - Worker initialized
- `rendered` - Frame rendered
- `tooltip` - Tooltip data
- `legend` - Legend items
- `axisLabels` - Axis labels
- `hover` - Hover event
- `click` - Click event
- `crosshairMove` - Crosshair position
- `error` - Error occurred

## API Reference

### Factory Functions

Create type-safe messages:

```typescript
// Inbound
createInitMessage(canvas, options, devicePixelRatio)
createSetOptionMessage(options)
createAppendDataMessage(seriesIndex, data, transferOwnership?)
createResizeMessage(width, height, devicePixelRatio)
createPointerEventMessage(eventData)
createSetZoomRangeMessage(start, end)
createSetInteractionXMessage(x)
createDisposeMessage()

// Outbound
createReadyMessage()
createRenderedMessage(frameTime)
createTooltipMessage(data)
createLegendMessage(items)
createAxisLabelsMessage(labels)
createHoverMessage(payload)
createClickMessage(payload)
createCrosshairMoveMessage(x, y)
createErrorMessage(message, stack?)
```

### Type Guards

Optional helpers for type narrowing:

```typescript
isInitMessage(msg)
isSetOptionMessage(msg)
isAppendDataMessage(msg)
// ... one for each message type
```

### Utilities

```typescript
// Extract transferable objects
getTransferables(msg): Transferable[]

// Optional request/response correlation
createCorrelatedRequest(message, messageId?)
createCorrelatedResponse(message, requestId?)
```

## Examples

### Zero-Copy Data Transfer

```typescript
// Transfer large dataset without copying
const data = new Float32Array(1_000_000);
const msg = createAppendDataMessage(0, data, true); // Transfer ownership
worker.postMessage(msg, getTransferables(msg));
// data is now neutered and cannot be accessed
```

### Request/Response Correlation

```typescript
const msg = createResizeMessage(800, 600, 2);
const request = createCorrelatedRequest(msg);
worker.postMessage(request);

// Track request
pendingRequests.set(request.messageId, Date.now());

// Handle response
worker.onmessage = (e) => {
  if (e.data.requestId) {
    const startTime = pendingRequests.get(e.data.requestId);
    console.log(`Round-trip: ${Date.now() - startTime}ms`);
  }
};
```

### Type-Safe Message Handling

```typescript
function handleMessage(msg: WorkerInboundMessage) {
  switch (msg.type) {
    case 'init':
      // TypeScript knows msg is InitMessage
      initialize(msg.canvas, msg.options);
      break;
    case 'resize':
      // TypeScript knows msg is ResizeMessage
      resize(msg.width, msg.height);
      break;
    // TypeScript error if any case is missing
  }
}
```

## Documentation

- [Design Summary](./DESIGN_SUMMARY.md) - Quick reference for design decisions
- [Design Rationale](./DESIGN_RATIONALE.md) - Detailed explanations
- [Usage Examples](./example-usage.ts) - Complete code examples

## Type Safety

The protocol provides these compile-time guarantees:

- Exhaustive message handling (switch statements)
- Readonly immutability (cannot modify messages)
- Transfer safety (only valid transferables)
- Null safety (strict null checking)
- Type narrowing (automatic type refinement)
- Structured clone safety (only cloneable types)

## Performance

- **Zero-copy transfers** for datasets > 100KB
- **Structured cloning** for small messages
- **No runtime overhead** (types erased at compile time)
- **Tree-shakeable** (unused exports removed)
- **~5KB gzipped** for complete type system

## Browser Support

Requires Web Workers and OffscreenCanvas support:

- Chrome 69+
- Edge 79+
- Firefox 105+
- Safari 16.4+

## License

Part of ChartGPU. See [LICENSE](../../LICENSE) for details.
