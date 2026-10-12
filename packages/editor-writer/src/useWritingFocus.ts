// While someone writes, the controls around the text fade away; a deliberate
// pointer move or Escape brings them back.
import { onBeforeUnmount, onMounted, shallowRef } from 'vue';
import type { Point } from './handle';

// Sub-pixel jitter is not a decision to reach for a control.
const JITTER_PX = 4;

export function useWritingFocus() {
  const typing = shallowRef(false);
  let last: Point | null = null;

  function onPointerMove(event: PointerEvent): void {
    const moved = last
      ? Math.hypot(event.clientX - last.x, event.clientY - last.y)
      : 0;

    if (moved > JITTER_PX) typing.value = false;

    last = { x: event.clientX, y: event.clientY };
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') typing.value = false;
  }

  onMounted(() => {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('keydown', onKeydown);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('keydown', onKeydown);
  });

  return { typing, start: () => (typing.value = true) };
}
