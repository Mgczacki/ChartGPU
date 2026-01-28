/**
 * ChartGPU Performance Benchmark
 * 
 * Hardcore benchmark showcasing exact FPS measurement and unlimited configurability.
 * 
 * Features:
 * - Exact FPS tracking using performance API
 * - Worker vs Main thread rendering comparison
 * - Unlimited point count (billions if system allows)
 * - Real-time frame time visualization
 * - Comprehensive performance metrics
 * - Configurable data types (line, scatter, bar, candlestick)
 * - Streaming mode with rate control
 */

import { ChartGPU } from '../../src/index';
import type { 
  ChartGPUInstance, 
  ChartGPUOptions, 
  DataPoint, 
  OHLCDataPoint,
  PerformanceMetrics 
} from '../../src/index';

// ============================================================================
// Constants
// ============================================================================

const FRAME_BUFFER_SIZE = 120; // Last 120 frames (2 seconds at 60fps)
const EXPECTED_FRAME_TIME_MS = 1000 / 60; // 16.67ms at 60fps
const FRAME_TIME_SLOW_THRESHOLD = 33; // Yellow warning threshold
const FPS_SMOOTH_THRESHOLD = 55; // Green = >55fps
const FPS_MEDIUM_THRESHOLD = 30; // Orange = 30-55fps

// ============================================================================
// Type Definitions
// ============================================================================

type RenderMode = 'worker' | 'main';
type DataType = 'line' | 'scatter' | 'bar' | 'candlestick';

interface BenchmarkState {
  chart: ChartGPUInstance | null;
  mode: RenderMode;
  dataType: DataType;
  streaming: boolean;
  streamingIntervalId: number | null;
  totalPointsGenerated: number;
  performanceUnsubscribe: (() => void) | null;
}

// ============================================================================
// Global State
// ============================================================================

const state: BenchmarkState = {
  chart: null,
  mode: 'worker',
  dataType: 'line',
  streaming: false,
  streamingIntervalId: null,
  totalPointsGenerated: 0,
  performanceUnsubscribe: null,
};

// ============================================================================
// Frame Time Graph
// ============================================================================

class FrameTimeGraph {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private frameTimes: number[] = [];
  private maxFrameTime = 50; // ms, for scale

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context for frame graph');
    }
    this.ctx = ctx;
  }

  addFrame(frameTime: number): void {
    this.frameTimes.push(frameTime);
    if (this.frameTimes.length > FRAME_BUFFER_SIZE) {
      this.frameTimes.shift();
    }
    this.render();
  }

  private render(): void {
    const { ctx, canvas, frameTimes } = this;
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, width, height);

    if (frameTimes.length === 0) return;

    // Draw 60fps target line
    const targetY = height - (EXPECTED_FRAME_TIME_MS / this.maxFrameTime) * height;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, targetY);
    ctx.lineTo(width, targetY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw bars
    const barWidth = width / FRAME_BUFFER_SIZE;
    const startIndex = Math.max(0, frameTimes.length - FRAME_BUFFER_SIZE);

    for (let i = 0; i < frameTimes.length; i++) {
      const frameTime = frameTimes[i];
      const x = i * barWidth;
      const barHeight = Math.min(1, frameTime / this.maxFrameTime) * height;
      const y = height - barHeight;

      // Color based on frame time
      let color: string;
      if (frameTime <= EXPECTED_FRAME_TIME_MS) {
        color = '#10b981'; // Green - good
      } else if (frameTime <= FRAME_TIME_SLOW_THRESHOLD) {
        color = '#f59e0b'; // Orange - slow
      } else {
        color = '#ef4444'; // Red - dropped
      }

      ctx.fillStyle = color;
      ctx.fillRect(x, y, barWidth - 1, barHeight);
    }
  }

  clear(): void {
    this.frameTimes = [];
    this.render();
  }
}

// ============================================================================
// UI Utilities
// ============================================================================

function setElementText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function showStatus(message: string, type: 'success' | 'warning' | 'error' = 'success'): void {
  const el = document.getElementById('statusMessage');
  if (!el) return;

  el.textContent = message;
  el.className = `status-message show ${type}`;
  
  setTimeout(() => {
    el.classList.remove('show');
  }, 5000);
}

