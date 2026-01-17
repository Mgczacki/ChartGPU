import { resolveOptions } from '../../src/config/OptionResolver';
import { lightTheme } from '../../src/themes';

// TypeScript-only acceptance checks for Story 1.3.
// This file is excluded from the library build (tsconfig excludes `examples/`).

const resolvedGrid = resolveOptions({ grid: { left: 10 } });
if (resolvedGrid.grid.left !== 10) {
  throw new Error('Expected grid.left to be overridden by user options.');
}
if (resolvedGrid.grid.right !== 20) {
  throw new Error('Expected grid.right to fall back to defaults.');
}

const resolvedSeries = resolveOptions({
  series: [{ type: 'line', data: [[0, 1]] }],
});

if (resolvedSeries.series.length !== 1) {
  throw new Error('Expected series length to be preserved.');
}
if (typeof resolvedSeries.series[0]?.color !== 'string' || resolvedSeries.series[0].color.length === 0) {
  throw new Error('Expected series[0].color to be filled from the palette.');
}

const resolvedTheme = resolveOptions({ theme: 'light' });
if (resolvedTheme.theme.backgroundColor !== lightTheme.backgroundColor) {
  throw new Error('Expected theme.backgroundColor to resolve to the light theme.');
}
if (resolvedTheme.theme.textColor !== lightTheme.textColor) {
  throw new Error('Expected theme.textColor to resolve to the light theme.');
}

