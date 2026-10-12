import { describe, expect, it } from 'vitest';
import {
  keepsDocument,
  keepUnknown,
  restoreKept,
  type EditorSchema,
  type RichTextDoc
} from '../src';

const schema: EditorSchema = {
  hasNode: type =>
    [
      'paragraph',
      'text',
      'heading',
      'vendaKeptBlock',
      'vendaKeptInline'
    ].includes(type),
  hasMark: type => ['bold', 'link'].includes(type),
  holdsInline: type => type === 'paragraph' || type === 'heading'
};

const doc: RichTextDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Hi ' },
        { type: 'text', text: 'up', marks: [{ type: 'superscript' }] },
        { type: 'inlineBlock', attrs: { name: 'Badge' } }
      ]
    },
    {
      type: 'block',
      attrs: { name: 'Callout' },
      content: [{ type: 'paragraph' }]
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Title' }]
    }
  ]
};

describe('keeping what an editor cannot hold', () => {
  it('does not merge adjacent links whose destinations differ', () => {
    const original: RichTextDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'one',
              marks: [{ type: 'link', attrs: { href: '/one' } }]
            },
            {
              type: 'text',
              text: 'two',
              marks: [{ type: 'link', attrs: { href: '/two' } }]
            }
          ]
        }
      ]
    };
    const altered: RichTextDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'onetwo',
              marks: [{ type: 'link', attrs: { href: '/one' } }]
            }
          ]
        }
      ]
    };

    expect(keepsDocument(original, altered)).toBe(false);
    expect(keepsDocument(original, original)).toBe(true);
  });
  it('wraps unknown nodes and marks, and restores them exactly', () => {
    const kept = keepUnknown(doc, schema);

    expect(kept.content.map(node => node.type)).toEqual([
      'paragraph',
      'vendaKeptBlock',
      'heading'
    ]);
    expect(kept.content[0]?.content?.map(node => node.type)).toEqual([
      'text',
      'vendaKeptInline',
      'vendaKeptInline'
    ]);
    expect(restoreKept(kept)).toEqual(doc);
  });

  it('drops the empty paragraph an editor appends after a final block', () => {
    const held = keepUnknown(doc, schema);
    const appended = {
      type: 'doc' as const,
      content: [...held.content, { type: 'paragraph' }]
    };

    expect(keepsDocument(doc, restoreKept(appended))).toBe(true);
    expect(restoreKept(appended)).toEqual(doc);
  });

  it('accepts what an editor adds, and refuses what it changes or drops', () => {
    const withDefaults: RichTextDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hi' },
            { type: 'text', text: ' there', marks: [] }
          ]
        },
        {
          type: 'heading',
          attrs: { level: 2, id: null, textAlign: 'left' },
          content: [{ type: 'text', text: 'Title' }]
        }
      ]
    };
    const original: RichTextDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hi there' }] },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Title' }]
        }
      ]
    };

    expect(keepsDocument(original, withDefaults)).toBe(true);
    expect(
      keepsDocument(original, {
        type: 'doc',
        content: [
          original.content[0]!,
          { ...original.content[1]!, attrs: { level: 3 } }
        ]
      })
    ).toBe(false);
    expect(
      keepsDocument(original, { type: 'doc', content: [original.content[0]!] })
    ).toBe(false);
  });
});
