import { describe, expect, it } from 'vitest';
import { blockTypeOf } from '../src/blocks';
import {
  bodyKey,
  inTriangle,
  isTyping,
  near,
  overBody,
  titleKey
} from '../src/keys';

const key = (name: string, mods: Partial<KeyboardEvent> = {}) => ({
  key: name,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods
});

describe('keys', () => {
  it('counts writing as typing, but not shortcuts or bare modifiers', () => {
    expect(isTyping(key('a'))).toBe(true);
    expect(isTyping(key('a', { metaKey: true }))).toBe(false);
    expect(isTyping(key('Shift'))).toBe(false);
    expect(isTyping(key('a', { altKey: true }))).toBe(false);
  });

  it('links on Cmd or Ctrl and K in the body', () => {
    expect(bodyKey(key('k', { metaKey: true }))).toBe('link');
    expect(bodyKey(key('K', { ctrlKey: true }))).toBe('link');
    expect(bodyKey(key('b', { metaKey: true }))).toBe('none');
    expect(bodyKey(key('x'))).toBe('typing');
  });

  it('moves from the title on Enter, but not Shift and Enter', () => {
    expect(titleKey(key('Enter'))).toBe('next');
    expect(titleKey(key('Enter', { shiftKey: true }))).toBe('typing');
    expect(titleKey(key('s', { metaKey: true }))).toBe('none');
  });
});

describe('aiming at the handle', () => {
  const a = { x: 100, y: 50 };
  const b = { x: 0, y: 0 };
  const c = { x: 0, y: 100 };

  it('finds points inside the triangle, on its edge, and not outside', () => {
    expect(inTriangle({ x: 40, y: 50 }, a, b, c)).toBe(true);
    expect(inTriangle({ x: 0, y: 50 }, a, b, c)).toBe(true);
    expect(inTriangle({ x: 90, y: 5 }, a, b, c)).toBe(false);
  });

  it('measures nearness with slack, and counts the gutter as over the body', () => {
    const box = { left: 100, right: 200, top: 0, bottom: 50 };

    expect(near({ x: 98, y: 10 }, box)).toBe(false);
    expect(near({ x: 98, y: 10 }, box, 4)).toBe(true);
    expect(overBody({ x: 50, y: 10 }, box, 64)).toBe(true);
    expect(overBody({ x: 30, y: 10 }, box, 64)).toBe(false);
  });
});

describe('block types', () => {
  const node = (name: string, level?: number) => ({
    type: { name },
    attrs: level === undefined ? {} : { level }
  });

  it('names a block for the menu, and none for blocks without text', () => {
    expect(blockTypeOf(node('paragraph'))).toBe('paragraph');
    expect(blockTypeOf(node('heading', 2))).toBe('heading2');
    expect(blockTypeOf(node('heading', 3))).toBe('heading3');
    expect(blockTypeOf(node('codeBlock'))).toBe('codeBlock');
    expect(blockTypeOf(node('horizontalRule'))).toBeNull();
  });
});
