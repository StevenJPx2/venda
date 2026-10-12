// What a key or a pointer means to the writer, decided from the event alone,
// so the components only carry out the answer.
import type { Point } from './handle';

type Key = Pick<
  KeyboardEvent,
  'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'
>;

const MODIFIER_KEYS = new Set(['Shift', 'Meta', 'Control', 'Alt']);

const withCommand = (event: Key) => event.metaKey || event.ctrlKey;

/** A key that writes (not a shortcut, not a bare modifier) puts the chrome away. */
export const isTyping = (event: Key) =>
  !withCommand(event) && !event.altKey && !MODIFIER_KEYS.has(event.key);

/** In the body: Cmd or Ctrl and K links the selection; other writing hides the chrome. */
export function bodyKey(event: Key): 'link' | 'typing' | 'none' {
  if (withCommand(event))
    return event.key.toLowerCase() === 'k' ? 'link' : 'none';

  return 'typing';
}

/** In the title: Enter (without Shift) moves to the body; other writing hides the chrome. */
export function titleKey(event: Key): 'next' | 'typing' | 'none' {
  if (event.key === 'Enter' && !event.shiftKey) return 'next';

  return withCommand(event) ? 'none' : 'typing';
}

const side = (p: Point, a: Point, b: Point) =>
  (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);

/** Whether `p` lies in the triangle a, b, c (on an edge counts). */
export function inTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const signs = [side(p, a, b), side(p, b, c), side(p, c, a)];

  return !(signs.some(d => d < 0) && signs.some(d => d > 0));
}

interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** Whether `p` is inside the box grown by `slack` on every side. */
export const near = (p: Point, box: Box, slack = 0) =>
  p.x >= box.left - slack &&
  p.x <= box.right + slack &&
  p.y >= box.top - slack &&
  p.y <= box.bottom + slack;

/** Whether `p` is over the body, or the gutter left of it where the handle sits. */
export const overBody = (p: Point, box: Box, gutter: number) =>
  near(p, { ...box, left: box.left - gutter });
