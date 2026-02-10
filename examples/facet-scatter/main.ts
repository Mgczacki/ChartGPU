/**
 * Facet scatter example: scatter (points) charts with facets (fx / fy).
 * Each point must have x, y and the facet property (e.g. region, trimestre).
 */

import { ChartGPU } from '../../src/index';
import type { ChartGPUOptions } from '../../src/index';

type PointWithFacet = { x: number; y: number; region?: string; trimestre?: string };

const showError = (message: string, id: string): void => {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  (el as HTMLElement).style.display = 'block';
};

async function main() {
  const container = document.getElementById('chart');
  const containerFxFy = document.getElementById('chart-fxfy');
  if (!container || !containerFxFy) {
    throw new Error('Chart containers not found');
  }

  // Scatter data with facet key: one panel per region (horizontal facets)
  const dataFx: PointWithFacet[] = [
    { x: 10, y: 20, region: 'Norte' },
    { x: 25, y: 45, region: 'Norte' },
    { x: 40, y: 15, region: 'Norte' },
    { x: 55, y: 60, region: 'Norte' },
    { x: 70, y: 35, region: 'Norte' },
    { x: 85, y: 50, region: 'Norte' },
    { x: 15, y: 55, region: 'Sur' },
    { x: 35, y: 25, region: 'Sur' },
    { x: 50, y: 70, region: 'Sur' },
    { x: 65, y: 40, region: 'Sur' },
    { x: 80, y: 18, region: 'Sur' },
    { x: 20, y: 38, region: 'Este' },
    { x: 45, y: 62, region: 'Este' },
    { x: 60, y: 22, region: 'Este' },
    { x: 75, y: 48, region: 'Este' },
  ];

  const optionsFx: ChartGPUOptions = {
    facet: { fx: 'region', gap: 30 },
    grid: { left: 64, right: 48, top: 44, bottom: 80 },
    xAxis: { type: 'value', name: 'X', min: 0, max: 100 },
    yAxis: { type: 'value', name: 'Y', min: 0, max: 80 },
    tooltip: { show: true, trigger: 'item' },
    series: [
      {
        type: 'scatter',
        name: 'Puntos',
        data: dataFx as ChartGPUOptions['series'][0]['data'],
        symbolSize: 8,
        color: '#4a9eff',
      },
    ],
  };

  const chartFx = await ChartGPU.create(container, optionsFx);

  // Scatter with fx + fy: grid of panels (region × trimestre)
  const dataFxFy: PointWithFacet[] = [
    { x: 12, y: 22, region: 'Norte', trimestre: 'Q1' },
    { x: 28, y: 42, region: 'Norte', trimestre: 'Q1' },
    { x: 45, y: 18, region: 'Norte', trimestre: 'Q1' },
    { x: 15, y: 52, region: 'Norte', trimestre: 'Q2' },
    { x: 38, y: 28, region: 'Norte', trimestre: 'Q2' },
    { x: 62, y: 65, region: 'Norte', trimestre: 'Q2' },
    { x: 18, y: 58, region: 'Sur', trimestre: 'Q1' },
    { x: 42, y: 30, region: 'Sur', trimestre: 'Q1' },
    { x: 55, y: 72, region: 'Sur', trimestre: 'Q1' },
    { x: 22, y: 42, region: 'Sur', trimestre: 'Q2' },
    { x: 48, y: 22, region: 'Sur', trimestre: 'Q2' },
    { x: 72, y: 55, region: 'Sur', trimestre: 'Q2' },
  ];

  const optionsFxFy: ChartGPUOptions = {
    facet: { fx: 'region', fy: 'trimestre', gap: 24 },
    grid: { left: 56, right: 40, top: 40, bottom: 72 },
    xAxis: { type: 'value', name: 'X', min: 0, max: 100 },
    yAxis: { type: 'value', name: 'Y', min: 0, max: 80 },
    tooltip: { show: true, trigger: 'item' },
    series: [
      {
        type: 'scatter',
        name: 'Puntos',
        data: dataFxFy as ChartGPUOptions['series'][0]['data'],
        symbolSize: 10,
        color: '#b388ff',
      },
    ],
  };

  const chartFxFy = await ChartGPU.create(containerFxFy, optionsFxFy);

  let scheduled = false;
  const ro = new ResizeObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      chartFx.resize();
      chartFxFy.resize();
    });
  });
  ro.observe(container);
  ro.observe(containerFxFy);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  showError(msg, 'error');
  showError(msg, 'error-fxfy');
});
