import { ChartGPU } from '../../src/index';
import type { ChartGPUOptions, DataPoint } from '../../src/index';

const createSineWave = (count: number): ReadonlyArray<DataPoint> => {
  const n = Math.max(2, Math.floor(count));
  const out: DataPoint[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const x = t * Math.PI * 2;
    const y = Math.sin(x);
    out[i] = [x, y] as const;
  }

  return out;
};

const showError = (message: string): void => {
  const el = document.getElementById('error');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
};

async function main() {
  const container = document.getElementById('chart');
  if (!container) {
    throw new Error('Chart container not found');
  }

  const data = createSineWave(100);
  const xMax = Math.PI * 2;

  const options: ChartGPUOptions = {
    grid: { left: 70, right: 24, top: 24, bottom: 56 },
    xAxis: { type: 'value', min: 0, max: xMax },
    yAxis: { type: 'value', min: -1.1, max: 1.1 },
    series: [
      {
        type: 'line',
        name: 'sin(x)',
        data,
        color: '#4a9eff',
        lineStyle: { width: 2, opacity: 1 },
      },
    ],
  };

  const chart = await ChartGPU.create(container, options);

  // Keep the canvas crisp as the container resizes.
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

  // Initial sizing/render.
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

