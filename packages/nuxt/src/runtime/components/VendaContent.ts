import { isEmptyDoc, isRichTextDoc, renderHtml, type RichTextDoc } from '@venda/richtext';
import { computed, defineComponent, h, type PropType } from 'vue';

/**
 * Renders a rich-text field (e.g. `entry.data.body`) from the Venda editor.
 *
 * Output is produced by Venda's renderer, which emits only known tags, escaped
 * text and safe URLs, so untrusted content cannot inject markup or scripts.
 * A render function is used because Vue's SSR drops `v-html` on dynamic
 * components, which would leave the body empty until hydration.
 */
export default defineComponent({
  name: 'VendaContent',
  props: {
    /** The field value: a rich-text document. */
    content: { type: Object as PropType<RichTextDoc | null>, default: null },
    as: { type: String, default: 'div' }
  },
  setup(props) {
    const html = computed(() => (isRichTextDoc(props.content) && !isEmptyDoc(props.content) ? renderHtml(props.content) : ''));
    return () => (html.value ? h(props.as, { class: 'venda-content', innerHTML: html.value }) : null);
  }
});
