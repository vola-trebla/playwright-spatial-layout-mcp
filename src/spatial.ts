import { Page } from 'playwright';
import {
  BoundingBox,
  ElementSpatialData,
  OcclusionResult,
  SpatialRule,
  RuleResult,
  ReflowResult,
  ReflowSnapshot,
} from './types.js';
import { withPage } from './browser.js';
import { parseColor, buildContrastResult, ContrastResult } from './contrast.js';

const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

async function getElementData(page: Page, selector: string): Promise<ElementSpatialData> {
  const viewport = page.viewportSize()!;

  const data = await page
    .evaluate(
      ({ sel, vp }) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        // opacity:0 is intentionally excluded — Playwright considers it visible
        // (occupies space, is in the a11y tree, can receive keyboard focus)
        const isHidden = style.display === 'none' || style.visibility === 'hidden';
        const box =
          isHidden || (rect.width === 0 && rect.height === 0)
            ? null
            : { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        const parent = (el as HTMLElement).offsetParent;
        let posRelToParent: { x: number; y: number } | null = null;
        if (box && parent) {
          const parentRect = parent.getBoundingClientRect();
          posRelToParent = {
            x: Math.round(rect.x - parentRect.x),
            y: Math.round(rect.y - parentRect.y),
          };
        }
        return {
          box,
          z_index: style.zIndex,
          is_visible: !isHidden,
          is_in_viewport:
            box !== null &&
            box.x < vp.width &&
            box.x + box.width > 0 &&
            box.y < vp.height &&
            box.y + box.height > 0,
          position_relative_to_parent: posRelToParent,
        };
      },
      { sel: selector, vp: viewport }
    )
    .catch(() => null);

  return {
    selector,
    box: data?.box ?? null,
    z_index: data?.z_index ?? 'auto',
    is_visible: data?.is_visible ?? false,
    is_in_viewport: data?.is_in_viewport ?? false,
    position_relative_to_parent: data?.position_relative_to_parent ?? null,
  };
}

function intersectionGeometry(a: BoundingBox, b: BoundingBox): { area: number; ratio: number } {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const area = xOverlap * yOverlap;
  const targetArea = a.width * a.height;
  return {
    area: Math.round(area),
    ratio: targetArea > 0 ? Math.round((area / targetArea) * 10000) / 10000 : 0,
  };
}

function maxDelta(values: number[]): number {
  return values.length > 1 ? Math.round(Math.max(...values) - Math.min(...values)) : 0;
}

function applyRule(rule: SpatialRule, a: BoundingBox | null, b: BoundingBox | null): RuleResult {
  if (!a || !b) {
    return {
      rule,
      passed: false,
      reason: `Could not resolve bounding box for ${!a ? rule.element_a : rule.element_b}`,
    };
  }

  switch (rule.type) {
    case 'left_of':
      return {
        rule,
        passed: a.x + a.width <= b.x,
        reason:
          a.x + a.width <= b.x
            ? `'${rule.element_a}' right edge (${a.x + a.width}px) is left of '${rule.element_b}' left edge (${b.x}px)`
            : `'${rule.element_a}' right edge (${a.x + a.width}px) overlaps or is right of '${rule.element_b}' left edge (${b.x}px)`,
      };
    case 'right_of':
      return {
        rule,
        passed: a.x >= b.x + b.width,
        reason:
          a.x >= b.x + b.width
            ? `'${rule.element_a}' left edge (${a.x}px) is right of '${rule.element_b}' right edge (${b.x + b.width}px)`
            : `'${rule.element_a}' left edge (${a.x}px) overlaps or is left of '${rule.element_b}' right edge (${b.x + b.width}px)`,
      };
    case 'above':
      return {
        rule,
        passed: a.y + a.height <= b.y,
        reason:
          a.y + a.height <= b.y
            ? `'${rule.element_a}' bottom (${a.y + a.height}px) is above '${rule.element_b}' top (${b.y}px)`
            : `'${rule.element_a}' bottom (${a.y + a.height}px) overlaps or is below '${rule.element_b}' top (${b.y}px)`,
      };
    case 'below':
      return {
        rule,
        passed: a.y >= b.y + b.height,
        reason:
          a.y >= b.y + b.height
            ? `'${rule.element_a}' top (${a.y}px) is below '${rule.element_b}' bottom (${b.y + b.height}px)`
            : `'${rule.element_a}' top (${a.y}px) overlaps or is above '${rule.element_b}' bottom (${b.y + b.height}px)`,
      };
    case 'contains': {
      const contained =
        a.x <= b.x &&
        a.y <= b.y &&
        a.x + a.width >= b.x + b.width &&
        a.y + a.height >= b.y + b.height;
      return {
        rule,
        passed: contained,
        reason: contained
          ? `'${rule.element_a}' fully contains '${rule.element_b}'`
          : `'${rule.element_a}' does not fully contain '${rule.element_b}'`,
      };
    }
    case 'not_overlapping': {
      const { ratio } = intersectionGeometry(a, b);
      return {
        rule,
        passed: ratio === 0,
        reason:
          ratio === 0
            ? `'${rule.element_a}' and '${rule.element_b}' do not overlap`
            : `'${rule.element_a}' and '${rule.element_b}' overlap by ${Math.round(ratio * 100)}%`,
      };
    }
  }
}

export async function extractBoundingBoxes(
  url: string,
  selectors: string[],
  viewport = DEFAULT_VIEWPORT
): Promise<ElementSpatialData[]> {
  return withPage(url, viewport, (page) =>
    Promise.all(selectors.map((s) => getElementData(page, s)))
  );
}

