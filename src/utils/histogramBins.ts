/**
 * Histogram binning: Freedman-Diaconis rule or fixed bin width.
 * bin_width = 2 * IQR / n^(1/3) when binWidth is not provided.
 */

export interface HistogramBinsResult {
  readonly binEdges: number[];
  readonly counts: number[];
}

/**
 * Compute quartile at linear interpolation (0..1).
 * sorted must be non-empty and sorted ascending.
 */
function quartile(sorted: ReadonlyArray<number>, p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const i = p * (sorted.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo]!;
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  return a + (i - lo) * (b - a);
}

/**
 * Compute histogram bins from raw values.
 * - If binWidth is provided and > 0: use that width; edges from min to max in steps of binWidth.
 * - Otherwise: Freedman-Diaconis: h = 2 * IQR / n^(1/3). Fallback when IQR is 0 or n is small.
 */
export function computeHistogramBins(
  values: number[],
  binWidth?: number
): HistogramBinsResult {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) {
    return { binEdges: [], counts: [] };
  }

  const n = finite.length;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const span = max - min;

  if (span <= 0 || !Number.isFinite(span)) {
    return { binEdges: [min, max], counts: [n] };
  }

  let binEdges: number[];
  let numBins: number;

  if (typeof binWidth === 'number' && Number.isFinite(binWidth) && binWidth > 0) {
    const edges: number[] = [min];
    while (edges[edges.length - 1]! + binWidth < max) {
      edges.push(edges[edges.length - 1]! + binWidth);
    }
    edges.push(max);
    binEdges = edges;
    numBins = binEdges.length - 1;
  } else {
    const sorted = [...finite].sort((a, b) => a - b);
    const q1 = quartile(sorted, 0.25);
    const q3 = quartile(sorted, 0.75);
    const iqr = q3 - q1;
    let width: number;
    if (!Number.isFinite(iqr) || iqr <= 0 || n < 2) {
      width = span / Math.min(10, Math.max(1, n));
    } else {
      const h = (2 * iqr) / Math.pow(n, 1 / 3);
      width = Number.isFinite(h) && h > 0 ? h : span / 10;
    }
    numBins = Math.max(1, Math.ceil(span / width));
    const actualWidth = span / numBins;
    binEdges = [];
    for (let i = 0; i <= numBins; i++) {
      binEdges.push(min + i * actualWidth);
    }
  }

  const counts = new Array<number>(numBins).fill(0);

  for (let i = 0; i < finite.length; i++) {
    const v = finite[i]!;
    for (let k = 0; k < numBins; k++) {
      const left = binEdges[k]!;
      const right = binEdges[k + 1]!;
      const inBin = k < numBins - 1 ? v >= left && v < right : v >= left && v <= right;
      if (inBin) {
        counts[k]++;
        break;
      }
    }
  }

  return { binEdges, counts };
}
