# Internal / Contributor Documentation

This directory contains technical implementation documentation intended for contributors and maintainers of the ChartGPU library. These documents provide deep dives into implementation details, optimization strategies, and technical decisions.

## Contents

### GPU Buffer Management

- **[INCREMENTAL_APPEND_OPTIMIZATION.md](./INCREMENTAL_APPEND_OPTIMIZATION.md)** - Detailed guide on implementing incremental GPU buffer append optimization for streaming scenarios. Covers alignment requirements, buffer growth strategies, hash correctness, and when to use incremental appends vs. full re-uploads.

### Performance Profiling

- **[GPU_TIMING_IMPLEMENTATION.md](./GPU_TIMING_IMPLEMENTATION.md)** - GPU timing methodology used in the million-points benchmark. Explains the decision to use `queue.onSubmittedWorkDone()` for timing, what it measures, and how to interpret CPU vs GPU timing metrics.

### Worker Thread Architecture

- **[WORKER_ARCHITECTURE.md](./WORKER_ARCHITECTURE.md)** - Internal architecture documentation explaining why workers exist (main thread offloading), message protocol flow, render scheduling with MessageChannel (not requestAnimationFrame), device loss handling strategy, multi-chart support in a single worker, resource lifecycle, and performance metrics tracking. Essential reading for understanding the worker thread system design.

- **[WORKER_THREAD_INTEGRATION.md](./WORKER_THREAD_INTEGRATION.md)** - Comprehensive guide to running ChartGPU in web worker threads using OffscreenCanvas. Covers the `domOverlays` option, event forwarding with `handlePointerEvent()`, callback-based overlay rendering, device loss handling, worker lifecycle management, and race condition handling in proxy initialization. Includes architecture diagrams, implementation checklist, and performance considerations.

### Performance Monitoring

- **Performance Metrics System** - ChartGPU provides comprehensive real-time performance monitoring using exact FPS measurement with circular buffer timestamps. The system tracks frame timing, CPU/GPU time, memory usage, and frame drops. Available in both main thread and worker thread modes via `getPerformanceMetrics()`, `getPerformanceCapabilities()`, and `onPerformanceUpdate()` APIs on the `ChartGPUInstance` interface. See [`src/config/types.ts`](../../src/config/types.ts) for `PerformanceMetrics` and `PerformanceCapabilities` type definitions.

## Audience

These documents are intended for:

- **Contributors** implementing new features or optimizations
- **Maintainers** debugging performance issues
- **Advanced users** who need to understand internal implementation details

## Related Documentation

For end-user documentation, see:

- **[Getting Started Guide](../GETTING_STARTED.md)** - Quick start and first chart tutorial
- **[API Documentation](../api/README.md)** - Complete API reference
- **[Performance Guide](../performance.md)** - End-user performance optimization tips

For contributor documentation on architecture and internal APIs, see:

- **[INTERNALS.md](../api/INTERNALS.md)** - Internal modules and contributor notes
- **[CONTRIBUTING.md](../../CONTRIBUTING.md)** - Contributing guidelines
- **[CLAUDE.md](../../CLAUDE.md)** - Architecture and coding standards

## Contributing

If you're adding new technical implementation documentation, place it in this directory if it:

- Describes low-level implementation details
- Covers optimization strategies and trade-offs
- Explains technical decisions and rationale
- Requires deep knowledge of WebGPU or graphics programming
- Is primarily useful to contributors rather than end users

For documentation that serves end users (guides, tutorials, API reference), place it in the main `docs/` directory instead.
