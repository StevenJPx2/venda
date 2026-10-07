<script setup lang="ts">
import { computed } from 'vue';
import type { Shown } from './slots';

// Says plainly when a collection's chosen view or editor is not installed.
const props = defineProps<{
  shown: Shown;
  part: 'view' | 'editor';
  kind: string;
}>();

const message = computed(() => {
  const { missing, label, component } = props.shown;

  if (missing)
    return label
      ? `This collection asks for the ${props.part} “${missing}”, which is not installed, so ${label} shows it instead.`
      : `This collection asks for the ${props.part} “${missing}”, which is not installed.`;

  return component
    ? ''
    : `No ${props.part} is installed for ${props.kind} collections.`;
});
</script>

<template>
  <p v-if="message" role="status" class="slot-notice">{{ message }}</p>
</template>
