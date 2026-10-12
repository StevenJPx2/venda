<script setup lang="ts">
import type { CollectionSummary, IndexedEntry } from '@venda/contract';
import { useAdmin } from '@venda/admin';
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { editStateOf, editStatus } from './edit-status';
import { useEntryEdit } from './entry-edit';
import EntryEditBar from './EntryEditBar.vue';
import EntryEditNotices from './EntryEditNotices.vue';
import { useCollectionSlots } from './slots';
import SlotNotice from './SlotNotice.vue';

// One entry being edited: its status and actions beside the way back, the
// choices an outside change or another person's save leaves, then the editor
// the collection uses. Edits save themselves; Publish writes the file.
const props = defineProps<{
  collection: CollectionSummary;
  slug: string;
  /** The file as indexed, if it has been; read-only people see this. */
  entry: IndexedEntry | undefined;
}>();

const editing = useEntryEdit(
  props.collection.slug,
  props.slug,
  () => props.entry
);
const { copy, action } = editing;
const admin = useAdmin();
const removeGuard = admin.beforeNavigate(editing.flush);
const { editorFor } = useCollectionSlots();
const editor = computed(() => editorFor(props.collection));

const state = computed(() =>
  editStateOf(
    copy.value,
    {
      forbidden: editing.forbidden.value,
      elsewhere: editing.elsewhere.value,
      busy: editing.saving.value || editing.pending.value
    },
    props.entry?.state
  )
);
const changed = computed(() => state.value.dirty || editing.pending.value);
const blocked = computed(() => copy.value?.writable === false);

// Leaving the screen saves what is typed; closing the tab first asks.
const warnUnsaved = (event: BeforeUnloadEvent) => {
  if (editing.pending.value || editing.saving.value) event.preventDefault();
};

// The sidebar steps aside for the writing. A single collection's one entry
// is that collection's own screen, so the sidebar stays beside it.
onMounted(() => {
  admin.writing.value = props.collection.kind !== 'single';
  window.addEventListener('beforeunload', warnUnsaved);
  void action.perform(editing.load);
});

onBeforeUnmount(() => {
  admin.writing.value = false;
  window.removeEventListener('beforeunload', warnUnsaved);
  removeGuard();
  editing.dispose();
});

// The file's state belongs to the screen; after the file changes it reads it again.
const emit = defineEmits<{ fileChanged: [] }>();

const run = (work: () => Promise<void>) => action.perform(work);

const writeFile = (work: () => Promise<void>) =>
  run(async () => {
    await work();
    emit('fileChanged');
  });
</script>

<template>
  <div class="entry-bar">
    <slot name="back" />

    <EntryEditBar
      :status="editStatus(state)"
      :dot="changed ? 'draft' : entry?.state"
      :can-publish="state.canPublish && !editing.readonly.value"
      :changed="changed"
      :blocked="blocked"
      :editable="!editing.readonly.value"
      :is-new="copy?.baseSha === null"
      :busy="action.busy.value"
      :error="action.error.value"
      @publish="writeFile(editing.publish)"
      @discard="writeFile(editing.discard)"
    />
  </div>

  <EntryEditNotices
    :conflict="state.changedOutside && changed"
    :elsewhere="state.elsewhere"
    :unfinished="state.publishing"
    :read-only-server="blocked && changed"
    :index-problem="copy?.indexProblem ?? null"
    :error="action.error.value || editing.error.value"
    @keep-mine="run(editing.keepMine)"
    @discard-mine="writeFile(editing.discard)"
    @reload="run(editing.load)"
    @finish="writeFile(editing.publish)"
  />

  <template v-if="copy || editing.forbidden.value">
    <SlotNotice :shown="editor" part="editor" :kind="collection.kind" />

    <component
      :is="editor.component"
      v-if="editor.component"
      :collection="collection"
      :edit="editing.edit"
    />
  </template>
</template>
