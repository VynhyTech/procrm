// Applies an org's custom brand color to the CSS variables that actually drive
// visible UI (button-primary-* are hardcoded hex in theme.css, not derived via
// var(), so they must be set directly — overriding --color-primary-600 alone
// has no visible effect on buttons).

const OVERRIDE_VARS = [
  "--color-primary-50", "--color-primary-100", "--color-primary-200", "--color-primary-300", "--color-primary-400",
  "--color-primary-500", "--color-primary-600", "--color-primary-700", "--color-primary-800", "--color-primary-900", "--color-primary-950",
  "--color-button-primary-bg", "--color-button-primary-hover", "--color-button-primary-text",
];

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const full = normalized.length === 3 ? normalized.split("").map((c) => c + c).join("") : normalized;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");
}

function mix(hex: string, target: [number, number, number], weight: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([r + (target[0] - r) * weight, g + (target[1] - g) * weight, b + (target[2] - b) * weight]);
}

const lighten = (hex: string, weight: number) => mix(hex, [255, 255, 255], weight);
const darken = (hex: string, weight: number) => mix(hex, [0, 0, 0], weight);

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function applyBrandingColor(hex: string | null | undefined): void {
  const root = document.documentElement;
  if (!hex || !/^#[0-9a-fA-F]{3,6}$/.test(hex)) {
    OVERRIDE_VARS.forEach((v) => root.style.removeProperty(v));
    return;
  }

  root.style.setProperty("--color-primary-50", lighten(hex, 0.95));
  root.style.setProperty("--color-primary-100", lighten(hex, 0.9));
  root.style.setProperty("--color-primary-200", lighten(hex, 0.8));
  root.style.setProperty("--color-primary-300", lighten(hex, 0.65));
  root.style.setProperty("--color-primary-400", lighten(hex, 0.45));
  root.style.setProperty("--color-primary-500", lighten(hex, 0.2));
  root.style.setProperty("--color-primary-600", hex);
  root.style.setProperty("--color-primary-700", darken(hex, 0.15));
  root.style.setProperty("--color-primary-800", darken(hex, 0.3));
  root.style.setProperty("--color-primary-900", darken(hex, 0.45));
  root.style.setProperty("--color-primary-950", darken(hex, 0.6));
  root.style.setProperty("--color-button-primary-bg", hex);
  root.style.setProperty("--color-button-primary-hover", darken(hex, 0.15));
  root.style.setProperty("--color-button-primary-text", relativeLuminance(hex) > 0.6 ? "#1F2937" : "#FFFFFF");
}
