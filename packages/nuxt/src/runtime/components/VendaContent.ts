import { defineComponent, h, type PropType } from 'vue';

/**
 * Renders an HTML field (e.g. `entry.data.body`) written in the Venda editor.
 *
 * A render function is used instead of `<component :is v-html>` because Vue's
 * SSR drops `v-html` on dynamic components, leaving the body empty until
 * hydration. The HTML is not sanitized: only render content from a Venda
 * instance whose admin accounts you trust.
 */
export default defineComponent({
  name: 'VendaContent',
  props: {
    html: { type: String as PropType<string | null>, default: '' },
    as: { type: String, default: 'div' }
  },
  setup(props) {
    return () => (props.html ? h(props.as, { class: 'venda-content', innerHTML: props.html }) : null);
  }
});