function showWarningToast(message: string, duration = 5000): void {
  const toast = document.getElementById('warningToast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(Math.floor(n));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function formatAbbreviatedNumber(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${(n / 1_000_000_000).toFixed(2)}B`;
}

// ============================================================================
// Total Points Display
// ============================================================================

let lastDisplayUpdate = 0;
const DISPLAY_UPDATE_THROTTLE_MS = 100; // Update display max once per 100ms

/**
 * Updates the total points display to show actual rendered points or calculated from inputs.
 * 
 * Behavior:
 * - When actualCount is provided: Shows the live/actual count from state.totalPointsGenerated
 * - When actualCount is undefined: Calculates from input fields (pointCount × seriesCount)
 * - Throttles updates to max 10Hz (100ms) to prevent DOM jank during streaming
 * 
 * @param actualCount Optional actual count from state. If not provided, calculates from inputs.
 */
function updateTotalPointsDisplay(actualCount?: number): void {
  // Throttle updates to prevent jank during high-frequency streaming
  const now = performance.now();
  if (actualCount !== undefined && now - lastDisplayUpdate < DISPLAY_UPDATE_THROTTLE_MS) {
    return;
  }
  lastDisplayUpdate = now;

  const totalPoints = actualCount !== undefined 
    ? actualCount 
    : (parseInt((document.getElementById('pointCount') as HTMLInputElement).value) || 0) *
      (parseInt((document.getElementById('seriesCount') as HTMLInputElement).value) || 0);

  const valueEl = document.getElementById('totalPointsValue');
  const hintEl = document.getElementById('totalPointsHint');
  
  if (!valueEl || !hintEl) return;

  // Format the full number with commas
  const formattedNumber = formatNumber(totalPoints);
  
  // Format the abbreviated version
  const abbreviatedNumber = formatAbbreviatedNumber(totalPoints);
  
  // Update display
  valueEl.textContent = formattedNumber;
  hintEl.textContent = `${abbreviatedNumber} points`;

  // Warning thresholds
  if (totalPoints > 1_000_000_000) {
    // Extreme: > 1B points
    valueEl.setAttribute('data-warning', 'extreme');
  } else if (totalPoints > 100_000_000) {
    // High: > 100M points
    valueEl.setAttribute('data-warning', 'true');
  } else {
    // Normal
    valueEl.setAttribute('data-warning', 'false');
  }
}

// ============================================================================
// Data Generation
// ============================================================================

async function generateData(
  count: number, 
  dataType: DataType,
  onProgress?: (progress: number) => void
): Promise<DataPoint[] | OHLCDataPoint[]> {
  const chunkSize = 100000; // Generate in chunks to avoid blocking
  const chunks: Array<DataPoint[] | OHLCDataPoint[]> = [];
  
  for (let i = 0; i < count; i += chunkSize) {
    const currentChunkSize = Math.min(chunkSize, count - i);
    
    // Generate chunk
    const chunk = generateChunk(i, currentChunkSize, dataType);
    chunks.push(chunk);
    
    // Update progress
    if (onProgress) {
      onProgress((i + currentChunkSize) / count);
    }
    
    // Yield to event loop every chunk
    if (i + chunkSize < count) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  // Type assertion is safe because all chunks are guaranteed to be the same type
  return chunks.flat() as DataPoint[] | OHLCDataPoint[];
}

function generateChunk(
  startIndex: number,
  count: number,
  dataType: DataType
): DataPoint[] | OHLCDataPoint[] {
  if (dataType === 'candlestick') {
    return generateCandlestickChunk(startIndex, count);
  }
  return generateCartesianChunk(startIndex, count, dataType);
}

function generateCartesianChunk(
  startIndex: number,
  count: number,
  dataType: DataType
): DataPoint[] {
  const data: DataPoint[] = new Array(count);
  
  for (let i = 0; i < count; i++) {
    const x = startIndex + i;
    
    // Complex waveform: multiple frequencies + noise
    const y = 
      Math.sin(x * 0.01) * 50 +
      Math.sin(x * 0.03) * 30 +
      Math.sin(x * 0.07) * 15 +
      Math.sin(x * 0.13) * 8 +
      (Math.random() - 0.5) * 5;
    
    if (dataType === 'scatter') {
      // Variable point sizes for scatter
      const size = 2 + Math.random() * 6;
      data[i] = [x, y, size];
    } else {
      data[i] = [x, y];
    }
  }
  
  return data;
}

function generateCandlestickChunk(
  startIndex: number,
  count: number
): OHLCDataPoint[] {
  const data: OHLCDataPoint[] = new Array(count);
  let basePrice = 100;
  
  for (let i = 0; i < count; i++) {
    const timestamp = startIndex + i;
    
    // Random walk with trend
    const trend = Math.sin(i * 0.002) * 0.5;
    const volatility = 2 + Math.random() * 3;
    
    const open = basePrice;
    const change = (Math.random() - 0.5) * volatility + trend;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    
    data[i] = [timestamp, open, close, low, high];
    basePrice = close; // Continue from close price
  }
  
  return data;
}

// ============================================================================
// Chart Management
// ============================================================================

async function createChart(
  mode: RenderMode,
  dataType: DataType,
  data: DataPoint[] | OHLCDataPoint[]
): Promise<ChartGPUInstance> {
  const container = document.getElementById('chart');
  if (!container) {
    throw new Error('Chart container not found');
  }

  const options: ChartGPUOptions = {
    grid: { left: 60, right: 24, top: 24, bottom: 60 }, // Increased bottom for slider
    xAxis: { type: 'value', name: 'Index' },
    yAxis: { type: 'value', name: 'Value' },
    palette: ['#06b6d4', '#6366f1', '#10b981', '#f59e0b', '#ef4444'],
    animation: false, // Disable for performance
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        start: 0,
        end: 100,
      },
      {
        type: 'slider',
        xAxisIndex: 0,
        start: 0,
        end: 100,
      },
    ],
    series: [
      {
        type: dataType === 'candlestick' ? 'candlestick' : dataType,
        name: `${dataType} series`,
        data: data as any,
        color: '#06b6d4',
        lineStyle: dataType === 'line' ? { width: 1.5, opacity: 0.9 } : undefined,
        sampling: 'lttb',
        samplingThreshold: 5000,
      } as any,
    ],
  };

  if (mode === 'worker') {
    return await ChartGPU.createInWorker(container, options);
  } else {
    return await ChartGPU.create(container, options);
  }
}

