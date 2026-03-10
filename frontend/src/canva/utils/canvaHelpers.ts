/**
 * canvaHelpers.ts
 *
 * Wraps @canva/design SDK calls with correct API for @canva/design v2.x
 *
 * Key facts about the current SDK:
 *  - addNativeElement() is gone; use addElementAtPoint() / addElementAtCursor()
 *  - Text element: { type: "text", children: ["string"], color: "#rrggbb", ... }
 *  - color is a plain hex STRING (not an RGBA object)
 *  - children is an ARRAY OF STRINGS, not objects
 */
import { addElementAtPoint, addElementAtCursor } from '@canva/design';

export type FontWeight = 'normal' | 'bold';

export interface TextOptions {
  text: string;
  /** Canva does not support per-element fontSize via addElementAtPoint; text takes Canva default size. */
  fontWeight?: FontWeight;
  /** Hex colour string e.g. "#7c3aed" */
  color?: string;
  textAlign?: 'start' | 'center' | 'end';
}

/**
 * Insert a text element into the active Canva design.
 * Canva places the element in the centre of the current viewport.
 * Calls addElementAtPoint first; falls back to addElementAtCursor on older design types.
 */
export async function insertText(opts: TextOptions): Promise<void> {
  const element = {
    type: 'text' as const,
    children:   [opts.text],
    color:      opts.color      ?? '#1a1a1a',
    fontWeight: opts.fontWeight ?? 'normal',
    textAlign:  opts.textAlign  ?? ('start' as const),
  };

  // addElementAtPoint works in fixed-dimension design types (posters, presentations).
  // addElementAtCursor works in document types (Canva Docs).
  // Try addElementAtPoint first; if the runtime rejects it, fall back.
  try {
    await addElementAtPoint(element);
  } catch {
    await addElementAtCursor(element);
  }
}

/**
 * Insert multiple text elements sequentially.
 * Each call produces a separate text box in the design.
 */
export async function insertTextGroup(items: TextOptions[]): Promise<void> {
  for (const item of items) {
    await insertText(item);
  }
}

/**
 * Returns true when the current environment IS the Canva iframe.
 * Outside Canva (e.g. a plain browser tab) the SDK will throw on first use.
 */
export function isInsideCanva(): boolean {
  try {
    return typeof window !== 'undefined' &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      !!(window as any).__canva_sdk_ready;
  } catch {
    return false;
  }
}
