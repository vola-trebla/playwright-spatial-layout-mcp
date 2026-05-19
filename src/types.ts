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
  position_relative_to_parent: { x: number; y: number } | null;
}

export interface OcclusionResult {
  target: string;
  overlay: string;
  target_box: BoundingBox | null;
  overlay_box: BoundingBox | null;
  is_occluded: boolean;
  functional_occlusion: boolean;
  intersection_ratio: number;
  occluded_area_px: number;
  overlay_pointer_events_active: boolean;
  overlay_clip_path_applied: boolean;
}

export interface SpatialRule {
  type: 'left_of' | 'right_of' | 'above' | 'below' | 'contains' | 'not_overlapping';
  element_a: string;
  element_b: string;
}

export interface RuleResult {
  rule: SpatialRule;
  passed: boolean;
  reason: string;
}

export interface ReflowSnapshot {
  viewport: { width: number; height: number };
  box: BoundingBox | null;
  is_visible: boolean;
  position_relative_to_parent: { x: number; y: number } | null;
}

export interface ReflowResult {
  selector: string;
  snapshots: ReflowSnapshot[];
  shifted: boolean;
  max_delta_x: number;
  max_delta_y: number;
  max_delta_width: number;
  max_delta_height: number;
}

export interface StackingContextResult {
  selector: string;
  found: boolean;
  creates_stacking_context: boolean;
  context_triggers: string[];
  effective_z_index: string;
  stacking_context_root: string;
  ancestor_contexts: Array<{
    selector_path: string;
    triggers: string[];
    z_index: string;
  }>;
}
