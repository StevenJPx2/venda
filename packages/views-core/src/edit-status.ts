// The one status line beside an entry's way back (docs/redesign.md).
import type { IndexedEntry, WorkingCopy } from '@venda/contract';
import { stateLabel } from './text';

export interface EditState {
  readonly loaded: boolean;
  readonly forbidden: boolean;
  readonly elsewhere: boolean;
  readonly saving: boolean;
  readonly changedOutside: boolean;
  readonly dirty: boolean;
  readonly canPublish: boolean;
  /** The file's state, when it is indexed. */
  readonly state: IndexedEntry['state'] | undefined;
}

const fileState = (state: EditState['state']) =>
  stateLabel(state ?? 'published');

interface Flags {
  readonly forbidden: boolean;
  readonly elsewhere: boolean;
  readonly busy: boolean;
}

/** The edit state of a copy as loaded, or of none yet. */
export function editStateOf(
  copy: WorkingCopy | undefined,
  flags: Flags,
  state: EditState['state']
): EditState {
  return {
    loaded: copy !== undefined,
    forbidden: flags.forbidden,
    elsewhere: flags.elsewhere,
    saving: flags.busy,
    changedOutside: copy?.changedOutside === true,
    dirty: copy?.dirty === true,
    canPublish: copy?.canPublish === true,
    state
  };
}

/**
 * Nothing changes without a loaded copy, while an action runs, for someone
 * who may only read it, or once someone else's save made it stale.
 */
export const isReadonly = (loaded: boolean, flags: Flags) =>
  !loaded || Object.values(flags).some(Boolean);

// Checked in order: the first that holds is what the person needs to know.
const RULES: ReadonlyArray<
  [(edit: EditState) => boolean, (edit: EditState) => string]
> = [
  [edit => edit.forbidden, edit => `${fileState(edit.state)} · read-only`],
  [edit => !edit.loaded, () => ''],
  [edit => edit.elsewhere, () => 'Edited elsewhere'],
  [edit => edit.saving, () => 'Saving…'],
  [edit => edit.changedOutside, () => 'Changed outside Venda'],
  [
    edit => edit.dirty,
    edit =>
      edit.canPublish
        ? 'Saved · not published'
        : 'Saved · waiting for an editor'
  ]
];

export function editStatus(edit: EditState): string {
  const rule = RULES.find(([holds]) => holds(edit));

  return rule ? rule[1](edit) : fileState(edit.state);
}
