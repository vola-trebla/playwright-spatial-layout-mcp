export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface ContrastResult {
  foreground: string;
  background: string;
  wcag_2_ratio: number;
  apca_lc_value: number;
  passes_standard_text: boolean;
  passes_large_text: boolean;
  passes_ui_component: boolean;
}

// Parses rgb(...) / rgba(...) from getComputedStyle output
export function parseColor(css: string): RgbColor | null {
  const m = css.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return null;
  return { r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]) };
}

function linearize(c8bit: number): number {
  const c = c8bit / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }: RgbColor): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function wcag2Ratio(fg: RgbColor, bg: RgbColor): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

// APCA-W3 0.0.98G-4g — returns Lc value (positive = fg darker than bg)
export function apcaLc(fg: RgbColor, bg: RgbColor): number {
  const sRco = 0.2126729;
  const sGco = 0.7151522;
  const sBco = 0.072175;
  const normBg = 0.56;
  const normTxt = 0.57;
  const revBg = 0.65;
  const revTxt = 0.62;
  const scaleBoW = 1.14;
  const scaleWoB = 1.14;
  const loClip = 0.1;
  const deltaYmin = 0.0005;
  const loBoW = 0.029;
  const loWoB = 0.027;

  function fsc(c: number): number {
    const v = c / 255;
    return Math.pow(v <= 0.04045 ? v / 12.92 : (v + 0.055) / 1.055, 2.4);
  }

  const Yfg = sRco * fsc(fg.r) + sGco * fsc(fg.g) + sBco * fsc(fg.b);
  const Ybg = sRco * fsc(bg.r) + sGco * fsc(bg.g) + sBco * fsc(bg.b);

  if (Math.abs(Ybg - Yfg) < deltaYmin) return 0;

  let Sapc: number;
  if (Ybg > Yfg) {
    Sapc = (Math.pow(Ybg, normBg) - Math.pow(Yfg, normTxt)) * scaleBoW;
    if (Sapc < loClip) return 0;
    return Math.round((Sapc < loBoW ? Sapc - Sapc * loBoW * loBoW : Sapc - loBoW) * 100);
  } else {
    Sapc = (Math.pow(Ybg, revBg) - Math.pow(Yfg, revTxt)) * scaleWoB;
    if (Sapc > -loClip) return 0;
    return Math.round((Sapc > -loWoB ? Sapc - Sapc * loWoB * loWoB : Sapc + loWoB) * 100);
  }
}

export function buildContrastResult(
  fgCss: string,
  bgCss: string,
  fg: RgbColor,
  bg: RgbColor
): ContrastResult {
  const ratio = wcag2Ratio(fg, bg);
  const lc = apcaLc(fg, bg);
  return {
    foreground: fgCss,
    background: bgCss,
    wcag_2_ratio: ratio,
    apca_lc_value: lc,
    passes_standard_text: ratio >= 4.5,
    passes_large_text: ratio >= 3.0,
    passes_ui_component: ratio >= 3.0,
  };
}
