/** The light theme: a `createTheme` override of the color scale only. */

import * as stylex from "@stylexjs/stylex";
import { colors } from "./tokens.stylex";

export const light = stylex.createTheme(colors, {
  bg: "#f6f7f9",
  bgRaised: "#eff1f5",
  surface: "#ffffff",
  surfaceHover: "#f2f4f8",
  surfaceActive: "#e9edf4",
  border: "#dfe3ea",
  borderStrong: "#c9d0dc",
  text: "#161a22",
  textMuted: "#5d6778",
  textFaint: "#8b94a5",
  accent: "#3d6bff",
  accentHover: "#2f5ae8",
  accentSoft: "rgba(61, 107, 255, 0.1)",
  accentText: "#ffffff",
  ok: "#1f9d55",
  okSoft: "rgba(31, 157, 85, 0.12)",
  warn: "#c47d0e",
  warnSoft: "rgba(196, 125, 14, 0.14)",
  danger: "#d64550",
  dangerSoft: "rgba(214, 69, 80, 0.1)",
  overlay: "rgba(23, 28, 38, 0.4)",
  shadow: "0 12px 40px rgba(23, 28, 38, 0.18)",
  shadowSm: "0 2px 10px rgba(23, 28, 38, 0.1)",
});
