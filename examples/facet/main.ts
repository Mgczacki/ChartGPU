/**
 * Facet example: multiple panels by column (fx = horizontal / shared y, fy = vertical / shared x).
 * Each data point must be an object with x, y and the facet column property (e.g. region, trimestre).
 */

import { ChartGPU } from '../../src/index';
import type { ChartGPUOptions } from '../../src/index';

const showError = (message: string, id: string): void => {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  (el as HTMLElement).style.display = 'block';
};

async function main() {
  const container = document.getElementById('chart');
  const containerFy = document.getElementById('chart-fy');
  const containerFxFy = document.getElementById('chart-fxfy');
  const containerBar = document.getElementById('chart-bar');
  const containerHistogram = document.getElementById('chart-histogram');
  const containerScatter = document.getElementById('chart-scatter');
  const containerArea = document.getElementById('chart-area');
  if (!container || !containerFy || !containerFxFy || !containerBar || !containerHistogram || !containerScatter || !containerArea) {
    throw new Error('Chart containers not found');
  }

  // --- Horizontal facets (fx): one panel per region, shared y-axis (line for tooltip/hover diagnosis) ---
  const optionsFx: ChartGPUOptions = {
    facet: { fx: 'region', gap: 30 },
    grid: { left: 80, right: -80, top: 44, bottom: 110 },
    xAxis: { type: 'category', data: ['A', 'B', 'C', "D", "E", "F", "G"], name: 'Category', titleOffset: [0, -20] },
    yAxis: { type: 'value', name: 'Sales' },
    tooltip: { show: true, trigger: 'axis' },
    series: [
      {
        type: 'line',
        name: 'Sales',
        data: [
          { x: 0, y: 30, region: 'Norte' },
          { x: 1, y: 20, region: 'Norte' },
          { x: 2, y: 15, region: 'Norte' },
          { x: 3, y: 20, region: 'Norte' },
          { x: 4, y: 25, region: 'Norte' },
          { x: 5, y: 20, region: 'Norte' },
          { x: 6, y: 35, region: 'Norte' },
          { x: 0, y: 15, region: 'Sur' },
          { x: 1, y: 25, region: 'Sur' },
          { x: 2, y: 18, region: 'Sur' },
          { x: 0, y: 8, region: 'Este' },
          { x: 1, y: 14, region: 'Este' },
          { x: 2, y: 22, region: 'Este' },
        ],
        color: '#4a9eff',
      },
    ],
  };

  const chartFx = await ChartGPU.create(container, optionsFx);

  // --- Vertical facets (fy): one panel per trimestre, shared x-axis (line for tooltip/hover diagnosis) ---
  const optionsFy: ChartGPUOptions = {
    facet: { fy: 'trimestre', gap: 40 },
    grid: { left: 64, right: -80, top: 44, bottom: 110 },
    xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'], name: 'Month', titleOffset: [0, -20] },
    yAxis: { type: 'value', name: 'Revenue' },
    tooltip: { show: true, trigger: 'axis' },
    series: [
      {
        type: 'line',
        name: 'Revenue',
        data: [
          { x: 0, y: 12, trimestre: 'Q1' },
          { x: 1, y: 18, trimestre: 'Q1' },
          { x: 2, y: 14, trimestre: 'Q1' },
          { x: 3, y: 20, trimestre: 'Q1' },
          { x: 4, y: 25, trimestre: 'Q1' },
          { x: 5, y: 30, trimestre: 'Q1' },
          { x: 6, y: 35, trimestre: 'Q1' },
          { x: 0, y: 22, trimestre: 'Q2' },
          { x: 1, y: 16, trimestre: 'Q2' },
          { x: 2, y: 20, trimestre: 'Q2' },
          { x: 0, y: 15, trimestre: 'Q3' },
          { x: 1, y: 24, trimestre: 'Q3' },
          { x: 2, y: 19, trimestre: 'Q3' },
        ],
        color: '#6bcf7f',
      },
    ],
  };

  const chartFy = await ChartGPU.create(containerFy, optionsFy);

  // --- Both fx and fy: grid of panels (columns = region, rows = trimestre) (line for tooltip/hover diagnosis) ---
  const optionsFxFy: ChartGPUOptions = {
    facet: { fx: 'region', fy: 'trimestre', gap: 40 },
    grid: { left: 80, right: -60, top: 44, bottom: 110 },
    xAxis: { type: 'category', data: ['A', 'B', 'C', 'D', 'E', 'F', 'G'], name: 'Category', titleOffset: [0, -20] },
    yAxis: { type: 'value', name: 'Sales' },
    tooltip: { show: true, trigger: 'axis' },
    series: [
      {
        type: 'line',
        name: 'Sales',
        data: [
          { x: 0, y: 10, region: 'Norte', trimestre: 'Q1' },
          { x: 1, y: 20, region: 'Norte', trimestre: 'Q1' },
          { x: 2, y: 15, region: 'Norte', trimestre: 'Q1' },
          { x: 3, y: 20, region: 'Norte', trimestre: 'Q1' },
          { x: 4, y: 25, region: 'Norte', trimestre: 'Q1' },
          { x: 5, y: 30, region: 'Norte', trimestre: 'Q1' },
          { x: 6, y: 35, region: 'Norte', trimestre: 'Q1' },
          { x: 0, y: 14, region: 'Norte', trimestre: 'Q2' },
          { x: 1, y: 18, region: 'Norte', trimestre: 'Q2' },
          { x: 2, y: 22, region: 'Norte', trimestre: 'Q2' },
          { x: 0, y: 15, region: 'Sur', trimestre: 'Q1' },
          { x: 1, y: 25, region: 'Sur', trimestre: 'Q1' },
          { x: 2, y: 18, region: 'Sur', trimestre: 'Q1' },
          { x: 0, y: 12, region: 'Sur', trimestre: 'Q2' },
          { x: 1, y: 16, region: 'Sur', trimestre: 'Q2' },
          { x: 2, y: 20, region: 'Sur', trimestre: 'Q2' },
        ],
        color: '#b388ff',
      },
    ],
  };

  const chartFxFy = await ChartGPU.create(containerFxFy, optionsFxFy);

  // --- Facetas con barras: un panel por región ---
  const optionsBar: ChartGPUOptions = {
    facet: { fx: 'region', gap: 30 },
    grid: { left: 64, right: -80, top: 44, bottom: 80 },
    xAxis: { type: 'category', data: ['Jan', 'Feb', 'Mar', 'Apr', 'May'], name: 'Month', titleOffset: [0, -20] },
    yAxis: { type: 'value', name: 'Units' },
    tooltip: { show: true, trigger: 'axis' },
    series: [
      {
        type: 'bar',
        name: 'Sales',
        data: [
          { x: 0, y: 22, region: 'Norte' },
          { x: 1, y: 18, region: 'Norte' },
          { x: 2, y: 25, region: 'Norte' },
          { x: 3, y: 30, region: 'Norte' },
          { x: 4, y: 28, region: 'Norte' },
          { x: 0, y: 14, region: 'Sur' },
          { x: 1, y: 20, region: 'Sur' },
          { x: 2, y: 16, region: 'Sur' },
          { x: 0, y: 10, region: 'Este' },
          { x: 1, y: 15, region: 'Este' },
          { x: 2, y: 12, region: 'Este' },
          { x: 3, y: 18, region: 'Este' },
        ],
        color: '#4a9eff',
      },
    ],
  };

  const chartBar = await ChartGPU.create(containerBar, optionsBar as ChartGPUOptions);

  // --- Facetas con histogramas: distribución por región (datos con propiedad facet) ---
  function randomNormal(): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const histogramData: Array<{ y: number; region: string }> = [];
  const regions = ['Norte', 'Sur', 'Este'];
  for (const region of regions) {
    const mean = region === 'Norte' ? 50 : region === 'Sur' ? 65 : 35;
    const std = 12;
    for (let i = 0; i < 120; i++) {
      histogramData.push({ y: mean + std * randomNormal(), region });
    }
  }

  const optionsHistogram: ChartGPUOptions = {
    facet: { fx: 'region', gap: 30 },
    grid: { left: 80, right: -80, top: 44, bottom: 140 },
    xAxis: { type: 'value', name: 'Value' },
    yAxis: { type: 'value', name: 'Frequency' },
    tooltip: { show: true, trigger: 'axis' },
    series: [
      {
        type: 'histogram',
        name: 'Distribution',
        // Histogram with facets: data as points with facet key (y = value, region = facet)
        data: histogramData as unknown as readonly number[],
        color: '#6bcf7f',
      },
    ],
  };
  (optionsHistogram.series![0] as { data: unknown }).data = histogramData;

  const chartHistogram = await ChartGPU.create(containerHistogram, optionsHistogram as ChartGPUOptions);

  // --- Facetas con puntos (scatter): un panel por región ---
  const scatterData = [
    { x: 10, y: 10, region: 'Norte' },
    { x: 25, y: 25, region: 'Norte' },
    { x: 40, y: 40, region: 'Norte' },
    { x: 55, y: 55, region: 'Norte' },
    { x: 70, y: 70, region: 'Norte' },
    { x: 80, y: 80, region: 'Norte' },
    { x: 15, y: 55, region: 'Sur' },
    { x: 35, y: 25, region: 'Sur' },
    { x: 50, y: 70, region: 'Sur' },
    { x: 65, y: 40, region: 'Sur' },
    { x: 20, y: 38, region: 'Este' },
    { x: 45, y: 62, region: 'Este' },
    { x: 60, y: 22, region: 'Este' },
    { x: 75, y: 48, region: 'Este' },
  ];

  const optionsScatter: ChartGPUOptions = {
    facet: { fx: 'region', gap: 30 },
    grid: { left: 64, right: -80, top: 44, bottom: 140 },
    xAxis: { type: 'value', name: 'X', min: 0, max: 100 },
    yAxis: { type: 'value', name: 'Y', min: 0, max: 80 },
    tooltip: { show: true, trigger: 'item' },
    series: [
      {
        type: 'scatter',
        name: 'Points',
        data: scatterData,
        symbolSize: 10,
        color: '#b388ff',
      },
    ],
  };

  const chartScatter = await ChartGPU.create(containerScatter, optionsScatter as ChartGPUOptions);

  // --- Facets with area chart: one panel per region ---
  const optionsArea: ChartGPUOptions = {
    facet: { fx: 'region', gap: 30 },
    grid: { left: 64, right: 48, top: 44, bottom: 80 },
    xAxis: { type: 'category', data: ['A', 'B', 'C', 'D', 'E', 'F'], name: 'Category', titleOffset: [0, -20] },
    yAxis: { type: 'value', name: 'Volume' },
    tooltip: { show: true, trigger: 'axis' },
    series: [
      {
        type: 'area',
        name: 'Volume',
        data: [
          { x: 0, y: 24, region: 'North' },
          { x: 1, y: 18, region: 'North' },
          { x: 2, y: 28, region: 'North' },
          { x: 3, y: 22, region: 'North' },
          { x: 4, y: 30, region: 'North' },
          { x: 5, y: 26, region: 'North' },
          { x: 0, y: 12, region: 'South' },
          { x: 1, y: 20, region: 'South' },
          { x: 2, y: 14, region: 'South' },
          { x: 3, y: 24, region: 'South' },
          { x: 0, y: 10, region: 'East' },
          { x: 1, y: 16, region: 'East' },
          { x: 2, y: 22, region: 'East' },
          { x: 3, y: 14, region: 'East' },
          { x: 4, y: 20, region: 'East' },
        ],
        color: '#ff9800',
        areaStyle: { color: '#ff9800' },
      },
    ],
  };

  const chartArea = await ChartGPU.create(containerArea, optionsArea as ChartGPUOptions);

  let scheduled = false;
  const ro = new ResizeObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      chartFx.resize();
      chartFy.resize();
      chartFxFy.resize();
      chartBar.resize();
      chartHistogram.resize();
      chartScatter.resize();
      chartArea.resize();
    });
  });
  ro.observe(container);
  ro.observe(containerFy);
  ro.observe(containerFxFy);
  ro.observe(containerBar);
  ro.observe(containerHistogram);
  ro.observe(containerScatter);
  ro.observe(containerArea);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  showError(msg, 'error');
  showError(msg, 'error-fy');
  showError(msg, 'error-fxfy');
  showError(msg, 'error-bar');
  showError(msg, 'error-histogram');
  showError(msg, 'error-scatter');
  showError(msg, 'error-area');
});
