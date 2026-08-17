/**
 * Reef design tokens. Dark is the default palette; `light` (themes.stylex.ts)
 * overrides the color scale. Only `defineVars` values live in *.stylex.ts
 * files, per the StyleX compiler contract.
 */

import * as stylex from "@stylexjs/stylex";

export const colors = stylex.defineVars({
  bg: "#0a0c10",
  bgRaised: "#0f1218",
  surface: "#141924",
  surfaceHover: "#1a2130",
  surfaceActive: "#202839",
  border: "#232c3d",
  borderStrong: "#313d54",
  text: "#e8ebf1",
  textMuted: "#98a2b6",
  textFaint: "#5e6879",
  accent: "#5b8cff",
  accentHover: "#7aa2ff",
  accentSoft: "rgba(91, 140, 255, 0.14)",
  accentText: "#ffffff",
  ok: "#3fb970",
  okSoft: "rgba(63, 185, 112, 0.14)",
  warn: "#f5a524",
  warnSoft: "rgba(245, 165, 36, 0.16)",
  danger: "#ef5f6b",
  dangerSoft: "rgba(239, 95, 107, 0.14)",
  overlay: "rgba(4, 6, 10, 0.66)",
  shadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
  shadowSm: "0 2px 10px rgba(0, 0, 0, 0.35)",
});

export const space = stylex.defineVars({
  xxs: "2px",
  xs: "4px",
  sm: "8px",
  md: "12px",
  lg: "16px",
  xl: "24px",
  xxl: "36px",
});

export const radii = stylex.defineVars({
  sm: "6px",
  md: "10px",
  lg: "14px",
  full: "999px",
});

export const type = stylex.defineVars({
  family:
    "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  mono: "ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace",
  xs: "11px",
  sm: "12.5px",
  md: "14px",
  lg: "16px",
  xl: "20px",
  xxl: "28px",
});
