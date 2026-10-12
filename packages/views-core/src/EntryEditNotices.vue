<script setup lang="ts">
// What stands between a person and publishing, each with the way out: an
// outside change, someone else's save, a publish that did not finish, a
// read-only server, a file that no longer fits its collection, or an error.
defineProps<{
  conflict: boolean;
  elsewhere: boolean;
  unfinished: boolean;
  readOnlyServer: boolean;
  indexProblem: string | null;
  error: string;
}>();

const emit = defineEmits<{
  keepMine: [];
  discardMine: [];
  reload: [];
  finish: [];
}>();
</script>

<template>
  <UAlert
    v-if="conflict"
    class="mb-6"
    color="warning"
    variant="subtle"
    icon="i-lucide-git-compare"
    title="The file changed outside Venda"
    description="Someone changed the file after you started. Your changes are kept here; choose which version wins."
    :actions="[
      { label: 'Keep editing mine', onClick: () => emit('keepMine') },
      {
        label: 'Discard mine',
        color: 'neutral',
        variant: 'outline',
        onClick: () => emit('discardMine')
      }
    ]"
  />

  <UAlert
    v-else-if="elsewhere"
    class="mb-6"
    color="warning"
    variant="subtle"
    icon="i-lucide-users"
    title="Someone else saved this entry"
    description="Your last edit was not saved. Load their version to keep editing."
    :actions="[{ label: 'Load their version', onClick: () => emit('reload') }]"
  />

  <UAlert
    v-else-if="unfinished"
    class="mb-6"
    color="warning"
    variant="subtle"
    icon="i-lucide-loader"
    title="Publishing did not finish"
    description="The file may already be written. Finish publishing to bring everything up to date."
    :actions="[{ label: 'Finish publishing', onClick: () => emit('finish') }]"
  />

  <p v-if="readOnlyServer" class="mb-6 text-sm text-muted">
    This server's content is read-only until it is connected to GitHub, so
    changes are saved here but cannot be published yet.
  </p>

  <p v-if="indexProblem" role="alert" class="mb-6 text-sm text-error">
    The published file does not fit the collection: {{ indexProblem }}
  </p>

  <!-- A conflict is already explained above, with its way out. -->
  <p
    v-if="error && !conflict && !elsewhere"
    role="alert"
    class="mb-6 text-sm text-error"
  >
    {{ error }}
  </p>
</template>
