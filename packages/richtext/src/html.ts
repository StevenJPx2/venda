import { MAX_DEPTH, type RichTextDoc, type RichTextMark, type RichTextNode } from './types';

// Converts the HTML subset produced by rich-text editors (TipTap, and Venda's
// Sanity/WordPress importers) into a document. Unknown tags keep their text.

interface Element { tag: string; attrs: Record<string, string>; children: Child[] }
type Child = Element | { text: string };

const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr']);
const DROP = new Set(['script', 'style', 'template', 'noscript', 'iframe', 'object']);
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', copy: '©' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const point = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function parseAttrs(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [, name, double, single, bare] of source.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    if (name) attrs[name.toLowerCase()] = decodeEntities(double ?? single ?? bare ?? '');
  }
  return attrs;
}

/** Builds an element tree; mismatched closing tags are ignored and nesting is capped. */
function parseTree(html: string): Element {
  const root: Element = { tag: '#root', attrs: {}, children: [] };
  const stack: Element[] = [root];
  let dropping: string | null = null;
  for (const [token, closing, tag, rest] of html.matchAll(/<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|[^<]+|</g)) {
    const current = stack[stack.length - 1]!;
    if (!tag) {
      if (!dropping && !token.startsWith('<!--')) current.children.push({ text: decodeEntities(token) });
      continue;
    }
    const name = tag.toLowerCase();
    if (dropping) {
      if (closing && name === dropping) dropping = null;
      continue;
    }
    if (closing) {
      const index = stack.map(el => el.tag).lastIndexOf(name);
      if (index > 0) stack.length = index;
      continue;
    }
    if (DROP.has(name)) { dropping = name; continue; }
    const element: Element = { tag: name, attrs: parseAttrs(rest ?? ''), children: [] };
    current.children.push(element);
    if (!VOID.has(name) && !rest?.trimEnd().endsWith('/') && stack.length < MAX_DEPTH) stack.push(element);
  }
  return root;
}

const INLINE_MARKS: Record<string, string> = { strong: 'bold', b: 'bold', em: 'italic', i: 'italic', s: 'strike', del: 'strike', strike: 'strike', u: 'underline', code: 'code', sup: 'superscript', sub: 'subscript' };
const BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'pre', 'hr', 'img', 'div', 'section', 'article', 'figure', 'figcaption', 'header', 'footer', 'main', 'aside', 'table', 'tbody', 'thead', 'tr', 'td', 'th']);

const isElement = (child: Child): child is Element => 'tag' in child;

function sameMarks(a: RichTextMark[] = [], b: RichTextMark[] = []): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Inline content with marks; whitespace collapses as a browser would. */
function inlineNodes(children: Child[], marks: RichTextMark[], out: RichTextNode[]): void {
  for (const child of children) {
    if (!isElement(child)) {
      const text = child.text.replace(/[ \t\r\n\f]+/g, ' ');
      if (!text) continue;
      const last = out[out.length - 1];
      if (last?.type === 'text' && sameMarks(last.marks, marks)) last.text += text;
      else out.push({ type: 'text', text, ...(marks.length ? { marks } : {}) });
    } else if (child.tag === 'br') {
      out.push({ type: 'hardBreak' });
    } else if (child.tag === 'a' && child.attrs.href) {
      inlineNodes(child.children, [...marks, { type: 'link', attrs: { href: child.attrs.href } }], out);
    } else {
      const mark = INLINE_MARKS[child.tag];
      inlineNodes(child.children, mark && !marks.some(m => m.type === mark) ? [...marks, { type: mark }] : marks, out);
    }
  }
}

/** Trims collapsed whitespace at the edges of a line of inline content. */
function trimInline(nodes: RichTextNode[]): RichTextNode[] {
  const first = nodes[0];
  if (first?.type === 'text') first.text = first.text!.replace(/^ +/, '');
  const last = nodes[nodes.length - 1];
  if (last?.type === 'text') last.text = last.text!.replace(/ +$/, '');
  return nodes.filter(node => node.type !== 'text' || node.text);
}

function paragraph(children: Child[]): RichTextNode | null {
  const inline: RichTextNode[] = [];
  inlineNodes(children, [], inline);
  const content = trimInline(inline);
  return content.length ? { type: 'paragraph', content } : null;
}

function textContent(children: Child[]): string {
  return children.map(child => (isElement(child) ? (child.tag === 'br' ? '\n' : textContent(child.children)) : child.text)).join('');
}

function blockNode(el: Element): RichTextNode[] {
  const heading = /^h([1-6])$/.exec(el.tag);
  if (heading) {
    const inline: RichTextNode[] = [];
    inlineNodes(el.children, [], inline);
    return [{ type: 'heading', attrs: { level: Number(heading[1]) }, content: trimInline(inline) }];
  }
  switch (el.tag) {
    case 'p': { const p = paragraph(el.children); return p ? [p] : []; }
    case 'blockquote': return [{ type: 'blockquote', content: blocks(el.children) }];
    case 'ul': return [{ type: 'bulletList', content: listItems(el) }];
    case 'ol': {
      const start = Number(el.attrs.start);
      return [{ type: 'orderedList', attrs: { start: Number.isInteger(start) && start > 0 ? start : 1 }, content: listItems(el) }];
    }
    case 'li': return [{ type: 'listItem', content: blocks(el.children) }];
    case 'pre': {
      const code = el.children.find(isElement);
      const language = code?.attrs.class?.match(/language-([\w+-]+)/)?.[1] ?? null;
      const text = textContent(el.children).replace(/\n$/, '');
      return [{ type: 'codeBlock', attrs: { language }, ...(text ? { content: [{ type: 'text', text }] } : {}) }];
    }
    case 'hr': return [{ type: 'horizontalRule' }];
    case 'img': return el.attrs.src ? [{ type: 'image', attrs: { src: el.attrs.src, alt: el.attrs.alt ?? null, title: el.attrs.title ?? null } }] : [];
    // Layout wrappers contribute their content.
    default: return blocks(el.children);
  }
}

function listItems(list: Element): RichTextNode[] {
  return list.children.filter(isElement).flatMap(child => (child.tag === 'li' ? blockNode(child) : []));
}

/** Block content: runs of inline content between blocks become paragraphs. */
function blocks(children: Child[]): RichTextNode[] {
  const out: RichTextNode[] = [];
  let run: Child[] = [];
  const flush = () => {
    const p = paragraph(run);
    if (p) out.push(p);
    run = [];
  };
  for (const child of children) {
    if (isElement(child) && BLOCKS.has(child.tag)) {
      flush();
      out.push(...blockNode(child));
    } else {
      run.push(child);
    }
  }
  flush();
  return out;
}

export function htmlToDoc(html: string): RichTextDoc {
  return { type: 'doc', content: blocks(parseTree(html).children) };
}
