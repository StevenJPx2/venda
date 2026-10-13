<script setup lang="ts">
import type { ScreenDraft, ScreenMode } from './general';

// One screen's description: its plugin's words, the site's own, or none.
const draft = defineModel<ScreenDraft>({ required: true });

const MODES = [
  { label: 'Default', value: 'default' },
  { label: 'Own words', value: 'own' },
  { label: 'Hidden', value: 'hidden' }
] satisfies ReadonlyArray<{ label: string; value: ScreenMode }>;

// The select hands back one of the values it was given; anything else changes nothing.
function choose(value: string) {
  const picked = MODES.find(mode => mode.value === value);

  if (picked) draft.value = { ...draft.value, mode: picked.value };
}
</script>

<template>
  <UFormField
    :label="draft.title"
    :description="
      draft.stray ? `No installed screen has the id ${draft.id}` : draft.id
    "
  >
    <div class="grid gap-2">
      <USelect
        :model-value="draft.mode"
        :items="MODES"
        :aria-label="`Description of ${draft.title}`"
        class="w-40"
        @update:model-value="value => choose(String(value))"
      />

      <UTextarea
        v-if="draft.mode === 'own'"
        :model-value="draft.text"
        :placeholder="draft.fallback"
        maxlength="300"
        autoresize
        class="w-full"
        @update:model-value="text => (draft = { ...draft, text: String(text) })"
      />

      <p v-else-if="draft.mode === 'default'" class="text-sm text-muted">
        {{ draft.fallback || 'No description' }}
      </p>
    </div>
  </UFormField>
</template>
