import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { describe, expect, it } from 'vitest';
import VendaContent from '../src/runtime/components/VendaContent';

function render(props: Record<string, unknown>, attrs: Record<string, unknown> = {}) {
  return renderToString(createSSRApp({ render: () => h(VendaContent, { ...props, ...attrs }) }));
}

describe('VendaContent (server-side rendering)', () => {
  it('renders the HTML into the server output, not just after hydration', async () => {
    const html = await render({ html: '<p>Hello <strong>edge</strong></p>' });
    expect(html).toBe('<div class="venda-content"><p>Hello <strong>edge</strong></p></div>');
  });

  it('uses the requested element and merges fallthrough classes', async () => {
    const html = await render({ html: '<h2>Title</h2>', as: 'article' }, { class: 'prose' });
    expect(html).toBe('<article class="venda-content prose"><h2>Title</h2></article>');
  });

  it('renders nothing for empty content', async () => {
    expect(await render({ html: '' })).toBe('<!---->');
    expect(await render({ html: null })).toBe('<!---->');
  });
});
