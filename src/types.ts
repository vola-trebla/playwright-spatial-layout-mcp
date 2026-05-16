export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementSpatialData {
  selector: string;
  box: BoundingBox | null;
  z_index: string;
  is_visible: boolean;
  is_in_viewport: boolean;
}

export interface OcclusionResult {
  target: string;
  overlay: string;
  target_box: BoundingBox | null;
  overlay_box: BoundingBox | null;
  is_occluded: boolean;
  intersection_ratio: number;
  occluded_area_px: number;
}

export interface SpatialRule {
  type: "left_of" | "right_of" | "above" | "below" | "contains" | "not_overlapping";
  element_a: string;
  element_b: string;
}

export interface RuleResult {
  rule: SpatialRule;
  passed: boolean;
  reason: string;
}

export interface ViewportSnapshot {
  viewport: { width: number; height: number };
  elements: ElementSpatialData[];
}

export interface ReflowResult {
  selector: string;
  snapshots: Array<{
    viewport: { width: number; height: number };
    box: BoundingBox | null;
  }>;
  shifted: boolean;
  max_delta_x: number;
  max_delta_y: number;
  max_delta_width: number;
  max_delta_height: number;
}
