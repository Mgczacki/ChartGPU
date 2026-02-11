/**
 * Legend position example: legend outside the plot area (top, bottom, left, right).
 * The grid reserves margin so the legend does not overlap the chart.
 */

import { ChartGPU } from '../../src/index';
import type { ChartGPUOptions, DataPoint } from '../../src/index';

const showError = (message: string): void => {
  const el = document.getElementById('error');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
};

type LegendPosition = 'top' | 'bottom' | 'left' | 'right';

const makeSeries = (
  xs: ReadonlyArray<number>,
  ys: ReadonlyArray<number>
): ReadonlyArray<DataPoint> => xs.map((x, i) => [x, ys[i] ?? 0] as const);

function buildOptions(position: LegendPosition): ChartGPUOptions {
  const xs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  return {
    legend: { position },
    grid: { left: 70, right: 24, top: 24, bottom: 56 },
    xAxis: { type: 'value', min: -0.5, max: 9.5, name: 'X' },
    yAxis: { type: 'value', min: -2, max: 14, name: 'Y' },
    tooltip: { show: true, trigger: 'axis' },
    series: [
      { type: 'line', name: 'Serie A', data: makeSeries(xs, [2, 4, 3, 6, 5, 8, 7, 10, 9, 12]), color: '#4a9eff' },
      { type: 'line', name: 'Serie B', data: makeSeries(xs, [1, 3, 5, 4, 7, 6, 9, 8, 11, 10]), color: '#ff4ab0' },
      { type: 'line', name: 'Serie C', data: makeSeries(xs, [3, 2, 4, 5, 4, 7, 6, 9, 8, 11]), color: '#40d17c' },
      { type: 'line', name: 'Serie D', data: makeSeries(xs, [0, 2, 1, 3, 6, 5, 8, 7, 10, 9]), color: '#ffb84a' },
    ],
  };
}

async function main() {
  const container = document.getElementById('chart');
  const positionSelect = document.getElementById('position') as HTMLSelectElement | null;
  if (!container) {
    throw new Error('Chart container not found');
  }

  let chart: Awaited<ReturnType<typeof ChartGPU.create>>;
  const options = buildOptions((positionSelect?.value as LegendPosition) ?? 'left');
  chart = await ChartGPU.create(container, options);

  const updateLegendPosition = () => {
    const pos = (positionSelect?.value ?? 'left') as LegendPosition;
    chart.setOption(buildOptions(pos));
  };

  positionSelect?.addEventListener('change', updateLegendPosition);

  let scheduled = false;
  const ro = new ResizeObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      chart.resize();
    });
  });
  ro.observe(container);

  chart.resize();

  window.addEventListener('beforeunload', () => {
    ro.disconnect();
    chart.dispose();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    main().catch((err) => {
      console.error(err);
      showError(err instanceof Error ? err.message : String(err));
    });
  });
} else {
  main().catch((err) => {
    console.error(err);
    showError(err instanceof Error ? err.message : String(err));
  });
}