function disposeChart(): void {
  // Clean up performance subscription
  if (state.performanceUnsubscribe) {
    state.performanceUnsubscribe();
    state.performanceUnsubscribe = null;
  }

  // Dispose chart
  if (state.chart) {
    state.chart.dispose();
    state.chart = null;
  }
}

// ============================================================================
// Performance Metrics Display
// ============================================================================

let frameGraph: FrameTimeGraph | null = null;

function initializeMetricsDisplay(): void {
  const canvas = document.getElementById('frameGraph') as HTMLCanvasElement;
  if (canvas) {
    frameGraph = new FrameTimeGraph(canvas);
  }
}

function updateMetricsDisplay(metrics: PerformanceMetrics): void {
  // FPS Display with color coding
  const fps = metrics.fps;
  const fpsEl = document.getElementById('fpsDisplay');
  if (fpsEl) {
    fpsEl.textContent = fps.toFixed(1);
    
    // Update quality indicator
    if (fps > FPS_SMOOTH_THRESHOLD) {
      fpsEl.setAttribute('data-quality', 'smooth');
    } else if (fps > FPS_MEDIUM_THRESHOLD) {
      fpsEl.setAttribute('data-quality', 'medium');
    } else {
      fpsEl.setAttribute('data-quality', 'choppy');
    }
  }

  // Frame Time Stats
  const ft = metrics.frameTimeStats;
  setElementText(
    'frameTimeDisplay',
    `${ft.min.toFixed(1)} / ${ft.avg.toFixed(1)} / ${ft.max.toFixed(1)} / ${ft.p95.toFixed(1)} / ${ft.p99.toFixed(1)} ms`
  );

  // Memory Stats
  if (metrics.memory.used > 0) {
    setElementText(
      'memoryDisplay',
      `${formatBytes(metrics.memory.used)} / ${formatBytes(metrics.memory.peak)}`
    );
  } else {
    setElementText('memoryDisplay', 'N/A');
  }

  // Frame Drops
  setElementText(
    'frameDropsDisplay',
    `${metrics.frameDrops.totalDrops} / ${metrics.frameDrops.consecutiveDrops}`
  );

  // Total Frames
  setElementText('totalFramesDisplay', formatNumber(metrics.totalFrames));

  // Elapsed Time
  setElementText('elapsedDisplay', formatDuration(metrics.elapsedTime));

  // Update frame time graph
  if (frameGraph) {
    frameGraph.addFrame(ft.avg);
  }
}

