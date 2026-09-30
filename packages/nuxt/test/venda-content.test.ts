import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import VendaContent from '../src/runtime/components/VendaContent';

function render(props: Record<string, unknown>, attrs: Record<string, unknown> = {}) {
  return renderToString(createSSRApp({ render: () => h(VendaContent, { ...props, ...attrs }) }));
}

const doc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'edge', marks: [{ type: 'bold' }] }] }]
};

describe('VendaContent (server-side rendering)', () => {
  it('renders a document into the server output, not just after hydration', async () => {
    expect(await render({ content: doc })).toBe('<div class="venda-content"><p>Hello <strong>edge</strong></p></div>');
  });

  it('renders HTML stored by older installs through the same safe renderer', async () => {
    const html = await render({ content: '<h2>Title</h2><p onclick="steal()">text<script>alert(1)</script></p>', as: 'article' }, { class: 'prose' });
    expect(html).toBe('<article class="venda-content prose"><h2>Title</h2><p>text</p></article>');
  });

  it('renders nothing for empty content', async () => {
    expect(await render({ content: null })).toBe('<!---->');
    expect(await render({ content: { type: 'doc', content: [{ type: 'paragraph' }] } })).toBe('<!---->');
    expect(await render({ content: '' })).toBe('<!---->');
  });
});
