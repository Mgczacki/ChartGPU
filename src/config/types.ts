/**
 * Chart configuration types (Phase 1).
 */

import type { ThemeConfig } from '../themes/types';

export type AxisType = 'value' | 'time' | 'category';
export type SeriesType = 'line' | 'area' | 'bar' | 'scatter' | 'pie' | 'candlestick' | 'histogram';

/**
 * A single data point for a series.
 */
export type DataPointTuple = readonly [x: number, y: number, size?: number];

export type DataPoint = DataPointTuple | Readonly<{ x: number; y: number; size?: number }>;

/**
 * OHLC (Open-High-Low-Close) data point for candlestick charts.
 * Order matches ECharts convention: [timestamp, open, close, low, high].
 */
export type OHLCDataPointTuple = readonly [
  timestamp: number,
  open: number,
  close: number,
  low: number,
  high: number,
];

export type OHLCDataPointObject = Readonly<{
  timestamp: number;
  open: number;
  close: number;
  low: number;
  high: number;
}>;

export type OHLCDataPoint = OHLCDataPointTuple | OHLCDataPointObject;

export type SeriesSampling = 'none' | 'lttb' | 'average' | 'max' | 'min' | 'ohlc';

/**
 * Scatter points use the tuple form `[x, y, size?]`.
 */
export type ScatterPointTuple = DataPointTuple;

export type ScatterSymbol = 'circle' | 'rect' | 'triangle';

/**
 * Grid/padding around the plot area, in CSS pixels.
 */
export interface GridConfig {
  readonly left?: number;
  readonly right?: number;
  readonly top?: number;
  readonly bottom?: number;
}

export interface AxisConfig {
  readonly type: AxisType;
  /**
   * Category labels for `type: 'category'` axes.
   *
   * When provided, category indices (0..N-1) map to these labels for axis ticks/labels.
   */
  readonly data?: ReadonlyArray<string>;
  readonly min?: number;
  readonly max?: number;
  /** Tick length in CSS pixels (default: 6). */
  readonly tickLength?: number;
  /**
   * Approximate number of axis segments/ticks. Applies to `value` and `time` axes only.
   * For `xAxis.type === 'time'`, when set, disables the adaptive tick algorithm and fixes the count.
   * For `xAxis.type === 'category'` this is ignored. Values are clamped to [1, 20].
   */
  readonly splitNumber?: number;
  /**
   * Rotation of tick labels in degrees (CSS rotate).
   * Useful for x-axis to avoid overlap (e.g. 45 or -45). Default: 0.
   */
  readonly tickLabelRotation?: number;
  readonly name?: string;
  /**
   * Offset for the axis title (name) only, in CSS pixels [dx, dy].
   * Does not affect tick labels. Useful e.g. to shift the x-axis title down when using rotated tick labels.
   */
  readonly titleOffset?: readonly [dx: number, dy: number];
  /**
   * Axis domain auto-bounds mode (primarily used for y-axis):
   * - `'global'`: derive from full dataset (pre-zoom behavior)
   * - `'visible'`: derive from visible/zoomed data range (default for y-axis)
   * 
   * Note: explicit `min`/`max` always take precedence over auto-bounds.
   * This option is primarily intended for `yAxis` (it has no effect on `xAxis` currently).
   */
  readonly autoBounds?: 'global' | 'visible';
}

export interface DataZoomConfig {
  readonly type: 'inside' | 'slider';
  readonly xAxisIndex?: number;
  /** Start percent in [0, 100]. */
  readonly start?: number;
  /** End percent in [0, 100]. */
  readonly end?: number;
  readonly minSpan?: number;
  readonly maxSpan?: number;
}

export interface LineStyleConfig {
  readonly width?: number;
  readonly opacity?: number;
  readonly color?: string;
}

export interface AreaStyleConfig {
  readonly opacity?: number;
  readonly color?: string;
}

