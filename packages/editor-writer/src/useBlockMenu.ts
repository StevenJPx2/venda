// The block menu: click the grip to change a block's type, duplicate or
// delete it; drag the grip to move the block. The block it acts on is
// highlighted while it is open.
import type { DropdownMenuItem } from '@nuxt/ui';
import type { Editor } from '@tiptap/vue-3';
import { shallowRef } from 'vue';
import {
  BLOCK_TYPES,
  blockTypeOf,
  deleteBlock,
  duplicateBlock,
  turnInto
} from './blocks';
import { setHandleMeta } from './handle';

// A click on the grip while the menu is open first closes it (a pointer-down
// outside); this long after closing, the same click must not reopen it.
const REOPEN_GUARD_MS = 300;

/** Where the block being acted on sits, relative to the body. */
interface TargetBox {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

interface MenuSources {
  readonly root: () => HTMLElement | null;
  readonly hold: () => void;
  readonly letGo: () => void;
}

function menuFor(editor: Editor, pos: number): DropdownMenuItem[][] {
  const node = editor.state.doc.nodeAt(pos);
  const current = node ? blockTypeOf(node) : null;

  const actions: DropdownMenuItem[] = [
    {
      label: 'Duplicate',
      icon: 'i-lucide-copy',
      onSelect: () => duplicateBlock(editor, pos)
    },
    {
      label: 'Delete',
      icon: 'i-lucide-trash-2',
      color: 'error',
      onSelect: () => deleteBlock(editor, pos)
    }
  ];

  if (!current) return [actions];

  const choices: DropdownMenuItem[] = BLOCK_TYPES.map(block => ({
    type: 'checkbox',
    label: block.label,
    icon: block.icon,
    checked: block.type === current,
    onSelect: () => turnInto(editor, pos, block.type)
  }));

  return [[{ type: 'label', label: 'Turn into' }, ...choices], actions];
}

function boxOf(editor: Editor, pos: number, root: HTMLElement | null) {
  const dom = editor.view.nodeDOM(pos);
  const frame = root?.getBoundingClientRect();

  if (!(dom instanceof HTMLElement) || !frame) return null;

  const box = dom.getBoundingClientRect();

  return {
    top: box.top - frame.top,
    left: box.left - frame.left,
    width: box.width,
    height: box.height
  } satisfies TargetBox;
}

export function useBlockMenu(sources: MenuSources) {
  const hoveredPos = shallowRef<number | null>(null);
  const open = shallowRef(false);
  const items = shallowRef<DropdownMenuItem[][]>([]);
  const target = shallowRef<TargetBox | null>(null);
  let closedAt = 0;

  function show(editor: Editor): void {
    const pos = hoveredPos.value;

    if (pos === null || open.value) return;
    if (performance.now() - closedAt < REOPEN_GUARD_MS) return;

    sources.hold();
    items.value = menuFor(editor, pos);
    target.value = boxOf(editor, pos, sources.root());
    open.value = true;
  }

  function close(editor: Editor): void {
    if (!open.value) return;

    open.value = false;
    closedAt = performance.now();
    target.value = null;
    sources.letGo();
    setHandleMeta(editor, 'hideDragHandle', true);

    if (!editor.view.hasFocus()) editor.view.focus();
  }

  return { hoveredPos, open, items, target, show, close };
}
