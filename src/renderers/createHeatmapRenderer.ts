import barWgsl from '../shaders/bar.wgsl?raw';
import type { HeatmapSeriesConfig } from '../config/types';
import type { LinearScale } from '../utils/scales';
import type { GridArea } from './createGridRenderer';
import { createRenderPipeline, createUniformBuffer, writeUniformBuffer } from './rendererUtils';

export interface HeatmapRenderer {
  prepare(
    seriesConfigs: ReadonlyArray<HeatmapSeriesConfig>,
    xScale: LinearScale,
    yScale: LinearScale,
    gridArea: GridArea
  ): void;
  render(passEncoder: GPURenderPassEncoder): void;
  dispose(): void;
}

export interface HeatmapRendererOptions {
  readonly targetFormat?: GPUTextureFormat;
}

type Rgba = readonly [r: number, g: number, b: number, a: number];

const DEFAULT_TARGET_FORMAT: GPUTextureFormat = 'bgra8unorm';
const INSTANCE_STRIDE_BYTES = 32; // rect vec4 + color vec4
const INSTANCE_STRIDE_FLOATS = INSTANCE_STRIDE_BYTES / 4;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const nextPow2 = (v: number): number => {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const n = Math.ceil(v);
  return 2 ** Math.ceil(Math.log2(n));
};

