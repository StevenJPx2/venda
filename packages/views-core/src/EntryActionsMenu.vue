<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue';
import {
  entryActions,
  type EntryAction,
  type EntryActionState
} from './entry-actions';

const props = defineProps<
  EntryActionState & { busy: boolean; error: string }
>();
const emit = defineEmits<{ discard: []; unpublish: []; trash: [] }>();
const confirming = shallowRef<EntryAction | null>(null);
const open = computed({
  get: () => confirming.value !== null,
  set: value => {
    if (!value) confirming.value = null;
  }
});
const definitions = computed(() => ({
  discard: {
    label: 'Discard',
    icon: 'i-lucide-undo-2',
    title: props.isNew ? 'Discard this entry?' : 'Discard your changes?',
    description: props.isNew
      ? 'This entry has never been published, so it is removed.'
      : 'Your working copy returns to the file. This cannot be undone.'
  },
  unpublish: {
    label: 'Unpublish',
    icon: 'i-lucide-eye-off',
    title: 'Unpublish this entry?',
    description:
      'It disappears from the public API. Your saved edits stay here.'
  },
  trash: {
    label: 'Move to trash',
    icon: 'i-lucide-trash-2',
    title: 'Move this entry to trash?',
    description:
      'Its file is removed from the site. Saved edits and ownership are kept. You can restore it as a draft.'
  }
}));
const items = computed(() =>
  entryActions(props).map(kind => ({
    label:
      kind === 'discard' ? 'Discard changes' : definitions.value[kind].label,
    icon: definitions.value[kind].icon,
    onSelect: () => {
      confirming.value = kind;
    }
  }))
);
const dialog = computed(() =>
  confirming.value ? definitions.value[confirming.value] : undefined
);
const actions = {
  discard: () => emit('discard'),
  unpublish: () => emit('unpublish'),
  trash: () => emit('trash')
};

function confirm() {
  if (confirming.value) actions[confirming.value]();
}

watch(
  () => props.busy,
  (next, previous) => {
    if (previous && !next && !props.error) confirming.value = null;
  }
);
</script>

<template>
  <UDropdownMenu v-if="items.length" :items="items">
    <UButton
      icon="i-lucide-ellipsis"
      color="neutral"
      variant="ghost"
      aria-label="More actions"
      :disabled="busy"
    />
  </UDropdownMenu>

  <AdminConfirm
    v-if="dialog"
    v-model:open="open"
    :title="dialog.title"
    :description="dialog.description"
    :label="dialog.label"
    :busy="busy"
    :error="error"
    @confirm="confirm"
  />
</template>
