import type {
  AreaStyleConfig,
  AxisConfig,
  ChartGPUOptions,
  GridConfig,
  LineStyleConfig,
  AreaSeriesConfig,
  LineSeriesConfig,
} from './types';
import { defaultAreaStyle, defaultLineStyle, defaultOptions, defaultPalette } from './defaults';
import { getTheme } from '../themes';
import type { ThemeConfig } from '../themes/types';

export type ResolvedGridConfig = Readonly<Required<GridConfig>>;
export type ResolvedLineStyleConfig = Readonly<Required<LineStyleConfig>>;
export type ResolvedAreaStyleConfig = Readonly<Required<AreaStyleConfig>>;

export type ResolvedLineSeriesConfig = Readonly<
  Omit<LineSeriesConfig, 'color' | 'lineStyle' | 'areaStyle'> & {
    readonly color: string;
    readonly lineStyle: ResolvedLineStyleConfig;
    readonly areaStyle?: ResolvedAreaStyleConfig;
  }
>;

export type ResolvedAreaSeriesConfig = Readonly<
  Omit<AreaSeriesConfig, 'color' | 'areaStyle'> & {
    readonly color: string;
    readonly areaStyle: ResolvedAreaStyleConfig;
  }
>;

export type ResolvedSeriesConfig = ResolvedLineSeriesConfig | ResolvedAreaSeriesConfig;

export interface ResolvedChartGPUOptions
  extends Omit<ChartGPUOptions, 'grid' | 'xAxis' | 'yAxis' | 'theme' | 'palette' | 'series'> {
  readonly grid: ResolvedGridConfig;
  readonly xAxis: AxisConfig;
  readonly yAxis: AxisConfig;
  readonly theme: ThemeConfig;
  readonly palette: ReadonlyArray<string>;
  readonly series: ReadonlyArray<ResolvedSeriesConfig>;
}

const sanitizePalette = (palette: unknown): string[] => {
  if (!Array.isArray(palette)) return [];
  return palette
    .filter((c): c is string => typeof c === 'string')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
};

const resolveTheme = (themeInput: unknown): ThemeConfig => {
  const base = getTheme('dark');

  if (typeof themeInput === 'string') {
    const name = themeInput.trim().toLowerCase();
    return name === 'light' ? getTheme('light') : getTheme('dark');
  }

  if (themeInput === null || typeof themeInput !== 'object' || Array.isArray(themeInput)) {
    return base;
  }

  const input = themeInput as Partial<Record<keyof ThemeConfig, unknown>>;
  const takeString = (key: keyof ThemeConfig): string | undefined => {
    const v = input[key];
    if (typeof v !== 'string') return undefined;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  const fontSizeRaw = input.fontSize;
  const fontSize =
    typeof fontSizeRaw === 'number' && Number.isFinite(fontSizeRaw) ? fontSizeRaw : undefined;

  const colorPaletteCandidate = sanitizePalette(input.colorPalette);

  return {
    backgroundColor: takeString('backgroundColor') ?? base.backgroundColor,
    textColor: takeString('textColor') ?? base.textColor,
    axisLineColor: takeString('axisLineColor') ?? base.axisLineColor,
    axisTickColor: takeString('axisTickColor') ?? base.axisTickColor,
    gridLineColor: takeString('gridLineColor') ?? base.gridLineColor,
    colorPalette: colorPaletteCandidate.length > 0 ? colorPaletteCandidate : Array.from(base.colorPalette),
    fontFamily: takeString('fontFamily') ?? base.fontFamily,
    fontSize: fontSize ?? base.fontSize,
  };
};

const normalizeOptionalColor = (color: unknown): string | undefined => {
  if (typeof color !== 'string') return undefined;
  const trimmed = color.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export function resolveOptions(userOptions: ChartGPUOptions = {}): ResolvedChartGPUOptions {
  const theme = resolveTheme(userOptions.theme);

  const paletteCandidate = sanitizePalette(userOptions.palette);
  const palette =
    paletteCandidate.length > 0
      ? paletteCandidate
      : sanitizePalette(theme.colorPalette).length > 0
        ? sanitizePalette(theme.colorPalette)
        : Array.from(defaultOptions.palette ?? defaultPalette);

  // Ensure palette used for modulo indexing is never empty.
  const safePalette = palette.length > 0 ? palette : Array.from(defaultPalette);
  const paletteForIndexing = safePalette.length > 0 ? safePalette : ['#000000'];

  const grid: ResolvedGridConfig = {
    left: userOptions.grid?.left ?? defaultOptions.grid.left,
    right: userOptions.grid?.right ?? defaultOptions.grid.right,
    top: userOptions.grid?.top ?? defaultOptions.grid.top,
    bottom: userOptions.grid?.bottom ?? defaultOptions.grid.bottom,
  };

  const xAxis: AxisConfig = userOptions.xAxis
    ? {
        ...defaultOptions.xAxis,
        ...userOptions.xAxis,
        // runtime safety for JS callers
        type: (userOptions.xAxis as unknown as Partial<AxisConfig>).type ?? defaultOptions.xAxis.type,
      }
    : { ...defaultOptions.xAxis };

  const yAxis: AxisConfig = userOptions.yAxis
    ? {
        ...defaultOptions.yAxis,
        ...userOptions.yAxis,
        // runtime safety for JS callers
        type: (userOptions.yAxis as unknown as Partial<AxisConfig>).type ?? defaultOptions.yAxis.type,
      }
    : { ...defaultOptions.yAxis };

  const series: ReadonlyArray<ResolvedSeriesConfig> = (userOptions.series ?? []).map((s, i) => {
    const explicitColor = normalizeOptionalColor(s.color);
    const inheritedColor = paletteForIndexing[i % paletteForIndexing.length];
    const color = explicitColor ?? inheritedColor;

    if (s.type === 'area') {
      const areaStyle: ResolvedAreaStyleConfig = {
        opacity: s.areaStyle?.opacity ?? defaultAreaStyle.opacity,
      };

      return {
        ...s,
        color,
        areaStyle,
      };
    }

    const lineStyle: ResolvedLineStyleConfig = {
      width: s.lineStyle?.width ?? defaultLineStyle.width,
      opacity: s.lineStyle?.opacity ?? defaultLineStyle.opacity,
    };

    // Avoid leaking the unresolved (user) areaStyle shape via object spread.
    const { areaStyle: _userAreaStyle, ...rest } = s;

    return {
      ...rest,
      color,
      lineStyle,
      ...(s.areaStyle
        ? {
            areaStyle: {
              opacity: s.areaStyle.opacity ?? defaultAreaStyle.opacity,
            },
          }
        : null),
    };
  });

  return {
    grid,
    xAxis,
    yAxis,
    theme,
    palette: safePalette,
    series,
  };
}

export const OptionResolver = { resolve: resolveOptions } as const;

