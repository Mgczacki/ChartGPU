/**
 * Heatmap example - Categorical X and Y axes, numeric value per cell.
 * Each cell is (xCategory, yCategory) → a single numeric metric (e.g. sales, revenue).
 * Color is mapped from the numeric value via colormap (e.g. viridis).
 */

import { ChartGPU } from '../../src/index';
import type { ChartGPUOptions } from '../../src/index';

const showError = (message: string): void => {
  const el = document.getElementById('error');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
};

// Categorical axes: labels only (indices 0, 1, 2, ... map to these).
const xCategories = ['Electrónica', 'Ropa', 'Hogar', 'Deportes', 'Juguetes', 'Alimentación'];
const yCategories = ['Q1', 'Q2', 'Q3', 'Q4'];

// Simple deterministic "random" in [min, max] from (xi, yi) so the example is reproducible.
function pseudoRandom(xi: number, yi: number, min: number, max: number): number {
  const n = xi * 73856093 ^ yi * 19349663;
  const t = Math.abs((n * (n * n * 15731 + 789221) + 1376312589) % 1e9) / 1e9;
  return Math.round((min + t * (max - min)) * 10) / 10;
}

// Build heatmap data: one cell per (xCategory, yCategory) with a numeric value.
// x, y = category indices; value = the numeric metric for that cell (varied, not sequential).
function buildHeatmapData(): ReadonlyArray<{ x: number; y: number; value: number }> {
  const data: Array<{ x: number; y: number; value: number }> = [];
  for (let xi = 0; xi < xCategories.length; xi++) {
    for (let yi = 0; yi < yCategories.length; yi++) {
      const value = pseudoRandom(xi, yi, 15, 95);
      data.push({ x: xi, y: yi, value });
    }
  }
  return data;
}

async function main() {
  const container = document.getElementById('chart');
  if (!container) {
    throw new Error('Chart container not found');
  }

  const heatmapData = buildHeatmapData();

  const options: ChartGPUOptions = {
    grid: { left: 56, right: 24, top: 24, bottom: 56 },
    // Eje X categórico: etiquetas en data, posiciones 0..n-1.
    xAxis: {
      type: 'category',
      data: xCategories,
      name: 'Categoría',
      tickLabelRotation: -45,
      titleOffset: [0, 25],
    },
    // Eje Y categórico: etiquetas en data, posiciones 0..n-1.
    yAxis: {
      type: 'category',
      data: yCategories,
      name: 'Trimestre',
    },
    tooltip: { show: true, trigger: 'item' },
    animation: { duration: 600, easing: 'cubicOut', delay: 0 },
    series: [
      {
        type: 'heatmap',
        name: 'Ventas (k€)',
        data: heatmapData,
        colormap: 'viridis',
      },
    ],
  };

  const chart = await ChartGPU.create(container, options);

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
