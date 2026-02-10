import type { GridArea } from '../renderers/createGridRenderer';

const BAR_HEIGHT_PX = 12;
const GAP_ABOVE_PLOT_PX = 16;
const LABEL_FONT_SIZE_PX = 11;
/** Fraction of plot width used by the scale bar (0–1). */
const SCALE_BAR_WIDTH_FRACTION = 0.35;
const SCALE_BAR_MAX_WIDTH_PX = 500;
const SCALE_BAR_MIN_WIDTH_PX = 80;

export interface HeatmapColorScaleBarUpdateParams {
  readonly valueMin: number;
  readonly valueMax: number;
  readonly gradientStops: ReadonlyArray<{ offset: number; color: string }>;
  readonly gridArea: GridArea;
  readonly canvasWidthCss: number;
  readonly canvasHeightCss: number;
  readonly visible: boolean;
  /** Series/variable name shown to the left of the scale bar. */
  readonly seriesName?: string;
  readonly textColor?: string;
  readonly fontSize?: number;
}

function formatValue(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e6 || (abs < 0.01 && abs > 0)) return v.toExponential(2);
  const fixed = v.toFixed(2);
  return fixed.replace(/\.?0+$/, '') || '0';
}

export interface HeatmapColorScaleBar {
  update(params: HeatmapColorScaleBarUpdateParams): void;
  dispose(): void;
}

export function createHeatmapColorScaleBar(container: HTMLElement): HeatmapColorScaleBar {
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
  root.style.display = 'none';
  root.style.left = '0';
  root.style.top = '0';
  root.style.flexDirection = 'row';
  root.style.alignItems = 'center';
  root.style.gap = '8px';

  const nameLabel = document.createElement('span');
  nameLabel.style.flex = '0 0 auto';
  nameLabel.style.maxWidth = '140px';
  nameLabel.style.overflow = 'hidden';
  nameLabel.style.textOverflow = 'ellipsis';
  nameLabel.style.whiteSpace = 'nowrap';
  nameLabel.style.fontWeight = '500';
  root.appendChild(nameLabel);

  const barWrapper = document.createElement('div');
  barWrapper.style.display = 'flex';
  barWrapper.style.flexDirection = 'column';
  barWrapper.style.gap = '4px';
  barWrapper.style.flex = '0 0 auto';

  const labelsRow = document.createElement('div');
  labelsRow.style.display = 'flex';
  labelsRow.style.justifyContent = 'space-between';
  labelsRow.style.fontVariantNumeric = 'tabular-nums';
  labelsRow.style.whiteSpace = 'nowrap';
  labelsRow.style.fontSize = `${LABEL_FONT_SIZE_PX}px`;
  const labelMin = document.createElement('span');
  const labelMax = document.createElement('span');
  labelsRow.appendChild(labelMin);
  labelsRow.appendChild(labelMax);

  const barTrack = document.createElement('div');
  barTrack.style.height = `${BAR_HEIGHT_PX}px`;
  barTrack.style.borderRadius = '4px';
  barTrack.style.overflow = 'hidden';

  barWrapper.appendChild(labelsRow);
  barWrapper.appendChild(barTrack);
  root.appendChild(barWrapper);
  container.appendChild(root);

  let disposed = false;

  const update: HeatmapColorScaleBar['update'] = (params) => {
    if (disposed) return;

    if (!params.visible) {
      root.style.display = 'none';
      return;
    }

    const { valueMin, valueMax, gradientStops, gridArea, canvasWidthCss } = params;
    const plotWidthCss = canvasWidthCss - gridArea.left - gridArea.right;
    const topOffset = gridArea.top - BAR_HEIGHT_PX - GAP_ABOVE_PLOT_PX - 4 - LABEL_FONT_SIZE_PX;
    if (topOffset < 0 || plotWidthCss <= 0) {
      root.style.display = 'none';
      return;
    }

    const barWidth = Math.max(
      SCALE_BAR_MIN_WIDTH_PX,
      Math.min(SCALE_BAR_MAX_WIDTH_PX, plotWidthCss * SCALE_BAR_WIDTH_FRACTION)
    );
    const barLeft = gridArea.left;

    root.style.display = 'flex';
    root.style.left = `${barLeft}px`;
    root.style.top = `${topOffset}px`;
    barWrapper.style.width = `${barWidth}px`;

    const textColor = params.textColor ?? 'currentColor';
    const fontSize = params.fontSize ?? LABEL_FONT_SIZE_PX;
    const seriesName = params.seriesName?.trim() ?? '';
    nameLabel.textContent = seriesName;
    nameLabel.style.color = textColor;
    nameLabel.style.fontSize = `${fontSize}px`;
    nameLabel.style.visibility = seriesName ? 'visible' : 'hidden';

    labelMin.textContent = formatValue(valueMin);
    labelMax.textContent = formatValue(valueMax);
    labelMin.style.color = textColor;
    labelMax.style.color = textColor;
    labelsRow.style.fontSize = `${fontSize}px`;

    const gradientParts = gradientStops
      .map((s) => `${s.color} ${(s.offset * 100).toFixed(2)}%`)
      .join(', ');
    barTrack.style.background = gradientParts ? `linear-gradient(to right, ${gradientParts})` : '#888';

    root.style.color = textColor;
  };

  const dispose: HeatmapColorScaleBar['dispose'] = () => {
    if (disposed) return;
    disposed = true;
    try {
      root.remove();
    } catch {
      // best-effort
    }
    if (didSetRelative && previousInlinePosition !== null) {
      container.style.position = previousInlinePosition;
    }
  };

  return { update, dispose };
}