export interface SeriesConfigBase {
  readonly name?: string;
  readonly data: ReadonlyArray<DataPoint>;
  readonly color?: string;
  /**
   * When false, this series is not shown in the legend. Defaults to true when omitted.
   */
  readonly showInLegend?: boolean;
  /**
   * Optional per-series sampling strategy for large datasets.
   *
   * When `sampling !== 'none'` and `data.length > samplingThreshold`, ChartGPU may downsample
   * the series for rendering and interaction hit-testing. Sampling does not affect axis
   * auto-bounds derivation (bounds use raw/unsampled series data).
   */
  readonly sampling?: SeriesSampling;
  /**
   * Auto-sample when point count exceeds this threshold.
   *
   * Note: when `sampling === 'none'`, this value is ignored at runtime but may still be provided.
   */
  readonly samplingThreshold?: number;
}

export interface LineSeriesConfig extends SeriesConfigBase {
  readonly type: 'line';
  readonly lineStyle?: LineStyleConfig;
  /**
   * Optional filled-area styling for a line series.
   * When provided, renderers may choose to render a filled area under the line.
   */
  readonly areaStyle?: AreaStyleConfig;
  /**
   * When true or an object with show: true, draw markers at each data point using the series color.
   * Object form allows symbolSize in CSS px (default 4). When false or omitted, no markers are drawn.
   */
  readonly marker?: boolean | { show?: boolean; symbolSize?: number };
}

export interface AreaSeriesConfig extends SeriesConfigBase {
  readonly type: 'area';
  /**
   * Baseline in data-space used as the filled area floor.
   * If omitted, ChartGPU will default to the y-axis minimum.
   */
  readonly baseline?: number;
  readonly areaStyle?: AreaStyleConfig;
  /**
   * When true or an object with show: true, draw markers at each data point using the series color.
   * Object form allows symbolSize in CSS px (default 4). When false or omitted, no markers are drawn.
   */
  readonly marker?: boolean | { show?: boolean; symbolSize?: number };
}

export interface BarItemStyleConfig {
  readonly borderRadius?: number;
  readonly borderWidth?: number;
  readonly borderColor?: string;
}

export interface BarSeriesConfig extends SeriesConfigBase {
  readonly type: 'bar';
  /**
   * Bar width in CSS pixels, or as a percentage of the category width (e.g. '50%').
   */
  readonly barWidth?: number | string;
  /**
   * Gap between bars in the same category, as a ratio in [0, 1].
   */
  readonly barGap?: number;
  /**
   * Gap between categories, as a ratio in [0, 1].
   */
  readonly barCategoryGap?: number;
  /** Stack group id. Bars with the same id may be stacked. */
  readonly stack?: string;
  readonly itemStyle?: BarItemStyleConfig;
}

export interface ScatterSeriesConfig extends SeriesConfigBase {
  readonly type: 'scatter';
  /**
   * Scatter rendering mode.
   *
   * - `'points'` (default): draw point markers (current behavior).
   * - `'density'`: render a binned density heatmap in screen space.
   */
  readonly mode?: 'points' | 'density';
  /**
   * Density bin size in CSS pixels (used only when `mode === 'density'`).
   *
   * Smaller bins increase detail but can reduce performance.
   */
  readonly binSize?: number;
  /**
   * Colormap used for density rendering (used only when `mode === 'density'`).
   *
   * - Named: `'viridis' | 'plasma' | 'inferno'`
   * - Custom: a low→high `string[]` of CSS colors
   */
  readonly densityColormap?: 'viridis' | 'plasma' | 'inferno' | readonly string[];
  /**
   * Normalization curve applied to per-bin counts before mapping to the colormap
   * (used only when `mode === 'density'`).
   */
  readonly densityNormalization?: 'linear' | 'sqrt' | 'log';
  /**
   * Scatter symbol size in CSS pixels. When a function is provided, it receives
   * the point tuple `[x, y, size?]`.
   */
  readonly symbolSize?: number | ((value: ScatterPointTuple) => number);
  readonly symbol?: ScatterSymbol;
}

