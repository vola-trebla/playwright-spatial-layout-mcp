#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';
import {
  extractBoundingBoxes,
  detectOcclusion,
  verifySpatialRelationships,
  computeViewportReflow,
  calculatePerceptualContrast,
  verifyStackingContext,
} from './spatial.js';
import { closeBrowser } from './browser.js';

const server = new McpServer({
  name: 'playwright-spatial-layout-mcp',
  version: '0.1.0',
});

const viewportSchema = z
  .object({
    width: z.number().int().min(320).max(3840).describe('Viewport width in px'),
    height: z.number().int().min(240).max(2160).describe('Viewport height in px'),
  })
  .optional()
  .describe('Viewport size (default: 1280×720)');

function errorResponse(err: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: `Error: ${err instanceof Error ? err.message : String(err)}`,
      },
    ],
    isError: true,
  };
}

server.registerTool(
  'extract_bounding_boxes',
  {
    description:
      'Returns the geometric position, size, z-index, and viewport visibility for one or more DOM elements. ' +
      'Use to answer: where exactly on screen is this element? Is it visible? Is it off-screen?',
    inputSchema: {
      url: z.string().url().describe('URL of the page to analyze'),
      selectors: z
        .array(z.string())
        .min(1)
        .max(20)
        .describe('CSS selectors or Playwright locator strings'),
      viewport: viewportSchema,
    },
  },
  async ({ url, selectors, viewport }) => {
    try {
      const result = await extractBoundingBoxes(url, selectors, viewport);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'detect_visual_occlusion',
  {
    description:
      'Checks if one element physically overlaps another by computing the intersection of their bounding boxes. ' +
      'Use to answer: is this button hidden under a sticky header? Does the cookie banner block the CTA?',
    inputSchema: {
      url: z.string().url().describe('URL of the page to analyze'),
      target_selector: z.string().describe('The element that might be occluded (e.g., the button)'),
      overlay_selector: z
        .string()
        .describe('The element that might be on top (e.g., the sticky header)'),
      viewport: viewportSchema,
    },
  },
  async ({ url, target_selector, overlay_selector, viewport }) => {
    try {
      const result = await detectOcclusion(url, target_selector, overlay_selector, viewport);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'verify_spatial_relationships',
  {
    description:
      "Validates a set of spatial layout rules — e.g. 'nav must be above hero', 'sidebar must be left of content'. " +
      'Returns pass/fail per rule with a human-readable reason. ' +
      'Use to answer: does the page layout match the design specification?',
    inputSchema: {
      url: z.string().describe('URL of the page to analyze'),
      rules: z
        .array(
          z.object({
            type: z
              .enum(['left_of', 'right_of', 'above', 'below', 'contains', 'not_overlapping'])
              .describe('Spatial relationship to assert'),
            element_a: z.string().describe('First element selector'),
            element_b: z.string().describe('Second element selector'),
          })
        )
        .min(1)
        .max(20)
        .describe('List of spatial rules to validate'),
      viewport: viewportSchema,
    },
  },
  async ({ url, rules, viewport }) => {
    try {
      const result = await verifySpatialRelationships(url, rules, viewport);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'compute_viewport_reflow',
  {
    description:
      'Measures how element positions and sizes change across multiple viewport sizes. ' +
      'Use to answer: does the layout break on mobile? Which elements shift most when resizing?',
    inputSchema: {
      url: z.string().describe('URL of the page to analyze'),
      selectors: z
        .array(z.string())
        .min(1)
        .max(10)
        .describe('CSS selectors to track across viewports'),
      viewports: z
        .array(
          z.object({
            width: z.number().int().min(320).max(3840),
            height: z.number().int().min(240).max(2160),
          })
        )
        .min(2)
        .max(6)
        .describe(
          'Viewport sizes to compare — e.g. [{width:375,height:812},{width:1280,height:720}]'
        ),
    },
  },
  async ({ url, selectors, viewports }) => {
    try {
      const result = await computeViewportReflow(url, selectors, viewports);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'calculate_perceptual_contrast',
  {
    description:
      'Measures color contrast between a text element and its background using both WCAG 2.x ' +
      'and APCA (WCAG 3.0 draft) formulas simultaneously. ' +
      'Use to answer: does this text pass accessibility contrast requirements? ' +
      'Is it actually readable even if it technically passes the legacy formula?',
    inputSchema: {
      url: z.string().url().describe('URL of the page to analyze'),
      text_selector: z.string().describe('CSS selector for the text element'),
      background_selector: z.string().describe('CSS selector for the background element'),
      viewport: viewportSchema,
    },
  },
  async ({ url, text_selector, background_selector, viewport }) => {
    try {
      const result = await calculatePerceptualContrast(
        url,
        text_selector,
        background_selector,
        viewport
      );
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

server.registerTool(
  'verify_stacking_context',
  {
    description:
      'Reveals the full CSS stacking context chain for an element — which ancestors create ' +
      'new stacking contexts and why. Use to answer: why is my z-index:9999 element still ' +
      'behind a modal? Does this element create its own stacking context?',
    inputSchema: {
      url: z.string().url().describe('URL of the page to analyze'),
      selector: z.string().describe('CSS selector for the element to inspect'),
      viewport: viewportSchema,
    },
  },
  async ({ url, selector, viewport }) => {
    try {
      const result = await verifyStackingContext(url, selector, viewport);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return errorResponse(err);
    }
  }
);

const shutdown = async () => {
  await closeBrowser();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const transport = new StdioServerTransport();
await server.connect(transport);
