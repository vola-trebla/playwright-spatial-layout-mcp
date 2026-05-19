import { describe, it, expect } from 'vitest';
import { parseColor, wcag2Ratio, apcaLc, buildContrastResult } from '../src/contrast.js';

describe('parseColor', () => {
  it('parses rgb()', () => {
    expect(parseColor('rgb(0, 0, 0)')).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseColor('rgb(255, 255, 255)')).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('parses rgba()', () => {
    expect(parseColor('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('returns null for unrecognised format', () => {
    expect(parseColor('transparent')).toBeNull();
    expect(parseColor('')).toBeNull();
  });
});

describe('wcag2Ratio', () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };

  it('black on white = 21:1', () => {
    expect(wcag2Ratio(black, white)).toBe(21);
  });

  it('same color = 1:1', () => {
    expect(wcag2Ratio(white, white)).toBe(1);
  });

  it('passes_standard_text threshold is 4.5', () => {
    const result = buildContrastResult('rgb(0,0,0)', 'rgb(255,255,255)', black, white);
    expect(result.passes_standard_text).toBe(true);
    expect(result.passes_large_text).toBe(true);
  });

  it('low-contrast pair fails standard text', () => {
    const lightGrey = { r: 170, g: 170, b: 170 };
    const result = buildContrastResult('rgb(170,170,170)', 'rgb(255,255,255)', lightGrey, white);
    expect(result.passes_standard_text).toBe(false);
  });
});

describe('apcaLc', () => {
  const black = { r: 0, g: 0, b: 0 };
  const white = { r: 255, g: 255, b: 255 };

  it('black on white gives high positive Lc', () => {
    const lc = apcaLc(black, white);
    expect(lc).toBeGreaterThan(100);
  });

  it('white on black gives high negative Lc', () => {
    const lc = apcaLc(white, black);
    expect(lc).toBeLessThan(-100);
  });

  it('same color gives 0', () => {
    expect(apcaLc(white, white)).toBe(0);
  });
});
