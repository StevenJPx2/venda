// The block handle ("+" and grip) as the writer's other parts steer it: the
// drag handle extension reads these transaction metas.
import type { Editor } from '@tiptap/vue-3';

export interface Point {
  readonly x: number;
  readonly y: number;
}

type HandleMeta = 'lockDragHandle' | 'hideDragHandle';

export function setHandleMeta(
  editor: Editor | undefined,
  key: HandleMeta,
  value: boolean
): void {
  if (editor)
    editor.view.dispatch(
      editor.state.tr.setMeta(key, value).setMeta('addToHistory', false)
    );
}

/** The "+" and the grip together, inside the body's root element. */
export const handleIn = (root: HTMLElement | null): HTMLElement | null =>
  root?.querySelector<HTMLElement>('[data-block-handle]') ?? null;

export const isShown = (el: HTMLElement | null): el is HTMLElement =>
  el !== null && getComputedStyle(el).visibility !== 'hidden';