function clearMetricsDisplay(): void {
  setElementText('fpsDisplay', '--');
  setElementText('frameTimeDisplay', '--');
  setElementText('memoryDisplay', '--');
  setElementText('frameDropsDisplay', '--');
  setElementText('totalFramesDisplay', '--');
  setElementText('elapsedDisplay', '--');
  
  if (frameGraph) {
    frameGraph.clear();
  }

  const fpsEl = document.getElementById('fpsDisplay');
  if (fpsEl) {
    fpsEl.setAttribute('data-quality', 'smooth');
  }
}

// ============================================================================
// Main Benchmark Logic
// ============================================================================

async function handleGenerate(): Promise<void> {
  const pointCount = parseInt((document.getElementById('pointCount') as HTMLInputElement).value);
  const seriesCount = parseInt((document.getElementById('seriesCount') as HTMLInputElement).value);
  const dataType = (document.getElementById('dataType') as HTMLSelectElement).value as DataType;
  const renderMode = (document.getElementById('renderMode') as HTMLSelectElement).value as RenderMode;

  // Validation
  if (!Number.isFinite(pointCount) || pointCount < 1) {
    showStatus('Invalid point count', 'error');
    return;
  }

  // Warning for very large datasets
  if (pointCount > 100_000_000) {
    showWarningToast(
      `⚠️ Generating ${formatNumber(pointCount)} points. This may take a while and consume significant memory.`,
      10000
    );
  }

  if (pointCount > 1_000_000_000) {
    showWarningToast(
      `🔥 BILLION+ POINTS! This is hardcore. Your system might struggle. Emergency stop is available.`,
      15000
    );
  }

  // Disable buttons during generation
  disableAllButtons();
  showStatus('Generating data...', 'warning');

  try {
    // Dispose existing chart
    stopStreaming();
    disposeChart();
    clearMetricsDisplay();

    // Generate data
    const startTime = performance.now();
    const data = await generateData(pointCount, dataType, (progress) => {
      showStatus(`Generating data... ${(progress * 100).toFixed(0)}%`, 'warning');
    });
    const genTime = performance.now() - startTime;

    showStatus(`Generated ${formatNumber(pointCount)} points in ${formatDuration(genTime)}`, 'success');

    // Create chart
    state.mode = renderMode;
    state.dataType = dataType;
    state.chart = await createChart(renderMode, dataType, data);

    // Check performance capabilities
    const capabilities = state.chart.getPerformanceCapabilities();
    if (capabilities) {
      console.log('[ChartGPU] Performance capabilities:', capabilities);
    }

    // Subscribe to performance updates
    try {
      state.performanceUnsubscribe = state.chart.onPerformanceUpdate((metrics) => {
        updateMetricsDisplay(metrics);
      });

      // Try to get initial metrics
      const initialMetrics = state.chart.getPerformanceMetrics();
      if (initialMetrics) {
        updateMetricsDisplay(initialMetrics);
      }
      
      console.log(`[ChartGPU] Performance metrics subscription active for ${renderMode} mode`);
    } catch (error) {
      console.error('[ChartGPU] Failed to subscribe to performance updates:', error);
      showStatus('Warning: Performance metrics subscription failed', 'warning');
    }

    // Initial resize
    state.chart.resize();

    showStatus(`Chart ready! Rendering with ${renderMode} thread.`, 'success');
    state.totalPointsGenerated = pointCount;
    
    // Update display to show actual generated count
    updateTotalPointsDisplay(state.totalPointsGenerated);
  } catch (error) {
    console.error('Generation failed:', error);
    showStatus(
      error instanceof Error ? error.message : 'Generation failed',
      'error'
    );
  } finally {
    enableAllButtons();
  }
}

