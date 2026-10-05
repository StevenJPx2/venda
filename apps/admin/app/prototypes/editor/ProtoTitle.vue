<script setup lang="ts">
// Prototype only: an auto-growing title; Enter moves to the body.
const props = defineProps<{ placeholder?: string }>();
const title = defineModel<string>({ required: true });
const emit = defineEmits<{ enter: []; typing: [] }>();
const el = useTemplateRef<HTMLTextAreaElement>('el');

function fit(): void {
  if (!el.value) return;
  el.value.style.height = '0px';
  el.value.style.height = `${el.value.scrollHeight}px`;
}

watch(title, () => nextTick(fit));
onMounted(() => {
  fit();
  window.addEventListener('resize', fit);
});
onBeforeUnmount(() => window.removeEventListener('resize', fit));

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    emit('enter');
    return;
  }

  if (!event.metaKey && !event.ctrlKey) emit('typing');
}
</script>

<template>
  <textarea
    ref="el"
    v-model="title"
    rows="1"
    class="pv-title"
    :placeholder="props.placeholder ?? 'Post title'"
    aria-label="Title"
    @keydown="onKeydown"
  />
</template>
