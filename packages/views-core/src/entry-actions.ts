import type { IndexedEntry } from '@venda/contract';

export interface EntryActionState {
  readonly changed: boolean;
  readonly editable: boolean;
  readonly canPublish: boolean;
  readonly isNew: boolean;
  readonly state: IndexedEntry['state'] | undefined;
}

export type EntryAction = 'discard' | 'unpublish' | 'trash';

/** A contributor may discard their edits, but only a publisher changes file state. */
export function entryActions(state: EntryActionState): EntryAction[] {
  const actions: EntryAction[] = [];

  if (state.changed && state.editable) actions.push('discard');

  if (state.canPublish && !state.isNew) {
    if (state.state !== 'draft') actions.push('unpublish');

    actions.push('trash');
  }

  return actions;
}

/** Clean file drafts publish their file; edited copies publish the saved work. */
export const republishesFile = (state: EntryActionState) =>
  state.canPublish && !state.isNew && !state.changed && state.state === 'draft';
