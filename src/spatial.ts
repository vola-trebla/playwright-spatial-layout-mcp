import { Page } from "playwright";
import {
  BoundingBox,
  ElementSpatialData,
  OcclusionResult,
  SpatialRule,
  RuleResult,
  ReflowResult,
} from "./types.js";
import { withPage } from "./browser.js";

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
        const isHidden =
          style.display === "none" ||
          style.visibility === "hidden" ||
          parseFloat(style.opacity) === 0;
        const box =
          isHidden || (rect.width === 0 && rect.height === 0)
            ? null
            : { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
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
        };
      },
      { sel: selector, vp: viewport }
    )
    .catch(() => null);

  return {
    selector,
    box: data?.box ?? null,
    z_index: data?.z_index ?? "auto",
    is_visible: data?.is_visible ?? false,
    is_in_viewport: data?.is_in_viewport ?? false,
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
    case "left_of":
      return {
        rule,
        passed: a.x + a.width <= b.x,
        reason:
          a.x + a.width <= b.x
            ? `'${rule.element_a}' right edge (${a.x + a.width}px) is left of '${rule.element_b}' left edge (${b.x}px)`
            : `'${rule.element_a}' right edge (${a.x + a.width}px) overlaps or is right of '${rule.element_b}' left edge (${b.x}px)`,
      };
    case "right_of":
      return {
        rule,
        passed: a.x >= b.x + b.width,
        reason:
          a.x >= b.x + b.width
            ? `'${rule.element_a}' left edge (${a.x}px) is right of '${rule.element_b}' right edge (${b.x + b.width}px)`
            : `'${rule.element_a}' left edge (${a.x}px) overlaps or is left of '${rule.element_b}' right edge (${b.x + b.width}px)`,
      };
    case "above":
      return {
        rule,
        passed: a.y + a.height <= b.y,
        reason:
          a.y + a.height <= b.y
            ? `'${rule.element_a}' bottom (${a.y + a.height}px) is above '${rule.element_b}' top (${b.y}px)`
            : `'${rule.element_a}' bottom (${a.y + a.height}px) overlaps or is below '${rule.element_b}' top (${b.y}px)`,
      };
    case "below":
      return {
        rule,
        passed: a.y >= b.y + b.height,
        reason:
          a.y >= b.y + b.height
            ? `'${rule.element_a}' top (${a.y}px) is below '${rule.element_b}' bottom (${b.y + b.height}px)`
            : `'${rule.element_a}' top (${a.y}px) overlaps or is above '${rule.element_b}' bottom (${b.y + b.height}px)`,
      };
    case "contains": {
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
    case "not_overlapping": {
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
    const [targetData, overlayData] = await Promise.all([
      getElementData(page, targetSelector),
      getElementData(page, overlaySelector),
    ]);

    const { box: targetBox } = targetData;
    const { box: overlayBox } = overlayData;

    if (!targetBox || !overlayBox) {
      return {
        target: targetSelector,
        overlay: overlaySelector,
        target_box: targetBox,
        overlay_box: overlayBox,
        is_occluded: false,
        intersection_ratio: 0,
        occluded_area_px: 0,
      };
    }

    const { area, ratio } = intersectionGeometry(targetBox, overlayBox);
    return {
      target: targetSelector,
      overlay: overlaySelector,
      target_box: targetBox,
      overlay_box: overlayBox,
      is_occluded: ratio > 0,
      intersection_ratio: ratio,
      occluded_area_px: area,
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
    const boxes = snapshots.map((snap) => ({
      viewport: snap.viewport,
      box: snap.elements.find((e) => e.selector === selector)?.box ?? null,
    }));

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
