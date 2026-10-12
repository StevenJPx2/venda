// Safe triangle (menu aim): while the pointer travels from the text towards
// the "+", the handle stays on its block instead of jumping to whichever
// block a sagging path crosses. pointermove fires before the mousemove the
// drag handle listens to, so a lock set here applies to that same move.
import type { Editor } from '@tiptap/vue-3';
import { onBeforeUnmount, onMounted } from 'vue';
import { handleIn, isShown, setHandleMeta, type Point } from './handle';
import { inTriangle, near, overBody } from './keys';

// Widens the 28px handle so a hand's natural wobble (up to ~17px off the line) still counts as aiming.
const TRIANGLE_SLACK_PX = 12;
const HANDLE_SLACK_PX = 4;
const IDLE_UNLOCK_MS = 300;
// The gutter left of the text, where the handle sits.
const GUTTER_PX = 64;

interface AimSources {
  readonly editor: () => Editor | undefined;
  readonly root: () => HTMLElement | null;
  readonly menuOpen: () => boolean;
}

/** Whether the pointer, moving left from `anchor`, is heading for the handle. */
function aimsAt(pointer: Point, anchor: Point, handle: DOMRect): boolean {
  const top = { x: handle.right, y: handle.top - TRIANGLE_SLACK_PX };
  const bottom = { x: handle.right, y: handle.bottom + TRIANGLE_SLACK_PX };

  return pointer.x < anchor.x && inTriangle(pointer, anchor, top, bottom);
}

// The editor ignored the pointer while locked. Catch up: hide the handle if
// the pointer has left, otherwise let it settle on the block it rests on.
function catchUp(sources: AimSources, pointer: Point): void {
  const box = sources.root()?.getBoundingClientRect();

  if (!box || !overBody(pointer, box, GUTTER_PX)) {
    setHandleMeta(sources.editor(), 'hideDragHandle', true);

    return;
  }

  sources.editor()?.view.dom.dispatchEvent(
    new MouseEvent('mousemove', {
      clientX: pointer.x,
      clientY: pointer.y,
      bubbles: true
    })
  );
}

export function useHandleAim(sources: AimSources) {
  let anchor: Point | null = null;
  let locked = false;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let pointer: Point = { x: 0, y: 0 };

  function setLocked(next: boolean): void {
    if (locked === next) return;

    locked = next;
    setHandleMeta(sources.editor(), 'lockDragHandle', next);
  }

  function stopAiming(): void {
    clearTimeout(idle);
    anchor = null;
  }

  function release(): void {
    stopAiming();

    const wasLocked = locked;

    setLocked(false);

    if (wasLocked) catchUp(sources, pointer);
  }

  function aimAt(handle: DOMRect): void {
    if (anchor && aimsAt(pointer, anchor, handle)) {
      setLocked(true);
      // Resting inside the triangle means the pointer is not heading anywhere: let the handle follow again.
      clearTimeout(idle);
      idle = setTimeout(release, IDLE_UNLOCK_MS);

      return;
    }

    clearTimeout(idle);
    setLocked(false);
    anchor = pointer;
  }

  // A touch or pen, or the menu holding the handle, leaves the handle alone.
  const follows = (event: PointerEvent) =>
    event.pointerType === 'mouse' && !sources.menuOpen();

  // Where the handle is while it shows and the pointer is away from it. A
  // hidden handle has nothing to aim at; over the handle itself the editor does
  // not track the pointer, and a locked handle cannot be dragged.
  function target(): DOMRect | undefined {
    const handle = handleIn(sources.root());
    const box = isShown(handle) ? handle.getBoundingClientRect() : undefined;

    return box && !near(pointer, box, HANDLE_SLACK_PX) ? box : undefined;
  }

  function onPointerMove(event: PointerEvent): void {
    if (!follows(event)) return;

    pointer = { x: event.clientX, y: event.clientY };

    const box = target();

    if (box) {
      aimAt(box);

      return;
    }

    stopAiming();
    setLocked(false);
  }

  /** The block menu holds the handle on its block while it is open. */
  function hold(): void {
    stopAiming();
    locked = true;
    setHandleMeta(sources.editor(), 'lockDragHandle', true);
  }

  function letGo(): void {
    locked = false;
    setHandleMeta(sources.editor(), 'lockDragHandle', false);
  }

  onMounted(() =>
    window.addEventListener('pointermove', onPointerMove, { passive: true })
  );

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onPointerMove);
    clearTimeout(idle);
  });

  return { release, hold, letGo, pointer: () => pointer };
}