export type HeatmapDataPoint = Readonly<{ x: number; y: number; value: number }>;

export interface HeatmapSeriesConfig extends Omit<SeriesConfigBase, 'data'> {
  readonly type: 'heatmap';
  /**
   * Heatmap data: each point has (x, y, value).
   * x and y are category indices (0, 1, 2, ...) or numeric coords.
   * value is the aggregated metric (sum, mean, etc.) used for color mapping.
   */
  readonly data: ReadonlyArray<HeatmapDataPoint>;
  /**
   * Colormap for mapping value to color.
   * - Named: 'viridis', 'plasma', 'inferno'
   * - Custom: array of CSS colors [lowColor, ..., highColor]
   */
  readonly colormap?: 'viridis' | 'plasma' | 'inferno' | readonly string[];
  /**
   * Min/max value range for color mapping. If omitted, uses data min/max.
   */
  readonly valueMin?: number;
  readonly valueMax?: number;
}

export type PieDataItem = Readonly<{ value: number; name: string; color?: string }>;

export interface PieItemStyleConfig {
  readonly borderRadius?: number;
  readonly borderWidth?: number;
}

export type PieRadius = number | string | readonly [inner: number | string, outer: number | string];
export type PieCenter = readonly [x: number | string, y: number | string];

export interface PieSeriesConfig extends Omit<SeriesConfigBase, 'data' | 'sampling' | 'samplingThreshold'> {
  readonly type: 'pie';
  /**
   * Radius in CSS pixels, as a percent string (e.g. '50%'), or a tuple [inner, outer].
   * When inner > 0, the series renders as a donut.
   */
  readonly radius?: PieRadius;
  /**
   * Center position as [x, y] in CSS pixels or percent strings.
   */
  readonly center?: PieCenter;
  /**
   * Start angle in degrees (default: 90 = top).
   */
  readonly startAngle?: number;
  readonly data: ReadonlyArray<PieDataItem>;
  readonly itemStyle?: PieItemStyleConfig;
}

export type CandlestickStyle = 'classic' | 'hollow';

export interface CandlestickItemStyleConfig {
  readonly upColor?: string;
  readonly downColor?: string;
  readonly upBorderColor?: string;
  readonly downBorderColor?: string;
  readonly borderWidth?: number;
}

export interface CandlestickSeriesConfig extends Omit<SeriesConfigBase, 'data'> {
  readonly type: 'candlestick';
  readonly data: ReadonlyArray<OHLCDataPoint>;
  readonly style?: CandlestickStyle;
  readonly itemStyle?: CandlestickItemStyleConfig;
  readonly barWidth?: number | string;
  readonly barMinWidth?: number;
  readonly barMaxWidth?: number;
  /**
   * Sampling strategy for candlestick data. Only 'none' and 'ohlc' are supported.
   */
  readonly sampling?: 'none' | 'ohlc';
}

/**
 * Histogram series: bins 1D values and renders as bars (count per bin).
 * data: array of numbers to bin, or DataPoint[] (uses y, or x if y missing).
 * binWidth (optional): fixed bin width in data units; if omitted, Freedman-Diaconis is used.
 */
export interface HistogramSeriesConfig extends Omit<SeriesConfigBase, 'data'> {
  readonly type: 'histogram';
  readonly data: ReadonlyArray<number> | ReadonlyArray<DataPoint>;
  /**
   * Bin width in data units. If omitted, bin width is computed via Freedman-Diaconis.
   */
  readonly binWidth?: number;
}

export type SeriesConfig =
  | LineSeriesConfig
  | AreaSeriesConfig
  | BarSeriesConfig
  | ScatterSeriesConfig
  | HeatmapSeriesConfig
  | PieSeriesConfig
  | CandlestickSeriesConfig
  | HistogramSeriesConfig;

/**
 * Parameters passed to tooltip formatter function.
 */
