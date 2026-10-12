import type { Ref } from 'vue';

const KEY = 'venda.sidebar';

/** How near the left edge the pointer brings a hidden sidebar back, in px. */
export const EDGE = 40;

/** How far past the sidebar the pointer may stray before it hides again, in px. */
export const SLACK = 32;

export type SidebarState = 'shown' | 'peek' | 'hidden';

/** Whether the pointer at `x` brings the sidebar out, keeps it out, or sends it away. */
export function peekAt(
  x: number,
  peeking: boolean,
  width: number
): 'open' | 'stay' | 'close' {
  if (x <= EDGE) return 'open';

  if (!peeking) return 'stay';

  return x > width + SLACK ? 'close' : 'stay';
}

/**
 * The desktop sidebar: shown or hidden by its toggle or Cmd+\ (Ctrl+\), a
 * choice kept between visits. Opening an entry hides it for the writing; the
 * toggle brings it back for that entry only. A keyboard toggle is instant;
 * anything the pointer does slides.
 */
export function useSidebar(writing: Ref<boolean>) {
  const kept = ref(localStorage.getItem(KEY) !== 'hidden');
  const whileWriting = ref(false);
  const peeking = ref(false);
  const instant = ref(false);

  const shown = computed(() =>
    writing.value ? whileWriting.value : kept.value
  );
  const state = computed<SidebarState>(() =>
    shown.value ? 'shown' : peeking.value ? 'peek' : 'hidden'
  );

  watch(writing, () => {
    whileWriting.value = false;
    peeking.value = false;
  });

  function toggle(byKeyboard = false) {
    instant.value = byKeyboard;
    peeking.value = false;

    if (writing.value) {
      whileWriting.value = !whileWriting.value;
      return;
    }

    kept.value = !kept.value;
    localStorage.setItem(KEY, kept.value ? 'shown' : 'hidden');
  }

  function peek(on: boolean) {
    instant.value = false;
    peeking.value = on;
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== '\\' || !(event.metaKey || event.ctrlKey)) return;

    event.preventDefault();
    toggle(true);
  };

  onMounted(() => window.addEventListener('keydown', onKey));
  onUnmounted(() => window.removeEventListener('keydown', onKey));

  return { state, peeking, instant, toggle, peek };
}
