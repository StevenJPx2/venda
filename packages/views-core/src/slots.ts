// Which installed view browses a collection and which editor opens its
// entries (the admin SDK's `choose`), as components ready to render.
import { choose, useAdminRegistry, type CollectionSlot } from '@venda/admin';
import type { CollectionSummary } from '@venda/contract';
import { defineAsyncComponent, type Component } from 'vue';

export interface Shown {
  readonly component: Component | undefined;
  readonly label: string | undefined;
  /** A name the collection's config.ts gave that no installed plugin provides. */
  readonly missing: string | undefined;
}

// One async component per slot, so moving between collections reuses it.
const components = new WeakMap<CollectionSlot, Component>();

function componentOf(slot: CollectionSlot): Component {
  const known = components.get(slot);

  if (known) return known;

  const component = defineAsyncComponent(slot.load);

  components.set(slot, component);

  return component;
}

function shown(
  slots: ReadonlyArray<CollectionSlot>,
  collection: CollectionSummary,
  named: string | null
): Shown {
  const { slot, missing } = choose(slots, collection.kind, named);

  return {
    component: slot ? componentOf(slot) : undefined,
    label: slot?.label,
    missing
  };
}

export function useCollectionSlots() {
  const registry = useAdminRegistry();

  return {
    viewFor: (collection: CollectionSummary) =>
      shown(registry.views, collection, collection.view),
    editorFor: (collection: CollectionSummary) =>
      shown(registry.editors, collection, collection.editor)
  };
}
