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
  const locator = page.locator(selector).first();
  const box = await locator.boundingBox();
  const zIndex = await locator
    .evaluate((el) => window.getComputedStyle(el).zIndex)
    .catch(() => "auto");
  const isVisible = await locator.isVisible().catch(() => false);

  let isInViewport = false;
  if (box) {
    const viewport = page.viewportSize() ?? DEFAULT_VIEWPORT;
    isInViewport =
      box.x < viewport.width &&
      box.x + box.width > 0 &&
      box.y < viewport.height &&
      box.y + box.height > 0;
  }

  return {
    selector,
    box,
    z_index: zIndex,
    is_visible: isVisible,
    is_in_viewport: isInViewport,
  };
}

function computeIntersectionRatio(a: BoundingBox, b: BoundingBox): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersectionArea = xOverlap * yOverlap;
  const targetArea = a.width * a.height;
  return targetArea > 0 ? Math.round((intersectionArea / targetArea) * 10000) / 10000 : 0;
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
    case "contains":
      return {
        rule,
        passed:
          a.x <= b.x &&
          a.y <= b.y &&
          a.x + a.width >= b.x + b.width &&
          a.y + a.height >= b.y + b.height,
        reason:
          a.x <= b.x &&
          a.y <= b.y &&
          a.x + a.width >= b.x + b.width &&
          a.y + a.height >= b.y + b.height
            ? `'${rule.element_a}' fully contains '${rule.element_b}'`
            : `'${rule.element_a}' does not fully contain '${rule.element_b}'`,
      };
    case "not_overlapping": {
      const ratio = computeIntersectionRatio(a, b);
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
  return withPage(url, viewport, async (page) => {
    return Promise.all(selectors.map((s) => getElementData(page, s)));
  });
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

    const targetBox = targetData.box;
    const overlayBox = overlayData.box;

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

    const ratio = computeIntersectionRatio(targetBox, overlayBox);
    const xOverlap = Math.max(
      0,
      Math.min(targetBox.x + targetBox.width, overlayBox.x + overlayBox.width) -
        Math.max(targetBox.x, overlayBox.x)
    );
    const yOverlap = Math.max(
      0,
      Math.min(targetBox.y + targetBox.height, overlayBox.y + overlayBox.height) -
        Math.max(targetBox.y, overlayBox.y)
    );

    return {
      target: targetSelector,
      overlay: overlaySelector,
      target_box: targetBox,
      overlay_box: overlayBox,
      is_occluded: ratio > 0,
      intersection_ratio: ratio,
      occluded_area_px: Math.round(xOverlap * yOverlap),
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

    const results = rules.map((rule) => {
      const a = dataMap.get(rule.element_a)?.box ?? null;
      const b = dataMap.get(rule.element_b)?.box ?? null;
      return applyRule(rule, a, b);
    });

    return { passed: results.every((r) => r.passed), results };
  });
}

export async function computeViewportReflow(
  url: string,
  selectors: string[],
  viewports: Array<{ width: number; height: number }>
): Promise<ReflowResult[]> {
  const snapshots: Array<{
    viewport: { width: number; height: number };
    elements: ElementSpatialData[];
  }> = [];

  for (const viewport of viewports) {
    const elements = await withPage(url, viewport, async (page) => {
      return Promise.all(selectors.map((s) => getElementData(page, s)));
    });
    snapshots.push({ viewport, elements });
  }

  return selectors.map((selector) => {
    const boxes = snapshots.map((snap) => ({
      viewport: snap.viewport,
      box: snap.elements.find((e) => e.selector === selector)?.box ?? null,
    }));

    const validBoxes = boxes.filter((b) => b.box !== null).map((b) => b.box!);

    const deltaX =
      validBoxes.length > 1
        ? Math.max(...validBoxes.map((b) => b.x)) - Math.min(...validBoxes.map((b) => b.x))
        : 0;
    const deltaY =
      validBoxes.length > 1
        ? Math.max(...validBoxes.map((b) => b.y)) - Math.min(...validBoxes.map((b) => b.y))
        : 0;
    const deltaW =
      validBoxes.length > 1
        ? Math.max(...validBoxes.map((b) => b.width)) - Math.min(...validBoxes.map((b) => b.width))
        : 0;
    const deltaH =
      validBoxes.length > 1
        ? Math.max(...validBoxes.map((b) => b.height)) -
          Math.min(...validBoxes.map((b) => b.height))
        : 0;

    return {
      selector,
      snapshots: boxes,
      shifted: deltaX > 0 || deltaY > 0 || deltaW > 0 || deltaH > 0,
      max_delta_x: Math.round(deltaX),
      max_delta_y: Math.round(deltaY),
      max_delta_width: Math.round(deltaW),
      max_delta_height: Math.round(deltaH),
    };
  });
}
