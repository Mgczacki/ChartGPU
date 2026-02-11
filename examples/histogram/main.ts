/**
 * Histogram example: bin 1D values and render as bars.
 * Default bin width uses Freedman-Diaconis. Optional binWidth for fixed bins.
 */

import { ChartGPU } from '../../src/index';
import type { ChartGPUOptions } from '../../src/index';

const showError = (message: string): void => {
  const el = document.getElementById('error');
  if (!el) return;
  el.textContent = message;
  (el as HTMLElement).style.display = 'block';
};

/** Simple Box-Muller–style normal variate (mean 0, std 1). */
function randomNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

async function main() {
  const container = document.getElementById('chart');
  if (!container) {
    throw new Error('Chart container not found');
  }

  // Sample data: ~500 values from a normal-like distribution (mean 50, std 15)
  const n = 500;
  const values: number[] = [];
  for (let i = 0; i < n; i++) {
    values.push(50 + 15 * randomNormal());
  }

  const options: ChartGPUOptions = {
    grid: { left: 64, right: 48, top: 44, bottom: 56 },
    xAxis: { type: 'value', name: 'Value' },
    yAxis: { type: 'value', name: 'Count' },
    tooltip: { show: true, trigger: 'axis' },
    series: [
      {
        type: 'histogram',
        name: 'Distribution',
        data: values,
        color: '#6bcf7f',
        // Omit binWidth to use Freedman-Diaconis; or set e.g. binWidth: 5 for fixed bins
      },
    ],
  };

  const chart = await ChartGPU.create(container, options);

  const ro = new ResizeObserver(() => chart.resize());
  ro.observe(container);
}

main().catch((err) => {
  showError(err instanceof Error ? err.message : String(err));
});