export interface TooltipParams {
  readonly seriesName: string;
  readonly seriesIndex: number;
  readonly dataIndex: number;
  /**
   * Value tuple for the data point.
   * - Cartesian series (line, area, bar, scatter): [x, y]
   * - Heatmap series: [x, y, cellValue] (cellValue is the value used to color the cell)
   * - Candlestick series: [timestamp, open, close, low, high]
   */
  readonly value:
    | readonly [number, number]
    | readonly [number, number, number]
    | readonly [number, number, number, number, number];
  readonly color: string;
}

/**
 * Tooltip configuration.
 */
export interface TooltipConfig {
  readonly show?: boolean;
  readonly trigger?: 'item' | 'axis';
  /**
   * Custom formatter function for tooltip content.
   * When trigger is 'item', receives a single TooltipParams.
   * When trigger is 'axis', receives an array of TooltipParams.
   * When trigger is undefined, formatter should handle both signatures.
   */
  readonly formatter?: ((params: TooltipParams) => string) | ((params: ReadonlyArray<TooltipParams>) => string);
}

/**
 * Animation configuration for transitions (type definitions only).
 *
 * - `duration` is in milliseconds (default: 300).
 * - Set `ChartGPUOptions.animation = false` to disable all animation.
 */
export interface AnimationConfig {
  /** Animation duration in ms (default: 300). */
  readonly duration?: number;
  readonly easing?: 'linear' | 'cubicOut' | 'cubicInOut' | 'bounceOut';
  /** Animation delay in ms. */
  readonly delay?: number;
}


/**
 * Branded type for exact FPS measurements.
 * Use this to distinguish FPS from other numeric values at compile time.
 */
export type ExactFPS = number & { readonly __brand: 'ExactFPS' };

/**
 * Branded type for millisecond durations.
 * Use this to distinguish milliseconds from other numeric values at compile time.
 */
export type Milliseconds = number & { readonly __brand: 'Milliseconds' };

/**
 * Branded type for byte sizes.
 * Use this to distinguish bytes from other numeric values at compile time.
 */
export type Bytes = number & { readonly __brand: 'Bytes' };

/**
 * Statistics for frame time measurements.
 * All times are in milliseconds.
 */
export interface FrameTimeStats {
  /** Minimum frame time in the measurement window. */
  readonly min: Milliseconds;
  /** Maximum frame time in the measurement window. */
  readonly max: Milliseconds;
  /** Average (mean) frame time. */
  readonly avg: Milliseconds;
  /** 50th percentile (median) frame time. */
  readonly p50: Milliseconds;
  /** 95th percentile frame time. */
  readonly p95: Milliseconds;
  /** 99th percentile frame time. */
  readonly p99: Milliseconds;
}

/**
 * GPU timing statistics.
 * Tracks CPU vs GPU time for render operations.
 */
export interface GPUTimingStats {
  /** Whether GPU timing is enabled and supported. */
  readonly enabled: boolean;
  /** CPU time spent preparing render commands (milliseconds). */
  readonly cpuTime: Milliseconds;
  /** GPU time spent executing render commands (milliseconds). */
  readonly gpuTime: Milliseconds;
}

/**
 * Memory usage statistics.
 * Tracks GPU buffer allocations.
 */
export interface MemoryStats {
  /** Currently used memory in bytes. */
  readonly used: Bytes;
  /** Peak memory usage in bytes since initialization. */
  readonly peak: Bytes;
  /** Total allocated memory in bytes (may include freed regions). */
  readonly allocated: Bytes;
}

/**
 * Frame drop detection statistics.
 * Tracks when frame time exceeds expected interval.
 */
export interface FrameDropStats {
  /** Total number of dropped frames. */
  readonly totalDrops: number;
  /** Consecutive dropped frames (current streak). */
  readonly consecutiveDrops: number;
  /** Timestamp of last dropped frame. */
  readonly lastDropTimestamp: Milliseconds;
}

