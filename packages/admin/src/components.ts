// Plugin contributions as components ready to render, each defined once so
// moving between screens reuses it.
import { defineAsyncComponent, type Component } from 'vue';
import { chooseField } from './plugin';
import { useAdminRegistry } from './runtime';

interface Loadable {
  readonly load: () => Promise<{ default: Component }>;
}

const components = new WeakMap<Loadable, Component>();

/** A view's, editor's or field's component, loaded the first time it shows. */
export function slotComponent(slot: Loadable): Component {
  const known = components.get(slot);

  if (known) return known;

  const component = defineAsyncComponent(slot.load);

  components.set(slot, component);

  return component;
}

/** The input installed for a field type, if any plugin provides one. */
export function useFieldInputs() {
  const registry = useAdminRegistry();

  return (type: string): Component | undefined => {
    const field = chooseField(registry.fields, type);

    return field ? slotComponent(field) : undefined;
  };
}
