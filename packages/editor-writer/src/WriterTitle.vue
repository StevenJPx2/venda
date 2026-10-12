<script setup lang="ts">
// The title grows with its text; Enter moves to the start of the body.
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  useTemplateRef,
  watch
} from 'vue';
import { titleKey } from './keys';

const props = defineProps<{ modelValue: string; readonly: boolean }>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  enter: [];
  typing: [];
}>();

const el = useTemplateRef<HTMLTextAreaElement>('el');

function fit(): void {
  if (!el.value) return;

  el.value.style.height = '0px';
  el.value.style.height = `${el.value.scrollHeight}px`;
}

watch(
  () => props.modelValue,
  () => nextTick(fit)
);

onMounted(() => {
  fit();
  window.addEventListener('resize', fit);
});

onBeforeUnmount(() => window.removeEventListener('resize', fit));

function onKeydown(event: KeyboardEvent): void {
  const meaning = titleKey(event);

  if (meaning === 'typing') emit('typing');

  if (meaning !== 'next') return;

  event.preventDefault();
  emit('enter');
}

function onInput(event: Event): void {
  if (event.target instanceof HTMLTextAreaElement)
    emit('update:modelValue', event.target.value);
}
</script>

<template>
  <textarea
    ref="el"
    :value="modelValue"
    :readonly="readonly"
    rows="1"
    class="writer-title"
    placeholder="Title"
    aria-label="Title"
    @input="onInput"
    @keydown="onKeydown"
  />
</template>

<style scoped>
.writer-title {
  display: block;
  width: 100%;
  resize: none;
  overflow: hidden;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--ui-text-highlighted);
  font-family:
    Charter, 'Bitstream Charter', 'Iowan Old Style', 'Sitka Text', Cambria,
    Georgia, serif;
  font-weight: 700;
  font-size: 2.5rem;
  line-height: 1.15;
  letter-spacing: -0.025em;
  outline: none;
  overflow-wrap: anywhere;
}
.writer-title::placeholder {
  color: var(--ui-text-dimmed);
}
</style>