export async function detectOcclusion(
  url: string,
  targetSelector: string,
  overlaySelector: string,
  viewport = DEFAULT_VIEWPORT
): Promise<OcclusionResult> {
  return withPage(url, viewport, async (page) => {
    const [targetData, overlayData, overlayInteraction] = await Promise.all([
      getElementData(page, targetSelector),
      getElementData(page, overlaySelector),
      page
        .evaluate((sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const style = window.getComputedStyle(el);
          return {
            pointer_events_active: style.pointerEvents !== 'none',
            clip_path_applied: style.clipPath !== 'none',
          };
        }, overlaySelector)
        .catch(() => null),
    ]);

    const { box: targetBox } = targetData;
    const { box: overlayBox } = overlayData;
    const pointerEventsActive = overlayInteraction?.pointer_events_active ?? true;
    const clipPathApplied = overlayInteraction?.clip_path_applied ?? false;

    if (!targetBox || !overlayBox) {
      return {
        target: targetSelector,
        overlay: overlaySelector,
        target_box: targetBox,
        overlay_box: overlayBox,
        is_occluded: false,
        functional_occlusion: false,
        intersection_ratio: 0,
        occluded_area_px: 0,
        overlay_pointer_events_active: pointerEventsActive,
        overlay_clip_path_applied: clipPathApplied,
      };
    }

    const { area, ratio } = intersectionGeometry(targetBox, overlayBox);
    const isOccluded = ratio > 0;
    return {
      target: targetSelector,
      overlay: overlaySelector,
      target_box: targetBox,
      overlay_box: overlayBox,
      is_occluded: isOccluded,
      // true only when overlay geometrically overlaps AND can receive pointer events
      functional_occlusion: isOccluded && pointerEventsActive,
      intersection_ratio: ratio,
      occluded_area_px: area,
      overlay_pointer_events_active: pointerEventsActive,
      overlay_clip_path_applied: clipPathApplied,
    };
  });
}

export async function verifySpatialRelationships(
  url: string,
  rules: SpatialRule[],
  viewport = DEFAULT_VIEWPORT
): Promise<{ passed: boolean; results: RuleResult[] }> {
  return withPage(url, viewport, async (page) => {
    const uniqueSelectors = [...new Set(rules.flatMap((r) => [r.element_a, r.element_b]))];
    const dataMap = new Map<string, ElementSpatialData>();

    await Promise.all(
      uniqueSelectors.map(async (s) => {
        dataMap.set(s, await getElementData(page, s));
      })
    );

    const results = rules.map((rule) =>
      applyRule(
        rule,
        dataMap.get(rule.element_a)?.box ?? null,
        dataMap.get(rule.element_b)?.box ?? null
      )
    );

    return { passed: results.every((r) => r.passed), results };
  });
}

export async function computeViewportReflow(
  url: string,
  selectors: string[],
  viewports: Array<{ width: number; height: number }>
): Promise<ReflowResult[]> {
  const snapshots = await Promise.all(
    viewports.map(async (viewport) => {
      const elements = await withPage(url, viewport, (page) =>
        Promise.all(selectors.map((s) => getElementData(page, s)))
      );
      return { viewport, elements };
    })
  );

  return selectors.map((selector) => {
    const boxes: ReflowSnapshot[] = snapshots.map((snap) => {
      const el = snap.elements.find((e) => e.selector === selector);
      return {
        viewport: snap.viewport,
        box: el?.box ?? null,
        is_visible: el?.is_visible ?? false,
        position_relative_to_parent: el?.position_relative_to_parent ?? null,
      };
    });

    const validBoxes = boxes.map((b) => b.box).filter((b): b is BoundingBox => b !== null);

    return {
      selector,
      snapshots: boxes,
      shifted:
        maxDelta(validBoxes.map((b) => b.x)) > 0 ||
        maxDelta(validBoxes.map((b) => b.y)) > 0 ||
        maxDelta(validBoxes.map((b) => b.width)) > 0 ||
        maxDelta(validBoxes.map((b) => b.height)) > 0,
      max_delta_x: maxDelta(validBoxes.map((b) => b.x)),
      max_delta_y: maxDelta(validBoxes.map((b) => b.y)),
      max_delta_width: maxDelta(validBoxes.map((b) => b.width)),
      max_delta_height: maxDelta(validBoxes.map((b) => b.height)),
    };
  });
}

export async function calculatePerceptualContrast(
  url: string,
  textSelector: string,
  backgroundSelector: string,
  viewport = DEFAULT_VIEWPORT
): Promise<ContrastResult> {
  return withPage(url, viewport, async (page) => {
    const colors = await page
      .evaluate(
        ({ textSel, bgSel }) => {
          const textEl = document.querySelector(textSel);
          const bgEl = document.querySelector(bgSel);
          if (!textEl || !bgEl) return null;
          const textStyle = window.getComputedStyle(textEl);
          const bgStyle = window.getComputedStyle(bgEl);
          return {
            fg: textStyle.color,
            bg: bgStyle.backgroundColor,
          };
        },
        { textSel: textSelector, bgSel: backgroundSelector }
      )
      .catch(() => null);

    if (!colors) {
      throw new Error(`Could not resolve elements: '${textSelector}' or '${backgroundSelector}'`);
    }

    const fg = parseColor(colors.fg);
    const bg = parseColor(colors.bg);

    if (!fg || !bg) {
      throw new Error(`Could not parse colors — fg: '${colors.fg}', bg: '${colors.bg}'`);
    }

    return buildContrastResult(colors.fg, colors.bg, fg, bg);
  });
}
