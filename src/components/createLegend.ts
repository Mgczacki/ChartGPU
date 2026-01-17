import type { SeriesConfig } from '../config/types';
import type { ThemeConfig } from '../themes/types';

export type LegendPosition = 'top' | 'bottom' | 'left' | 'right';

export interface Legend {
  update(series: ReadonlyArray<SeriesConfig>, theme: ThemeConfig): void;
  dispose(): void;
}

const getSeriesName = (series: SeriesConfig, index: number): string => {
  const candidate = series.name?.trim();
  return candidate ? candidate : `Series ${index + 1}`;
};

const getSeriesColor = (
  series: SeriesConfig,
  index: number,
  theme: ThemeConfig
): string => {
  const explicit = series.color?.trim();
  if (explicit) return explicit;

  const palette = theme.colorPalette;
  if (palette.length > 0) return palette[index % palette.length] ?? '#000000';
  return '#000000';
};

export function createLegend(
  container: HTMLElement,
  position: LegendPosition = 'right'
): Legend {
  const computedPosition = getComputedStyle(container).position;
  const didSetRelative = computedPosition === 'static';
  const previousInlinePosition = didSetRelative ? container.style.position : null;

  if (didSetRelative) {
    container.style.position = 'relative';
  }

  const root = document.createElement('div');
  root.style.position = 'absolute';
  root.style.pointerEvents = 'none';
  root.style.userSelect = 'none';
  root.style.boxSizing = 'border-box';

  // Theme-driven styling (set/update in update()).
  root.style.padding = '8px';
  root.style.borderRadius = '8px';
  root.style.borderStyle = 'solid';
  root.style.borderWidth = '1px';
  root.style.maxHeight = 'calc(100% - 16px)';
  root.style.overflow = 'auto';

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.gap = '8px';
  root.appendChild(list);

  const applyPositionStyles = (p: LegendPosition): void => {
    // Clear positional styles first so changing position is safe/idempotent.
    root.style.top = '';
    root.style.right = '';
    root.style.bottom = '';
    root.style.left = '';
    root.style.maxWidth = '';

    list.style.flexDirection = '';
    list.style.flexWrap = '';
    list.style.alignItems = '';

    switch (p) {
      case 'right': {
        root.style.top = '8px';
        root.style.right = '8px';
        root.style.maxWidth = '40%';

        list.style.flexDirection = 'column';
        list.style.flexWrap = 'nowrap';
        list.style.alignItems = 'flex-start';
        return;
      }
      case 'left': {
        root.style.top = '8px';
        root.style.left = '8px';
        root.style.maxWidth = '40%';

        list.style.flexDirection = 'column';
        list.style.flexWrap = 'nowrap';
        list.style.alignItems = 'flex-start';
        return;
      }
      case 'top': {
        root.style.top = '8px';
        root.style.left = '8px';
        root.style.right = '8px';

        list.style.flexDirection = 'row';
        list.style.flexWrap = 'wrap';
        list.style.alignItems = 'center';
        return;
      }
      case 'bottom': {
        root.style.bottom = '8px';
        root.style.left = '8px';
        root.style.right = '8px';

        list.style.flexDirection = 'row';
        list.style.flexWrap = 'wrap';
        list.style.alignItems = 'center';
        return;
      }
    }
  };

  applyPositionStyles(position);
  container.appendChild(root);

  let disposed = false;

  const update: Legend['update'] = (series, theme) => {
    if (disposed) return;

    root.style.color = theme.textColor;
    root.style.background = theme.backgroundColor;
    root.style.borderColor = theme.axisLineColor;
    root.style.fontFamily = theme.fontFamily;
    root.style.fontSize = `${theme.fontSize}px`;

    const items = series.map((s, i) => {
      const item = document.createElement('div');
      item.style.display = 'flex';
      item.style.alignItems = 'center';
      item.style.gap = '6px';
      item.style.lineHeight = '1.1';
      item.style.whiteSpace = 'nowrap';

      const swatch = document.createElement('div');
      swatch.style.width = '10px';
      swatch.style.height = '10px';
      swatch.style.borderRadius = '2px';
      swatch.style.flex = '0 0 auto';
      swatch.style.background = getSeriesColor(s, i, theme);
      swatch.style.border = `1px solid ${theme.axisLineColor}`;

      const label = document.createElement('span');
      label.textContent = getSeriesName(s, i);

      item.appendChild(swatch);
      item.appendChild(label);
      return item;
    });

    list.replaceChildren(...items);
  };

  const dispose: Legend['dispose'] = () => {
    if (disposed) return;
    disposed = true;

    try {
      root.remove();
    } finally {
      if (previousInlinePosition !== null) {
        container.style.position = previousInlinePosition;
      }
    }
  };

  return { update, dispose };
}