/**
 * Comprehensive performance metrics.
 * Provides exact FPS measurement and detailed frame statistics.
 */
export interface PerformanceMetrics {
  /** Exact FPS calculated from frame time deltas. */
  readonly fps: ExactFPS;
  /** Frame time statistics (min/max/avg/percentiles). */
  readonly frameTimeStats: FrameTimeStats;
  /** GPU timing statistics (CPU vs GPU time). */
  readonly gpuTiming: GPUTimingStats;
  /** Memory usage statistics. */
  readonly memory: MemoryStats;
  /** Frame drop detection statistics. */
  readonly frameDrops: FrameDropStats;
  /** Total frames rendered since initialization. */
  readonly totalFrames: number;
  /** Total time elapsed since initialization (milliseconds). */
  readonly elapsedTime: Milliseconds;
}

/**
 * Performance capabilities of the current environment.
 * Indicates which performance features are supported.
 */
export interface PerformanceCapabilities {
  /** Whether GPU timing is supported (requires timestamp-query feature). */
  readonly gpuTimingSupported: boolean;
  /** Whether high-resolution timer is available (performance.now). */
  readonly highResTimerSupported: boolean;
  /** Whether performance metrics API is available. */
  readonly performanceMetricsSupported: boolean;
}

export type AnnotationLayer = 'belowSeries' | 'aboveSeries';

export interface AnnotationStyle {
  readonly color?: string;
  readonly lineWidth?: number;
  readonly lineDash?: ReadonlyArray<number>;
  readonly opacity?: number;
}

export type AnnotationLabelAnchor = 'start' | 'center' | 'end';

export type AnnotationLabelPadding =
  | number
  | readonly [top: number, right: number, bottom: number, left: number];

export interface AnnotationLabelBackground {
  readonly color?: string;
  readonly opacity?: number;
  readonly padding?: AnnotationLabelPadding;
  readonly borderRadius?: number;
}

export interface AnnotationLabel {
  /**
   * Explicit label text. If provided, it takes precedence over template rendering.
   */
  readonly text?: string;
  /**
   * A template string for label generation (e.g. 'x={x}, y={y}').
   * Template semantics are implemented at runtime (types only here).
   */
  readonly template?: string;
  /**
   * Decimal places used when formatting numeric values for templates.
   */
  readonly decimals?: number;
  /**
   * Pixel offset from the anchor point, in CSS pixels: [dx, dy].
   */
  readonly offset?: readonly [dx: number, dy: number];
  readonly anchor?: AnnotationLabelAnchor;
  readonly background?: AnnotationLabelBackground;
}

export type AnnotationPosition =
  | Readonly<{ space: 'data'; x: number; y: number }>
  | Readonly<{ space: 'plot'; x: number; y: number }>;

export interface AnnotationLineX {
  readonly type: 'lineX';
  /** Data-space x coordinate for a vertical line. */
  readonly x: number;
  /**
   * Optional y-range in data-space: [minY, maxY].
   * If omitted, runtime may render the full plot height.
   */
  readonly yRange?: readonly [minY: number, maxY: number];
}

export interface AnnotationLineY {
  readonly type: 'lineY';
  /** Data-space y coordinate for a horizontal line. */
  readonly y: number;
  /**
   * Optional x-range in data-space: [minX, maxX].
   * If omitted, runtime may render the full plot width.
   */
  readonly xRange?: readonly [minX: number, maxX: number];
}

export interface AnnotationPointMarker {
  readonly symbol?: ScatterSymbol;
  /** Marker size in CSS pixels. */
  readonly size?: number;
  readonly style?: AnnotationStyle;
}

export interface AnnotationPoint {
  readonly type: 'point';
  readonly x: number;
  readonly y: number;
  readonly marker?: AnnotationPointMarker;
}

export interface AnnotationText {
  readonly type: 'text';
  readonly position: AnnotationPosition;
  readonly text: string;
}

