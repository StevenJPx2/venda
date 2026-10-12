import { expect, it } from 'vitest';
import { EDGE, SLACK, peekAt } from '../app/utils/sidebar';

const WIDTH = 232;

it('brings the sidebar out when the pointer reaches the left edge', () => {
  expect(peekAt(0, false, WIDTH)).toBe('open');
  expect(peekAt(EDGE, false, WIDTH)).toBe('open');
  expect(peekAt(EDGE + 1, false, WIDTH)).toBe('stay');
});

it('keeps it out over it and just past it, and sends it away beyond', () => {
  expect(peekAt(120, true, WIDTH)).toBe('stay');
  expect(peekAt(WIDTH + SLACK, true, WIDTH)).toBe('stay');
  expect(peekAt(WIDTH + SLACK + 1, true, WIDTH)).toBe('close');
});

it('leaves a hidden sidebar alone away from the edge', () => {
  expect(peekAt(900, false, WIDTH)).toBe('stay');
});