const createIdentityMat4Buffer = (): ArrayBuffer => {
  const buffer = new ArrayBuffer(16 * 4);
  new Float32Array(buffer).set([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
  return buffer;
};

const computePlotClipRect = (
  gridArea: GridArea
): { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number } => {
  const { left, right, top, bottom, canvasWidth, canvasHeight, devicePixelRatio } = gridArea;
  const plotLeft = left * devicePixelRatio;
  const plotRight = canvasWidth - right * devicePixelRatio;
  const plotTop = top * devicePixelRatio;
  const plotBottom = canvasHeight - bottom * devicePixelRatio;
  const plotLeftClip = (plotLeft / canvasWidth) * 2.0 - 1.0;
  const plotRightClip = (plotRight / canvasWidth) * 2.0 - 1.0;
  const plotTopClip = 1.0 - (plotTop / canvasHeight) * 2.0;
  const plotBottomClip = 1.0 - (plotBottom / canvasHeight) * 2.0;
  return { left: plotLeftClip, right: plotRightClip, top: plotTopClip, bottom: plotBottomClip };
};

/**
 * Viridis colormap (low → high): dark purple → blue → green → yellow
 */
const VIRIDIS_COLORS: readonly Rgba[] = [
  [0.267, 0.005, 0.329, 1], // dark purple
  [0.283, 0.141, 0.458, 1],
  [0.254, 0.265, 0.530, 1],
  [0.207, 0.372, 0.553, 1],
  [0.164, 0.471, 0.558, 1],
  [0.128, 0.566, 0.551, 1],
  [0.135, 0.659, 0.518, 1],
  [0.267, 0.749, 0.441, 1],
  [0.478, 0.821, 0.318, 1],
  [0.741, 0.873, 0.150, 1], // yellow
] as const;

const PLASMA_COLORS: readonly Rgba[] = [
  [0.050, 0.030, 0.529, 1],
  [0.347, 0.047, 0.647, 1],
  [0.533, 0.088, 0.642, 1],
  [0.682, 0.135, 0.599, 1],
  [0.802, 0.193, 0.524, 1],
  [0.891, 0.267, 0.417, 1],
  [0.956, 0.361, 0.292, 1],
  [0.992, 0.481, 0.164, 1],
  [0.987, 0.625, 0.073, 1],
  [0.940, 0.788, 0.148, 1],
] as const;

const INFERNO_COLORS: readonly Rgba[] = [
  [0.001, 0.001, 0.014, 1],
  [0.086, 0.025, 0.200, 1],
  [0.199, 0.023, 0.380, 1],
  [0.332, 0.025, 0.483, 1],
  [0.478, 0.026, 0.535, 1],
  [0.622, 0.062, 0.509, 1],
  [0.755, 0.138, 0.438, 1],
  [0.865, 0.250, 0.332, 1],
  [0.944, 0.408, 0.216, 1],
  [0.988, 0.645, 0.198, 1],
] as const;

function getColormap(name?: string | readonly string[]): readonly Rgba[] {
  if (!name || name === 'viridis') return VIRIDIS_COLORS;
  if (name === 'plasma') return PLASMA_COLORS;
  if (name === 'inferno') return INFERNO_COLORS;
  if (Array.isArray(name)) {
    return name.map((c) => {
      const parsed = parseColorToRgba(c);
      return parsed ?? ([0, 0, 0, 1] as const);
    });
  }
  return VIRIDIS_COLORS;
}

function parseColorToRgba(color: string): Rgba | null {
  const hex6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (hex6) {
    return [
      parseInt(hex6[1], 16) / 255,
      parseInt(hex6[2], 16) / 255,
      parseInt(hex6[3], 16) / 255,
      1,
    ] as const;
  }
  return null;
}

function mapValueToColor(value: number, valueMin: number, valueMax: number, colormap: readonly Rgba[]): Rgba {
  const t = valueMax > valueMin ? clamp01((value - valueMin) / (valueMax - valueMin)) : 0.5;
  const idx = t * (colormap.length - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(i0 + 1, colormap.length - 1);
  const f = idx - i0;
  const c0 = colormap[i0]!;
  const c1 = colormap[i1]!;
  return [
    c0[0] + f * (c1[0] - c0[0]),
    c0[1] + f * (c1[1] - c0[1]),
    c0[2] + f * (c1[2] - c0[2]),
    c0[3] + f * (c1[3] - c0[3]),
  ] as const;
}

function rgbaToCss([r, g, b, a]: Rgba): string {
  const R = Math.round(r * 255);
  const G = Math.round(g * 255);
  const B = Math.round(b * 255);
  return a >= 1 ? `rgb(${R},${G},${B})` : `rgba(${R},${G},${B},${a})`;
}

/**
 * Returns CSS gradient stops for the heatmap colormap (for use in a color scale bar overlay).
 * offset in [0, 1]; color as rgb/rgba string.
 */
export function getHeatmapColormapCssStops(
  colormap?: 'viridis' | 'plasma' | 'inferno' | readonly string[]
): Array<{ offset: number; color: string }> {
  const colors = getColormap(colormap);
  return colors.map((c, i) => ({
    offset: colors.length <= 1 ? 0.5 : i / (colors.length - 1),
    color: rgbaToCss(c),
  }));
}

export function createHeatmapRenderer(device: GPUDevice, options?: HeatmapRendererOptions): HeatmapRenderer {
  let disposed = false;
  const targetFormat = options?.targetFormat ?? DEFAULT_TARGET_FORMAT;

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
  });

  const vsUniformBuffer = createUniformBuffer(device, 64, { label: 'heatmapRenderer/vsUniforms' });
  writeUniformBuffer(device, vsUniformBuffer, createIdentityMat4Buffer());

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: vsUniformBuffer } }],
  });

  const pipeline = createRenderPipeline(device, {
    label: 'heatmapRenderer/pipeline',
    bindGroupLayouts: [bindGroupLayout],
    vertex: {
      code: barWgsl,
      label: 'bar.wgsl',
      buffers: [
        {
          arrayStride: INSTANCE_STRIDE_BYTES,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, format: 'float32x4', offset: 0 },
            { shaderLocation: 1, format: 'float32x4', offset: 16 },
          ],
        },
      ],
    },
    fragment: {
      code: barWgsl,
      label: 'bar.wgsl',
      formats: targetFormat,
      blend: {
        color: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
        alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      },
    },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    multisample: { count: 1 },
  });

  let instanceBuffer: GPUBuffer | null = null;
  let instanceCount = 0;
  let cpuInstanceStagingBuffer = new ArrayBuffer(0);
  let cpuInstanceStagingF32 = new Float32Array(cpuInstanceStagingBuffer);

  const assertNotDisposed = (): void => {
    if (disposed) throw new Error('HeatmapRenderer is disposed.');
  };

  const ensureCpuInstanceCapacityFloats = (requiredFloats: number): void => {
    if (requiredFloats <= cpuInstanceStagingF32.length) return;
    const nextFloats = Math.max(8, nextPow2(requiredFloats));
    cpuInstanceStagingBuffer = new ArrayBuffer(nextFloats * 4);
    cpuInstanceStagingF32 = new Float32Array(cpuInstanceStagingBuffer);
  };

  const prepare: HeatmapRenderer['prepare'] = (seriesConfigs, xScale, yScale, gridArea) => {
    assertNotDisposed();
    if (seriesConfigs.length === 0) {
      instanceCount = 0;
      return;
    }

    const plotClipRect = computePlotClipRect(gridArea);

    let maxCells = 0;
    for (const s of seriesConfigs) maxCells += s.data.length;

    ensureCpuInstanceCapacityFloats(maxCells * INSTANCE_STRIDE_FLOATS);
    const f32 = cpuInstanceStagingF32;
    let outFloats = 0;

    for (const series of seriesConfigs) {
      const data = series.data;
      if (data.length === 0) continue;

      const colormap = getColormap(series.colormap);
      let valueMin = series.valueMin ?? Number.POSITIVE_INFINITY;
      let valueMax = series.valueMax ?? Number.NEGATIVE_INFINITY;
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const pt of data) {
        if (Number.isFinite(pt.value)) {
          if (pt.value < valueMin) valueMin = pt.value;
          if (pt.value > valueMax) valueMax = pt.value;
        }
        if (Number.isFinite(pt.x)) {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
        }
        if (Number.isFinite(pt.y)) {
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }
      }
      if (!Number.isFinite(valueMin)) valueMin = 0;
      if (!Number.isFinite(valueMax)) valueMax = 1;

      // Derive cell count from data extent (category indices 0..n-1). Span = count so each cell gets equal space.
      const xSpan = Number.isFinite(minX) && Number.isFinite(maxX) && maxX >= minX ? maxX - minX + 1 : 1;
      const ySpan = Number.isFinite(minY) && Number.isFinite(maxY) && maxY >= minY ? maxY - minY + 1 : 1;
      const cellWidthClip = (plotClipRect.right - plotClipRect.left) / xSpan;
      const cellHeightClip = Math.abs(plotClipRect.bottom - plotClipRect.top) / ySpan;

      for (const pt of data) {
        const { x, y, value } = pt;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(value)) continue;

        const xClipCenter = xScale.scale(x);
        const yClipCenter = yScale.scale(y);
        const left = xClipCenter - cellWidthClip / 2;
        const bottom = yClipCenter - cellHeightClip / 2;
        const rgba = mapValueToColor(value, valueMin, valueMax, colormap);

        f32[outFloats + 0] = left;
        f32[outFloats + 1] = bottom;
        f32[outFloats + 2] = cellWidthClip;
        f32[outFloats + 3] = cellHeightClip;
        f32[outFloats + 4] = rgba[0];
        f32[outFloats + 5] = rgba[1];
        f32[outFloats + 6] = rgba[2];
        f32[outFloats + 7] = rgba[3];
        outFloats += INSTANCE_STRIDE_FLOATS;
      }
    }

    instanceCount = outFloats / INSTANCE_STRIDE_FLOATS;
    if (instanceCount === 0) return;

    const requiredSize = outFloats * 4;
    const bufferSize = Math.max(4, requiredSize);

    if (!instanceBuffer || instanceBuffer.size < bufferSize) {
      if (instanceBuffer) {
        try {
          instanceBuffer.destroy();
        } catch {
          // best-effort
        }
      }
      instanceBuffer = device.createBuffer({
        label: 'heatmapRenderer/instanceBuffer',
        size: bufferSize,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }

    device.queue.writeBuffer(instanceBuffer, 0, cpuInstanceStagingBuffer, 0, requiredSize);
  };

  const render: HeatmapRenderer['render'] = (passEncoder) => {
    assertNotDisposed();
    if (instanceCount === 0 || !instanceBuffer) return;
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.setVertexBuffer(0, instanceBuffer);
    passEncoder.draw(6, instanceCount, 0, 0);
  };

  const dispose: HeatmapRenderer['dispose'] = () => {
    if (disposed) return;
    disposed = true;
    try {
      if (instanceBuffer) instanceBuffer.destroy();
    } catch {
      // best-effort
    }
  };

  return { prepare, render, dispose };
}
