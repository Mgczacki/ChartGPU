# ChartGPU

A GPU-accelerated charting library built with WebGPU for high-performance data visualization in the browser.

## Overview

ChartGPU leverages WebGPU to provide hardware-accelerated rendering for complex charts and data visualizations. Built with TypeScript and following WebGPU best practices, it offers a clean API for creating performant, interactive charts.

## Features

- **WebGPU-Powered**: Hardware-accelerated rendering using modern GPU APIs
- **TypeScript**: Full type safety and excellent IDE support
- **High Performance**: Optimized for rendering large datasets
- **Browser Support**: Works in Chrome 113+, Edge 113+, and Safari 18+

## Installation

```bash
npm install chartgpu
```

## Quick Start

Import `GPUContext` and call `GPUContext.create()` to initialize a GPU context. Access the device through the `device` property. Always call `destroy()` when finished.

See [GPUContext implementation](src/core/GPUContext.ts) for details.

## Browser Compatibility

WebGPU is required for ChartGPU to function. Supported browsers:

- **Chrome/Edge**: 113+ (WebGPU enabled by default)
- **Safari**: 18+ (WebGPU enabled by default)
- **Firefox**: Not yet supported (WebGPU support in development)

If WebGPU is not available, `GPUContext.create()` will throw a descriptive error with guidance on enabling WebGPU or using a supported browser.

## API Reference

### GPUContext

The `GPUContext` class manages WebGPU adapter and device initialization.

See [GPUContext.ts](src/core/GPUContext.ts) for the complete implementation.

**Static Methods:**
- `GPUContext.create()` - Creates and initializes a new GPUContext instance. Returns a Promise that resolves to a fully initialized instance. Throws Error if WebGPU is unavailable or initialization fails.

**Properties:**
- `adapter` - Returns the WebGPU adapter instance, or `null` if not initialized
- `device` - Returns the WebGPU device instance, or `null` if not initialized  
- `initialized` - Returns `true` if the context has been initialized, `false` otherwise

**Instance Methods:**
- `initialize()` - Initializes the WebGPU context. Throws Error if WebGPU is unavailable, adapter/device request fails, or context is already initialized
- `getCanvasTexture()` - Gets the current texture from the canvas context
- `clearScreen(r, g, b, a)` - Clears the canvas to a solid color using a WebGPU render pass. Color components must be in the range [0.0, 1.0]
- `destroy()` - Destroys the WebGPU device and cleans up resources

For detailed API documentation, see [API.md](docs/API.md).

## Development

### Prerequisites

- Node.js 18+
- npm or yarn
- A WebGPU-compatible browser

### Building

Run `npm run build` to compile TypeScript and build the library.

### Development Mode

Run `npm run dev` to start the development server. Navigate to `http://localhost:5176/examples/index.html` to view the examples.

## Examples

See the [examples directory](examples/) for complete working examples. The `hello-world` example demonstrates continuous rendering by animating the clear color through the full color spectrum.

See [hello-world/main.ts](examples/hello-world/main.ts) for implementation.

## License

MIT

## Contributing

Contributions are welcome! Please ensure all code follows the project's TypeScript and WebGPU best practices.
