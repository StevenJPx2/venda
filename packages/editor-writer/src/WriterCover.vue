<script setup lang="ts">
// The feature image above the title. Until the media library arrives it is an
// image address: typed in, shown, changed or removed here.
import { shallowRef } from 'vue';
import { coverAddress } from './cover';

const props = defineProps<{ modelValue: string | null; readonly: boolean }>();

const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>();

const asking = shallowRef(false);
const typed = shallowRef('');
const broken = shallowRef(false);

function ask(): void {
  typed.value = props.modelValue ?? '';
  asking.value = true;
}

function save(): void {
  asking.value = false;
  broken.value = false;
  emit('update:modelValue', coverAddress(typed.value));
}

function remove(): void {
  broken.value = false;
  emit('update:modelValue', null);
}
</script>

<template>
  <div class="writer-cover">
    <form v-if="asking" class="cover-ask" @submit.prevent="save">
      <UInput
        v-model="typed"
        autofocus
        type="url"
        placeholder="https://"
        aria-label="Feature image address"
        class="flex-1"
        @keydown.escape="asking = false"
      />

      <UButton type="submit" label="Use image" />

      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        @click="asking = false"
      />
    </form>

    <figure v-else-if="modelValue" class="cover-frame">
      <img
        v-if="!broken"
        :src="modelValue"
        alt="Feature image"
        class="cover-image"
        @error="broken = true"
      />

      <p v-else class="cover-broken text-sm text-muted">
        The image at {{ modelValue }} could not be loaded.
      </p>

      <div v-if="!readonly" class="cover-actions writer-chrome">
        <UButton
          icon="i-lucide-image"
          label="Change"
          color="neutral"
          variant="soft"
          size="sm"
          @click="ask"
        />

        <UButton
          icon="i-lucide-trash-2"
          label="Remove"
          color="neutral"
          variant="soft"
          size="sm"
          @click="remove"
        />
      </div>
    </figure>

    <UButton
      v-else-if="!readonly"
      icon="i-lucide-image-plus"
      label="Add feature image"
      color="neutral"
      variant="ghost"
      size="sm"
      class="writer-chrome cover-add"
      @click="ask"
    />
  </div>
</template>

<style scoped>
.writer-cover {
  margin-bottom: 1.5rem;
}
.cover-ask {
  display: flex;
  gap: 8px;
}
.cover-frame {
  position: relative;
  margin: 0;
}
.cover-image {
  display: block;
  width: 100%;
  max-height: 420px;
  object-fit: cover;
  border-radius: 8px;
}
.cover-broken {
  padding: 24px;
  border: 1px dashed var(--ui-border);
  border-radius: 8px;
  overflow-wrap: anywhere;
}
.cover-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 6px;
  opacity: 0;
}
.cover-frame:hover .cover-actions,
.cover-frame:focus-within .cover-actions {
  opacity: 1;
}
.cover-broken + .cover-actions {
  position: static;
  margin-top: 8px;
  opacity: 1;
}
.cover-add {
  margin-left: -10px;
}
</style>
