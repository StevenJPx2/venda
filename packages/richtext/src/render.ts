import {
  MAX_DEPTH,
  type RichTextDoc,
  type RichTextMark,
  type RichTextNode
} from './types';

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const SAFE_LINK = /^(https?:|mailto:|tel:|\/|#)/i;
const SAFE_IMAGE = /^(https?:|\/)/i;

/** A URL safe to place in an attribute, or null (e.g. `javascript:` links). */
function safeUrl(value: unknown, pattern: RegExp): string | null {
  if (typeof value !== 'string') return null;

  const url = value.trim();
  return pattern.test(url) ? url : null;
}

const MARK_TAGS: Record<string, string> = {
  bold: 'strong',
  italic: 'em',
  strike: 's',
  underline: 'u',
  code: 'code',
  superscript: 'sup',
  subscript: 'sub'
};

function openMark(mark: RichTextMark): [string, string] {
  if (mark.type === 'link') {
    const href = safeUrl(mark.attrs?.href, SAFE_LINK);

    if (!href) return ['', ''];

    const external = /^https?:/i.test(href);
    return [
      `<a href="${escapeHtml(href)}"${external ? ' rel="noopener noreferrer"' : ''}>`,
      '</a>'
    ];
  }

  const tag = MARK_TAGS[mark.type];
  return tag ? [`<${tag}>`, `</${tag}>`] : ['', ''];
}

function renderText(node: RichTextNode): string {
  let html = escapeHtml(node.text ?? '');

  // marks[0] is the outermost element, so wrap from the innermost outwards.
  for (const mark of [...(node.marks ?? [])].reverse()) {
    const [open, close] = openMark(mark);
    html = `${open}${html}${close}`;
  }

  return html;
}

function headingLevel(node: RichTextNode): number {
  const level = Number(node.attrs?.level);
  return Number.isInteger(level) && level >= 1 && level <= 6 ? level : 2;
}

function renderImage(node: RichTextNode): string {
  const src = safeUrl(node.attrs?.src, SAFE_IMAGE);

  if (!src) return '';

  const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';
  const title =
    typeof node.attrs?.title === 'string'
      ? ` title="${escapeHtml(node.attrs.title)}"`
      : '';
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"${title} loading="lazy">`;
}

function wrap(node: RichTextNode, inner: string): string {
  switch (node.type) {
    case 'paragraph':
      return `<p>${inner}</p>`;
    case 'heading':
      return `<h${headingLevel(node)}>${inner}</h${headingLevel(node)}>`;
    case 'blockquote':
      return `<blockquote>${inner}</blockquote>`;
    case 'bulletList':
      return `<ul>${inner}</ul>`;

    case 'orderedList': {
      const start = Number(node.attrs?.start);
      return Number.isInteger(start) && start > 1
        ? `<ol start="${start}">${inner}</ol>`
        : `<ol>${inner}</ol>`;
    }

    case 'listItem':
      return `<li>${inner}</li>`;

    case 'codeBlock': {
      const language =
        typeof node.attrs?.language === 'string' &&
        /^[\w+-]{1,32}$/.test(node.attrs.language)
          ? ` class="language-${node.attrs.language}"`
          : '';
      return `<pre><code${language}>${inner}</code></pre>`;
    }

    // Unknown node types (e.g. from plugins) render their children only.
    default:
      return inner;
  }
}

/**
 * Renders a document to HTML. Output contains only the tags above, escaped
 * text, and http(s)/mailto/tel/relative URLs, so it is safe to insert as-is.
 */
export function renderHtml(doc: RichTextDoc): string {
  // Nesting deeper than MAX_DEPTH is dropped, so even an unvalidated document cannot exhaust the stack.
  const renderNode = (node: RichTextNode, depth: number): string => {
    if (depth > MAX_DEPTH) return '';
    if (node.type === 'text') return renderText(node);
    if (node.type === 'hardBreak') return '<br>';
    if (node.type === 'horizontalRule') return '<hr>';
    if (node.type === 'image') return renderImage(node);

    return wrap(
      node,
      (node.content ?? []).map(child => renderNode(child, depth + 1)).join('')
    );
  };

  return doc.content.map(node => renderNode(node, 1)).join('');
}
