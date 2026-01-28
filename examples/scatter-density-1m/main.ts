import { ChartGPU } from '../../src/index';
import type { ChartGPUOptions, ScatterPointTuple } from '../../src/index';

const showError = (message: string): void => {
  const el = document.getElementById('error');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
};

const mulberry32 = (seed: number): (() => number) => {
  let a = seed | 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const createPointsChunked = async (
  count: number,
  seed: number,
  onProgress?: (done: number, total: number) => void
): Promise<ReadonlyArray<ScatterPointTuple>> => {
  const n = Math.max(0, Math.floor(count));
  const rng = mulberry32(seed);
  const out: ScatterPointTuple[] = new Array(n);

  const chunk = 50_000;
  for (let base = 0; base < n; base += chunk) {
    const end = Math.min(n, base + chunk);
    for (let i = base; i < end; i++) {
      // Two Gaussian-ish blobs + background noise, then sort by x for efficient visible-range binning.
      const t = rng();
      const blob = t < 0.6 ? 0 : 1;
      const cx = blob === 0 ? 0.35 : 0.7;
      const cy = blob === 0 ? 0.55 : 0.35;
      const sx = blob === 0 ? 0.08 : 0.05;
      const sy = blob === 0 ? 0.10 : 0.07;

      // Box-Muller-ish
      const u1 = Math.max(1e-12, rng());
      const u2 = rng();
      const r = Math.sqrt(-2.0 * Math.log(u1));
      const theta = 2.0 * Math.PI * u2;
      const gx = r * Math.cos(theta);
      const gy = r * Math.sin(theta);

      const x = cx + gx * sx + (rng() - 0.5) * 0.03;
      const y = cy + gy * sy + (rng() - 0.5) * 0.03;
      out[i] = [x, y] as const;
    }
    onProgress?.(end, n);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  out.sort((a, b) => a[0] - b[0]);
  return out;
};

const getEl = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

const lowerBoundByX = (points: ReadonlyArray<ScatterPointTuple>, x: number): number => {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (points[mid]![0] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const upperBoundByX = (points: ReadonlyArray<ScatterPointTuple>, x: number): number => {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (points[mid]![0] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

async function main(): Promise<void> {
  const container = getEl<HTMLDivElement>('chart');

  const binSizeInput = getEl<HTMLInputElement>('binSize');
  const binSizeValue = getEl<HTMLSpanElement>('binSizeValue');
  const colormapSelect = getEl<HTMLSelectElement>('colormap');
  const normalizationSelect = getEl<HTMLSelectElement>('normalization');
  const totalPointsEl = getEl<HTMLSpanElement>('totalPoints');
  const binnedPointsEl = getEl<HTMLSpanElement>('binnedPoints');

  binSizeValue.textContent = binSizeInput.value;
  binSizeInput.addEventListener('input', () => {
    binSizeValue.textContent = binSizeInput.value;
  });

  const points = await createPointsChunked(1_000_000, 1337);
  const n = points.length;
  const fmt = new Intl.NumberFormat(undefined);
  totalPointsEl.textContent = fmt.format(n);

  const baseOptions: ChartGPUOptions = {
    theme: 'dark',
    xAxis: { type: 'value' },
    yAxis: { type: 'value' },
    series: [
      {
        type: 'scatter',
        name: 'density',
        data: points,
        mode: 'density',
        binSize: Number(binSizeInput.value),
        densityColormap: colormapSelect.value as any,
        densityNormalization: normalizationSelect.value as any,
        sampling: 'none',
      } as any,
    ],
  };

  const chart = await ChartGPU.create(container, baseOptions);

  // Since points are sorted by x, we can estimate how many points the density pass will bin by
  // mapping percent-space zoom to an x-window and doing a binary search.
  const xMin = n > 0 ? points[0]![0] : 0;
  const xMax = n > 0 ? points[n - 1]![0] : 1;
  const xSpan = xMax - xMin;

  let lastBinnedText = '';
  let lastUpdateMs = 0;
  const updateBinnedReadout = (): void => {
    const zoom = chart.getZoomRange();
    const startPct = Math.max(0, Math.min(100, zoom?.start ?? 0));
    const endPct = Math.max(0, Math.min(100, zoom?.end ?? 100));
    const a = Math.min(startPct, endPct) / 100;
    const b = Math.max(startPct, endPct) / 100;

    const visibleXMin = xMin + a * xSpan;
    const visibleXMax = xMin + b * xSpan;
    const i0 = lowerBoundByX(points, visibleXMin);
    const i1 = upperBoundByX(points, visibleXMax);
    const visibleCount = Math.max(0, i1 - i0);

    const text = fmt.format(visibleCount);
    if (text !== lastBinnedText) {
      lastBinnedText = text;
      binnedPointsEl.textContent = text;
    }
  };

  // Update frequently while rendering, but throttle DOM writes.
  chart.onPerformanceUpdate(() => {
    const now = performance.now();
    if (now - lastUpdateMs < 100) return;
    lastUpdateMs = now;
    updateBinnedReadout();
  });
  updateBinnedReadout();

  const apply = (): void => {
    chart.setOption({
      ...baseOptions,
      series: [
        {
          ...(baseOptions.series![0] as any),
          binSize: Number(binSizeInput.value),
          densityColormap: colormapSelect.value,
          densityNormalization: normalizationSelect.value,
        },
      ],
    });
  };

  binSizeInput.addEventListener('change', apply);
  colormapSelect.addEventListener('change', apply);
  normalizationSelect.addEventListener('change', apply);

  window.addEventListener('resize', () => chart.resize());
}

main().catch((err) => {
  console.error(err);
  showError(String(err?.stack ?? err));
});

