import type { Ref } from 'vue';

const KEY = 'venda.sidebar';

/**
 * The desktop sidebar: shown or hidden by its toggle or Cmd+\ (Ctrl+\), a
 * choice kept between visits. Opening an entry hides it for the writing; the
 * toggle brings it back for that entry only. While hidden, the pointer at the
 * left edge shows it over the page until the pointer leaves it.
 */
export function useSidebar(writing: Ref<boolean>) {
  const kept = ref(localStorage.getItem(KEY) !== 'hidden');
  const whileWriting = ref(false);
  const peeking = ref(false);

  const shown = computed(() =>
    writing.value ? whileWriting.value : kept.value
  );
  const state = computed(() =>
    shown.value ? 'shown' : peeking.value ? 'peek' : 'hidden'
  );

  watch(writing, () => {
    whileWriting.value = false;
    peeking.value = false;
  });

  function toggle() {
    peeking.value = false;

    if (writing.value) {
      whileWriting.value = !whileWriting.value;
      return;
    }

    kept.value = !kept.value;
    localStorage.setItem(KEY, kept.value ? 'shown' : 'hidden');
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== '\\' || !(event.metaKey || event.ctrlKey)) return;

    event.preventDefault();
    toggle();
  };

  onMounted(() => window.addEventListener('keydown', onKey));
  onUnmounted(() => window.removeEventListener('keydown', onKey));

  return { shown, state, peeking, toggle };
}
