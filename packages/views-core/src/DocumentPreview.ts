import { renderHtml, type RichTextDoc } from '@venda/richtext';
import { defineComponent, h, type PropType } from 'vue';

export default defineComponent({
  name: 'DocumentPreview',
  props: {
    // SAFETY: Vue's Object runtime validator cannot express a document's type;
    // the caller narrows the field with isRichTextDoc before passing it.
    content: { type: Object as PropType<RichTextDoc | null>, default: null }
  },
  setup(props) {
    // renderHtml escapes text and rejects unsafe URLs; raw repository HTML never reaches innerHTML.
    return () => props.content ? h('div', { class: 'preview-prose', innerHTML: renderHtml(props.content) }) : null;
  }
});
