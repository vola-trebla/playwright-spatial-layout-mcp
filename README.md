# playwright-spatial-layout-mcp 🐸📐

[![npm version](https://img.shields.io/npm/v/playwright-spatial-layout-mcp.svg)](https://www.npmjs.com/package/playwright-spatial-layout-mcp)
[![npm downloads](https://img.shields.io/npm/dm/playwright-spatial-layout-mcp.svg)](https://www.npmjs.com/package/playwright-spatial-layout-mcp)
[![CI](https://github.com/vola-trebla/playwright-spatial-layout-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/vola-trebla/playwright-spatial-layout-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An MCP server that gives AI agents **geometric spatial awareness** of web page layouts using Playwright.

AI agents can read the DOM and know a button exists — but they can't see that it's hidden under a sticky header, pushed off-screen by a broken CSS rule, or overlapping another element on mobile. This MCP fixes that by exposing real bounding box mathematics from a live browser.

---

## 🤔 The Problem

When an AI agent analyzes a Playwright test failure, it reads the accessibility tree:

> _"The Submit button exists in the DOM. It has role=button. It is visible."_

What it **cannot** see:

- 🙈 The button is at `y: 1450px` — below the fold on mobile
- 🙈 A cookie banner overlaps it by 73%, making it unclickable
- 🙈 On a 375px viewport the nav and hero section overlap each other
- 🙈 An element shifted 200px to the right after a CSS refactor

`playwright-spatial-layout-mcp` gives the agent coordinates, intersection ratios, and layout shift data so it can reason about the **rendered page** — not just the markup.

---

## 🛠️ Tools

### `extract_bounding_boxes`

Returns position, size, z-index, and viewport visibility for one or more elements.

```json
{
  "url": "https://your-app.com",
  "selectors": ["header", ".hero-cta", "footer"],
  "viewport": { "width": 375, "height": 812 }
}
```

```json
[
  {
    "selector": ".hero-cta",
    "box": { "x": 16, "y": 892, "width": 343, "height": 48 },
    "z_index": "auto",
    "is_visible": true,
    "is_in_viewport": false
  }
]
```

---

### `detect_visual_occlusion`

Checks if one element physically overlaps another by computing bounding box intersection.

```json
{
  "url": "https://your-app.com",
  "target_selector": ".checkout-button",
  "overlay_selector": ".cookie-banner"
}
```

```json
{
  "is_occluded": true,
  "intersection_ratio": 0.61,
  "occluded_area_px": 4128
}
```

---

### `verify_spatial_relationships`

Validates a set of layout rules and returns pass/fail with a human-readable reason per rule.

Supported rule types: `left_of` · `right_of` · `above` · `below` · `contains` · `not_overlapping`

```json
{
  "url": "https://your-app.com",
  "rules": [
    { "type": "above", "element_a": "nav", "element_b": ".hero" },
    { "type": "not_overlapping", "element_a": ".sidebar", "element_b": ".main-content" }
  ]
}
```

```json
{
  "passed": false,
  "results": [
    { "passed": true, "reason": "'nav' bottom (64px) is above '.hero' top (64px)" },
    { "passed": false, "reason": "'.sidebar' and '.main-content' overlap by 12%" }
  ]
}
```

---

### `compute_viewport_reflow`

Measures how element positions and sizes change across multiple viewport sizes.

```json
{
  "url": "https://your-app.com",
  "selectors": ["nav", ".hero", ".cta-button"],
  "viewports": [
    { "width": 375, "height": 812 },
    { "width": 768, "height": 1024 },
    { "width": 1280, "height": 720 }
  ]
}
```

```json
[
  {
    "selector": ".cta-button",
    "shifted": true,
    "max_delta_x": 442,
    "max_delta_y": 318,
    "max_delta_width": 897,
    "max_delta_height": 0
  }
]
```

---

## 🚀 Installation

```bash
npx playwright-spatial-layout-mcp
```

Or install globally:

```bash
npm install -g playwright-spatial-layout-mcp
npx playwright install chromium
```

### Claude Desktop config

```json
{
  "mcpServers": {
    "playwright-spatial-layout-mcp": {
      "command": "npx",
      "args": ["-y", "playwright-spatial-layout-mcp"]
    }
  }
}
```

---

## 💡 Example Agent Prompts

> _"Check if the cookie banner is blocking the checkout button on mobile (375px viewport)"_

> _"Verify that the navigation is above the hero section and the sidebar doesn't overlap the main content"_

> _"Show me which elements shift the most when resizing from desktop to mobile"_

> _"Is the promotional modal covering the primary CTA on iPad viewport?"_

---

## 🔗 Related Projects

- [playwright-trace-decoder-mcp](https://github.com/vola-trebla/playwright-trace-decoder-mcp) — root-cause analysis of CI failures from Playwright traces
- [flakiness-knowledge-graph-mcp](https://github.com/vola-trebla/flakiness-knowledge-graph-mcp) — knowledge graph of flaky test patterns
- [ast-impact-mapper-mcp](https://github.com/vola-trebla/ast-impact-mapper-mcp) — find affected tests from code changes via TypeScript AST
- [zod-contract-mock-forge-mcp](https://github.com/vola-trebla/zod-contract-mock-forge-mcp) — deterministic mock generation from Zod schemas

---

## 📄 License

MIT © [vola-trebla](https://github.com/vola-trebla)
