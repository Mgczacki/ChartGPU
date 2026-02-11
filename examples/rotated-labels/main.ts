import { ChartGPU } from '../../src/index';
import type { ChartGPUOptions, DataPoint } from '../../src/index';

const showError = (message: string): void => {
  const el = document.getElementById('error');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
};

const makeSeries = (ys: ReadonlyArray<number>): ReadonlyArray<DataPoint> =>
  ys.map((y, x) => [x, y] as const);

async function main() {
  const container = document.getElementById('chart');
  if (!container) {
    throw new Error('Chart container not found');
  }

  const categories = [
    'Engineering',
    'Product Management',
    'Sales & Marketing',
    'Customer Support',
    'Operations',
    'Human Resources',
    'Finance & Accounting',
  ];
  const revenue = [420, 280, 510, 190, 165, 95, 130];

  const options: ChartGPUOptions = {
    grid: { left: 80, right: 24, top: 24 },
    xAxis: {
      type: 'category',
      data: categories,
      name: 'Department',
      tickLabelRotation: -45,
      titleOffset: [0, 30],
    },
    yAxis: { 
      type: 'value', 
      min: 0, 
      name: 'Revenue (k)'
    },
    tooltip: { show: true, trigger: 'axis' },
    animation: true,
    series: [
      {
        type: 'bar',
        name: 'Revenue',
        data: makeSeries(revenue),
        color: '#4a9eff',
        barCategoryGap: 0.2,
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
