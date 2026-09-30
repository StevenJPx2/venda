import { describe, expect, it } from 'vitest';
import { htmlToDoc, isEmptyDoc, isRichTextDoc, MAX_DEPTH, renderHtml, toDoc, toPlainText, trimTrailingEmpty, wordCount, type RichTextDoc, type RichTextNode } from '../src';

const text = (value: string, marks?: RichTextNode['marks']): RichTextNode => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });

describe('htmlToDoc', () => {
  it('converts TipTap editor output', () => {
    const html = '<h2>A heading</h2><p>Some <strong>bold</strong> and <em>italic</em> with a <a href="https://example.com" target="_blank">link</a>.</p><ul><li><p>one</p></li><li><p>two</p><ol start="3"><li><p>nested</p></li></ol></li></ul><blockquote><p>quoted</p></blockquote><pre><code class="language-ts">const a = 1;\n  indented</code></pre><hr><img src="https://cdn.test/a.png" alt="An image">';
    expect(htmlToDoc(html).content).toEqual([
      { type: 'heading', attrs: { level: 2 }, content: [text('A heading')] },
      { type: 'paragraph', content: [text('Some '), text('bold', [{ type: 'bold' }]), text(' and '), text('italic', [{ type: 'italic' }]), text(' with a '), text('link', [{ type: 'link', attrs: { href: 'https://example.com' } }]), text('.')] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [text('one')] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [text('two')] }, { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('nested')] }] }] }] }
      ] },
      { type: 'blockquote', content: [{ type: 'paragraph', content: [text('quoted')] }] },
      { type: 'codeBlock', attrs: { language: 'ts' }, content: [text('const a = 1;\n  indented')] },
      { type: 'horizontalRule' },
      { type: 'image', attrs: { src: 'https://cdn.test/a.png', alt: 'An image', title: null } }
    ]);
  });

  it('wraps loose inline content in paragraphs and collapses whitespace', () => {
    expect(htmlToDoc('  Hello\n   <b>world</b>  <div>block</div> tail ').content).toEqual([
      { type: 'paragraph', content: [text('Hello '), text('world', [{ type: 'bold' }])] },
      { type: 'paragraph', content: [text('block')] },
      { type: 'paragraph', content: [text('tail')] }
    ]);
  });

  it('decodes entities, keeps superscripts and line breaks', () => {
    expect(htmlToDoc('<p>Tom &amp; Jerry&#8217;s<sup>1</sup><br>next &lt;line&gt;</p>').content[0]).toEqual({
      type: 'paragraph', content: [text('Tom & Jerry’s'), text('1', [{ type: 'superscript' }]), { type: 'hardBreak' }, text('next <line>')]
    });
  });

  it('drops scripts, styles and comments but keeps unknown tags’ text', () => {
    expect(htmlToDoc('<p>a<script>alert(1)</script><!-- c --><custom-tag>b</custom-tag></p><style>p{}</style>').content).toEqual([{ type: 'paragraph', content: [text('ab')] }]);
  });

  it('survives malformed and deeply nested markup', () => {
    expect(htmlToDoc('<p><b>open <i>never closed</p></span><p>next').content.length).toBe(2);
    const deep = htmlToDoc('<div>'.repeat(MAX_DEPTH * 4) + 'deep' + '</div>'.repeat(MAX_DEPTH * 4));
    expect(isRichTextDoc(deep)).toBe(true);
    expect(toPlainText(deep)).toBe('deep');
  });
});

describe('renderHtml', () => {
  it('round-trips editor HTML', () => {
    const html = '<h3>Title</h3><p>A <strong><em>mix</em></strong> <code>x</code><br>line</p><ol start="2"><li><p>a</p></li></ol><pre><code class="language-js">1 &lt; 2</code></pre><hr>';
    expect(renderHtml(htmlToDoc(html))).toBe(html);
  });

  it('escapes text and only emits safe URLs', () => {
    const doc: RichTextDoc = { type: 'doc', content: [
      { type: 'paragraph', content: [text('<img src=x onerror=alert(1)>'), text('bad', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]), text('good', [{ type: 'link', attrs: { href: 'https://ok.test/?a="b"' } }])] },
      { type: 'image', attrs: { src: 'data:text/html,<script>', alt: 'x' } },
      { type: 'plugin-card', content: [{ type: 'paragraph', content: [text('child')] }] },
      { type: 'heading', attrs: { level: '9"><script>' }, content: [text('h')] }
    ] };
    expect(renderHtml(doc)).toBe('<p>&lt;img src=x onerror=alert(1)&gt;bad<a href="https://ok.test/?a=&quot;b&quot;" rel="noopener noreferrer">good</a></p><p>child</p><h2>h</h2>');
  });

  it('drops nesting beyond the depth limit instead of recursing forever', () => {
    let node: RichTextNode = text('x');
    for (let i = 0; i < MAX_DEPTH * 3; i++) node = { type: 'blockquote', content: [node] };
    expect(() => renderHtml({ type: 'doc', content: [node] })).not.toThrow();
  });
});

describe('document helpers', () => {
  it('validates structure within bounds', () => {
    expect(isRichTextDoc({ type: 'doc', content: [] })).toBe(true);
    expect(isRichTextDoc({ type: 'doc', content: [{ type: 'text' }] })).toBe(false);
    expect(isRichTextDoc({ type: 'doc', content: [{ type: 'paragraph', marks: 'bold' }] })).toBe(false);
    expect(isRichTextDoc('<p>html</p>')).toBe(false);
    let node: unknown = text('x');
    for (let i = 0; i <= MAX_DEPTH; i++) node = { type: 'blockquote', content: [node] };
    expect(isRichTextDoc({ type: 'doc', content: [node] })).toBe(false);
  });

  it('counts words, detects emptiness and trims trailing empty paragraphs', () => {
    const doc = htmlToDoc('<h2>Two words</h2><p>and <strong>three</strong> more</p><p></p><p><br></p>');
    expect(wordCount(doc)).toBe(5);
    expect(toPlainText(doc)).toBe('Two words\nand three more');
    expect(trimTrailingEmpty(doc).content.length).toBe(2);
    expect(isEmptyDoc(htmlToDoc('<p></p><p>&nbsp;</p>'))).toBe(true);
    expect(isEmptyDoc(htmlToDoc('<img src="https://a.test/i.png">'))).toBe(false);
  });

  it('reads stored values of either format', () => {
    expect(toDoc('<p>Hi</p>').content).toEqual([{ type: 'paragraph', content: [text('Hi')] }]);
    const doc: RichTextDoc = { type: 'doc', content: [] };
    expect(toDoc(doc)).toBe(doc);
    expect(toDoc(42)).toEqual({ type: 'doc', content: [] });
  });
});
