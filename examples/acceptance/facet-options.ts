import { resolveOptions } from '../../src/config/OptionResolver';

// Acceptance checks for facet options: resolveOptions accepts facet.fx/fy and preserves
// series data with facet properties so that each cell gets the correct filtered points.

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const optionsWithFx = resolveOptions({
  facet: { fx: 'region' },
  xAxis: { type: 'category', data: ['A', 'B', 'C'] },
  yAxis: { type: 'value' },
  series: [
    {
      type: 'bar',
      name: 'Ventas',
      data: [
        { x: 0, y: 10, region: 'Norte' },
        { x: 1, y: 20, region: 'Norte' },
        { x: 2, y: 15, region: 'Norte' },
        { x: 0, y: 15, region: 'Sur' },
        { x: 1, y: 25, region: 'Sur' },
        { x: 2, y: 18, region: 'Sur' },
        { x: 0, y: 8, region: 'Este' },
        { x: 1, y: 14, region: 'Este' },
        { x: 2, y: 22, region: 'Este' },
      ],
    },
  ],
});

assert(optionsWithFx.facet != null, 'Expected facet to be defined');
assert(optionsWithFx.facet?.fx === 'region', 'Expected facet.fx to be "region"');
assert(optionsWithFx.series.length === 1, 'Expected one series');
const series0 = optionsWithFx.series[0];
assert(series0 != null && series0.type === 'bar', 'Expected bar series');
assert(Array.isArray(series0?.data) && series0.data.length === 9, 'Expected 9 data points');
const firstPoint = series0?.data?.[0] as Record<string, unknown> | undefined;
assert(firstPoint?.region === 'Norte', 'Expected first point to have region "Norte"');

const optionsWithFy = resolveOptions({
  facet: { fy: 'zone' },
  series: [{ type: 'line', data: [{ x: 0, y: 1, zone: 'Z1' }] }],
});
assert(optionsWithFy.facet?.fy === 'zone', 'Expected facet.fy to be "zone"');

console.log('acceptance/facet-options: passed');