export interface AnnotationConfigBase {
  /**
   * Optional stable identifier for updates/diffing in userland.
   * This is not interpreted by ChartGPU runtime yet (types only).
   */
  readonly id?: string;
  readonly layer?: AnnotationLayer;
  readonly style?: AnnotationStyle;
  readonly label?: AnnotationLabel;
}

export type AnnotationConfig = (AnnotationLineX | AnnotationLineY | AnnotationPoint | AnnotationText) &
  AnnotationConfigBase;

/**
 * Facet configuration: split the chart into panels by unique values of a column.
 * - fx: column name for horizontal faceting (one panel per value, in columns). All panels share the same y-axis.
 * - fy: column name for vertical faceting (one panel per value, in rows). All panels share the same x-axis.
 * When using facets, each point in series[].data must be an object (not a tuple) that includes the facet
 * property, e.g. point[options.facet.fx] or point[options.facet.fy]. Example: { x: 1, y: 10, region: 'Norte' } with facet: { fx: 'region' }.
 */
export interface FacetConfig {
  readonly fx?: string;
  readonly fy?: string;
  /**
   * Gap between facet cells in CSS pixels (horizontal and vertical).
   * Default: 8.
   */
  readonly gap?: number;
  /**
   * Rotation of facet labels (fx and fy) in degrees (CSS rotate).
   * Default: 0.
   */
  readonly labelRotation?: number;
  /**
   * Max characters for facet labels (fx/fy values). Longer labels are truncated with ellipsis.
   * Omit or 0 for no truncation.
   */
  readonly labelMaxChars?: number;
}

export type LegendPosition = 'top' | 'bottom' | 'left' | 'right';

/**
 * Legend configuration. When position is set, the grid reserves margin so the legend sits outside the plot area.
 */
export interface LegendConfig {
  /**
   * Position of the legend. Default: 'right'.
   * With 'left' or 'right' the legend is in a vertical band; with 'top' or 'bottom' it is in a horizontal band.
   */
  readonly position?: LegendPosition;
}

export interface ChartGPUOptions {
  readonly grid?: GridConfig;
  readonly xAxis?: AxisConfig;
  readonly yAxis?: AxisConfig;
  readonly dataZoom?: ReadonlyArray<DataZoomConfig>;
  readonly series?: ReadonlyArray<SeriesConfig>;
  readonly annotations?: ReadonlyArray<AnnotationConfig>;
  /**
   * Facet by column: creates n panels (one per unique value). fx = horizontal panels, shared y-axis; fy = vertical panels, shared x-axis.
   */
  readonly facet?: FacetConfig;
  /**
   * Legend position. When set, margin is reserved so the legend does not overlap the plot.
   */
  readonly legend?: LegendConfig;
  /**
   * When true, the chart may automatically keep the view anchored to the latest data while streaming.
   * Default: false.
   */
  readonly autoScroll?: boolean;
  /**
   * Chart theme used for styling and palette defaults.
   * Accepts a built-in theme name or a custom ThemeConfig override.
   */
  readonly theme?: 'dark' | 'light' | ThemeConfig;
  /**
   * Color palette used for series color assignment when a series does not
   * explicitly specify `color`. Colors should be valid CSS color strings.
   */
  readonly palette?: ReadonlyArray<string>;
  readonly tooltip?: TooltipConfig;
  /**
   * Animation configuration for transitions.
   *
   * - `false` disables all animation.
   * - `true` enables animation with defaults.
   */
  readonly animation?: AnimationConfig | boolean;
  /**
   * When set, cartesian series (line, area, bar, scatter) whose data points are objects
   * containing this property are expanded into one series per unique category value, each
   * assigned a color from the palette. Points must be object form with `x`, `y`, and the
   * key given by `colorBy` (e.g. `{ x: 1, y: 2, region: 'Norte' }` with `colorBy: 'region'`).
   * Does not apply to heatmap, pie, candlestick, or histogram.
   */
  readonly colorBy?: string;
}

