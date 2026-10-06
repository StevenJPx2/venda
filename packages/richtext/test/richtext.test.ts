import { describe, expect, it } from 'vitest';
import { isEmptyDoc, isRichTextDoc, MAX_DEPTH, renderHtml, toPlainText, trimTrailingEmpty, wordCount, type RichTextDoc, type RichTextNode } from '../src';

const text = (value: string, marks?: RichTextNode['marks']): RichTextNode => (marks ? { type: 'text', text: value, marks } : { type: 'text', text: value });

const paragraph = (...content: RichTextNode[]): RichTextNode => (content.length ? { type: 'paragraph', content } : { type: 'paragraph' });

const doc = (...content: RichTextNode[]): RichTextDoc => ({ type: 'doc', content });

describe('renderHtml', () => {
  it('renders blocks, marks and lists', () => {
    const rendered = renderHtml(doc(
      { type: 'heading', attrs: { level: 3 }, content: [text('Title')] },
      paragraph(text('A '), text('mix', [{ type: 'bold' }, { type: 'italic' }]), text(' '), text('x', [{ type: 'code' }]), { type: 'hardBreak' }, text('line')),
      { type: 'orderedList', attrs: { start: 2 }, content: [{ type: 'listItem', content: [paragraph(text('a'))] }] },
      { type: 'codeBlock', attrs: { language: 'js' }, content: [text('1 < 2')] },
      { type: 'horizontalRule' }
    ));

    expect(rendered).toBe('<h3>Title</h3><p>A <strong><em>mix</em></strong> <code>x</code><br>line</p><ol start="2"><li><p>a</p></li></ol><pre><code class="language-js">1 &lt; 2</code></pre><hr>');
  });

  it('escapes text and only emits safe URLs', () => {
    const unsafe = doc(
      paragraph(text('<img src=x onerror=alert(1)>'), text('bad', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]), text('good', [{ type: 'link', attrs: { href: 'https://ok.test/?a="b"' } }])),
      { type: 'image', attrs: { src: 'data:text/html,<script>', alt: 'x' } },
      { type: 'plugin-card', content: [paragraph(text('child'))] },
      { type: 'heading', attrs: { level: '9"><script>' }, content: [text('h')] }
    );

    expect(renderHtml(unsafe)).toBe('<p>&lt;img src=x onerror=alert(1)&gt;bad<a href="https://ok.test/?a=&quot;b&quot;" rel="noopener noreferrer">good</a></p><p>child</p><h2>h</h2>');
  });

  it('drops nesting beyond the depth limit instead of recursing forever', () => {
    let node: RichTextNode = text('x');

    for (let i = 0; i < MAX_DEPTH * 3; i++) node = { type: 'blockquote', content: [node] };

    expect(() => renderHtml(doc(node))).not.toThrow();
  });
});

describe('document helpers', () => {
  it('validates structure within bounds', () => {
    expect(isRichTextDoc(doc())).toBe(true);
    expect(isRichTextDoc({ type: 'doc', content: [{ type: 'text' }] })).toBe(false);
    expect(isRichTextDoc({ type: 'doc', content: [{ type: 'paragraph', marks: 'bold' }] })).toBe(false);
    expect(isRichTextDoc('<p>html</p>')).toBe(false);

    let node: unknown = text('x');

    for (let i = 0; i <= MAX_DEPTH; i++) node = { type: 'blockquote', content: [node] };

    expect(isRichTextDoc({ type: 'doc', content: [node] })).toBe(false);
  });

  it('counts words, detects emptiness and trims trailing empty paragraphs', () => {
    const written = doc(
      { type: 'heading', attrs: { level: 2 }, content: [text('Two words')] },
      paragraph(text('and '), text('three', [{ type: 'bold' }]), text(' more')),
      paragraph(),
      paragraph({ type: 'hardBreak' })
    );

    expect(wordCount(written)).toBe(5);
    expect(toPlainText(written)).toBe('Two words\nand three more');
    expect(trimTrailingEmpty(written).content.length).toBe(2);
    expect(isEmptyDoc(doc(paragraph(), paragraph(text('\u00a0'))))).toBe(true);
    expect(isEmptyDoc(doc({ type: 'image', attrs: { src: 'https://a.test/i.png' } }))).toBe(false);
  });
});
