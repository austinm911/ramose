/** The light theme: a `createTheme` override of the color scale only. */

import * as stylex from "@stylexjs/stylex";
import { colors } from "./tokens.stylex";

export const light = stylex.createTheme(colors, {
  bg: "#f4f6f9",
  bgRaised: "#eceff4",
  surface: "#ffffff",
  surfaceHover: "#f3f5f9",
  surfaceActive: "#e9edf4",
  border: "#dde2ea",
  borderStrong: "#c6cdd9",
  text: "#151922",
  textMuted: "#5b6577",
  textFaint: "#8a93a4",
  accent: "#3d6bff",
  accentHover: "#2f5ae8",
  accentSoft: "rgba(61, 107, 255, 0.1)",
  accentText: "#ffffff",
  ring: "rgba(61, 107, 255, 0.3)",
  ok: "#1f9d55",
  okSoft: "rgba(31, 157, 85, 0.12)",
  warn: "#b8730a",
  warnSoft: "rgba(196, 125, 14, 0.14)",
  danger: "#d64550",
  dangerSoft: "rgba(214, 69, 80, 0.1)",
  overlay: "rgba(23, 28, 38, 0.4)",
  shadow: "0 16px 48px rgba(23, 28, 38, 0.18), 0 2px 8px rgba(23, 28, 38, 0.08)",
  shadowSm: "0 1px 2px rgba(23, 28, 38, 0.06), 0 4px 14px rgba(23, 28, 38, 0.06)",
  glowA: "rgba(61, 107, 255, 0.16)",
  glowB: "rgba(20, 184, 166, 0.12)",
});
