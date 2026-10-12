// Typing puts the handle away until the pointer moves deliberately, like the
// rest of the chrome. A CSS state rather than the editor's own hide, because
// the editor re-shows the handle a frame after any mouse move, including
// jitter, and including a move that lands just before the first keystroke.
import type { Editor } from '@tiptap/vue-3';
import { onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { handleIn, isShown, setHandleMeta, type Point } from './handle';
import { isTyping } from './keys';

const JITTER_PX = 4;
// After typing, the handle waits a beat once the pointer moves, then snaps
// back with no fade: the first move after writing is rarely aimed at it.
// The beat matches the chrome's 220ms drift back, so they arrive together.
const RETURN_DELAY_MS = 220;

interface TypingSources {
  readonly editor: () => Editor | undefined;
  readonly root: () => HTMLElement | null;
  readonly pointer: () => Point;
}

export function useTypingHandle(sources: TypingSources) {
  const typing = shallowRef(false);
  let typingFrom: Point = { x: 0, y: 0 };
  let returnTimer: ReturnType<typeof setTimeout> | undefined;

  function onKey(event: KeyboardEvent): void {
    if (!isTyping(event)) return;

    typing.value = true;
    typingFrom = sources.pointer();
    // Typing again cancels a pending return.
    clearTimeout(returnTimer);
    returnTimer = undefined;

    if (isShown(handleIn(sources.root())))
      setHandleMeta(sources.editor(), 'hideDragHandle', true);
  }

  function onPointerMove(event: PointerEvent): void {
    if (!typing.value || returnTimer !== undefined) return;

    const moved = Math.hypot(
      event.clientX - typingFrom.x,
      event.clientY - typingFrom.y
    );

    if (moved <= JITTER_PX) return;

    returnTimer = setTimeout(() => {
      typing.value = false;
      returnTimer = undefined;
    }, RETURN_DELAY_MS);
  }

  onMounted(() =>
    window.addEventListener('pointermove', onPointerMove, { passive: true })
  );

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onPointerMove);
    clearTimeout(returnTimer);
  });

  return { typing, onKey };
}
