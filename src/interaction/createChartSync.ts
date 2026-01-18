import type { ChartGPU, ChartGPUCrosshairMovePayload } from '../ChartGPU';

export type DisconnectCharts = () => void;

/**
 * Connects multiple charts so pointer movement in one chart drives crosshair/tooltip x
 * in the other charts (domain x sync). Returns a `disconnect()` function.
 *
 * Notes:
 * - Syncs interaction only (crosshair + tooltip x), not zoom/options.
 * - Uses a per-connection loop guard to prevent feedback.
 */
export function connectCharts(charts: ChartGPU[]): DisconnectCharts {
  const connectionToken = Symbol('ChartGPU.connectCharts');

  let disconnected = false;
  const unsubscribeFns: Array<() => void> = [];

  const broadcast = (sourceChart: ChartGPU, x: number | null): void => {
    for (const chart of charts) {
      if (chart === sourceChart) continue;
      if (chart.disposed) continue;
      chart.setCrosshairX(x, connectionToken);
    }
  };

  for (const chart of charts) {
    if (chart.disposed) continue;

    const onCrosshairMove = (payload: ChartGPUCrosshairMovePayload): void => {
      if (disconnected) return;
      if (payload.source === connectionToken) return;
      if (chart.disposed) return;
      broadcast(chart, payload.x);
    };

    chart.on('crosshairMove', onCrosshairMove);
    const unsub = (): void => chart.off('crosshairMove', onCrosshairMove);
    unsubscribeFns.push(unsub);
  }

  return () => {
    if (disconnected) return;
    disconnected = true;

    for (const unsub of unsubscribeFns) unsub();
    unsubscribeFns.length = 0;

    // Clear any “stuck” remote interactions.
    for (const chart of charts) {
      if (chart.disposed) continue;
      chart.setCrosshairX(null, connectionToken);
    }
  };
}

