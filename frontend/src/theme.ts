import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FCFAF8",
  onSurface: "#1A1A1A",
  surfaceSecondary: "#F3EFEA",
  onSurfaceSecondary: "#2C2C2C",
  surfaceTertiary: "#EAE5DF",
  onSurfaceTertiary: "#3D3D3D",
  surfaceInverse: "#1A1A1A",
  onSurfaceInverse: "#FCFAF8",
  muted: "#76726E",

  brand: "#A2C2E1",
  onBrand: "#0A1F35",
  brandPrimary: "#A2C2E1",
  onBrandPrimary: "#0A1F35",
  brandSecondary: "#C3B1E1",
  onBrandSecondary: "#231140",
  brandTertiary: "#B2D8B2",
  onBrandTertiary: "#0D2E0D",

  success: "#B2D8B2",
  onSuccess: "#0D2E0D",
  warning: "#FDE792",
  onWarning: "#4D3B00",
  error: "#E1A2A2",
  onError: "#4A0F0F",
  info: "#A2C2E1",
  onInfo: "#0A1F35",

  border: "#EAE5DF",
  borderStrong: "#D5CEC5",
  divider: "#F3EFEA",

  // Paycheck cycle colors (from workbook)
  cycleBlue: "#A2C2E1",
  cyclePurple: "#C3B1E1",
  cycleGreen: "#B2D8B2",
  cycleYellow: "#FDE792",
  cycleOrange: "#F5C99B",
  onCycle: "#1A1A1A",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

export const cycleColors = ["cycleBlue", "cyclePurple", "cycleGreen", "cycleYellow", "cycleOrange"] as const;