async function handleStartStreaming(): Promise<void> {
  if (state.streaming) {
    showStatus('Already streaming', 'warning');
    return;
  }

  const streamRate = parseInt((document.getElementById('streamRate') as HTMLInputElement).value);
  const streamDuration = parseInt((document.getElementById('streamDuration') as HTMLInputElement).value);
  const dataType = (document.getElementById('dataType') as HTMLSelectElement).value as DataType;
  const renderMode = (document.getElementById('renderMode') as HTMLSelectElement).value as RenderMode;

  if (!state.chart) {
    showStatus('Generate data first', 'warning');
    return;
  }

  state.streaming = true;
  let frameCount = 0;
  let nextX = state.totalPointsGenerated;

  const streamFrame = (): void => {
    if (!state.streaming || !state.chart || frameCount >= streamDuration) {
      stopStreaming();
      showStatus('Streaming complete', 'success');
      return;
    }

    frameCount++;

    // Generate batch
    const batch = generateChunk(nextX, streamRate, dataType);
    nextX += streamRate;

    // Append to chart
    state.chart.appendData(0, batch);

    state.totalPointsGenerated += streamRate;
    
    // Update live point count display (throttled)
    updateTotalPointsDisplay(state.totalPointsGenerated);
    
    showStatus(
      `Streaming... ${frameCount}/${streamDuration} frames (${formatNumber(state.totalPointsGenerated)} points total)`,
      'warning'
    );
  };

  // Start streaming at ~60fps
  state.streamingIntervalId = window.setInterval(streamFrame, 16);
  showStatus('Streaming started', 'success');
}

function stopStreaming(): void {
  state.streaming = false;
  if (state.streamingIntervalId !== null) {
    clearInterval(state.streamingIntervalId);
    state.streamingIntervalId = null;
  }
  
  // Update display with final count when streaming stops
  if (state.totalPointsGenerated > 0) {
    updateTotalPointsDisplay(state.totalPointsGenerated);
  }
}

function handleClear(): void {
  stopStreaming();
  disposeChart();
  clearMetricsDisplay();
  state.totalPointsGenerated = 0;
  
  // Reset display to show input-based calculation
  updateTotalPointsDisplay();
  
  showStatus('Cleared', 'success');
}

function handleEmergencyStop(): void {
  stopStreaming();
  disposeChart();
  clearMetricsDisplay();
  state.totalPointsGenerated = 0;
  
  // Reset display to show input-based calculation
  updateTotalPointsDisplay();
  
  showStatus('🚨 Emergency stop activated', 'error');
  showWarningToast('Emergency stop: All operations terminated', 3000);
}

// ============================================================================
// UI State Management
// ============================================================================

function disableAllButtons(): void {
  const buttons = ['btnGenerate', 'btnStream', 'btnClear'];
  buttons.forEach(id => {
    const btn = document.getElementById(id) as HTMLButtonElement;
    if (btn) btn.disabled = true;
  });
}

function enableAllButtons(): void {
  const buttons = ['btnGenerate', 'btnStream', 'btnClear'];
  buttons.forEach(id => {
    const btn = document.getElementById(id) as HTMLButtonElement;
    if (btn) btn.disabled = false;
  });
}

// ============================================================================
// Initialization
// ============================================================================

function init(): void {
  initializeMetricsDisplay();
  
  // Initialize total points display
  updateTotalPointsDisplay();

  // Button event listeners
  document.getElementById('btnGenerate')?.addEventListener('click', handleGenerate);
  document.getElementById('btnStream')?.addEventListener('click', handleStartStreaming);
  document.getElementById('btnClear')?.addEventListener('click', handleClear);
  document.getElementById('btnEmergency')?.addEventListener('click', handleEmergencyStop);

  // Update total points display when inputs change
  document.getElementById('pointCount')?.addEventListener('input', () => updateTotalPointsDisplay());
  document.getElementById('seriesCount')?.addEventListener('input', () => updateTotalPointsDisplay());

  // Resize handling
  let resizeScheduled = false;
  const resizeObserver = new ResizeObserver(() => {
    if (resizeScheduled || !state.chart) return;
    resizeScheduled = true;
    requestAnimationFrame(() => {
      resizeScheduled = false;
      state.chart?.resize();
    });
  });

  const container = document.getElementById('chart');
  if (container) {
    resizeObserver.observe(container);
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    stopStreaming();
    disposeChart();
  });

  // HMR cleanup
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      stopStreaming();
      disposeChart();
      resizeObserver.disconnect();
    });
  }

  showStatus('Ready. Configure and generate your benchmark.', 'success');
}

// Start the app
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
