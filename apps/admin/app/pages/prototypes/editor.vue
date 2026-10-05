<script setup lang="ts">
// Prototype harness (development only): flip between editor directions with
// the picker, number keys or ←/→. Delete with app/prototypes once one is chosen.
import FocusVariant from '~/prototypes/editor/FocusVariant.vue';
import InlineVariant from '~/prototypes/editor/InlineVariant.vue';
import QuietVariant from '~/prototypes/editor/QuietVariant.vue';
import '~/prototypes/editor/proto.css';

if (!import.meta.dev) throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true });

const variants = [
  { name: 'Quiet', component: QuietVariant },
  { name: 'Focus', component: FocusVariant },
  { name: 'Inline', component: InlineVariant }
];

const route = useRoute();
const router = useRouter();
const toast = useToast();
const current = shallowRef(Math.min(Math.max((Number(route.query.v) || 1) - 1, 0), variants.length - 1));
const mountKey = shallowRef(0);

const highlightRef = useTemplateRef<HTMLElement>('highlightRef');
const itemRefs = useTemplateRef<HTMLButtonElement[]>('itemRefs');
const ready = shallowRef(false);

function moveHighlight(): void {
  const el = itemRefs.value?.[current.value];
  if (!el || !highlightRef.value) return;
  highlightRef.value.style.width = `${el.offsetWidth}px`;
  highlightRef.value.style.transform = `translateX(${el.offsetLeft}px)`;
}

function setActive(index: number): void {
  if (index < 0 || index >= variants.length) return;
  current.value = index;
  mountKey.value++;
  toast.clear();
  void router.replace({ query: { ...route.query, v: String(index + 1) } });
  void nextTick(moveHighlight);
}

function onKeydown(event: KeyboardEvent): void {
  const target = event.target as HTMLElement;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const num = Number.parseInt(event.key, 10);
  if (num >= 1 && num <= variants.length) setActive(num - 1);
  else if (event.key === 'ArrowRight') setActive((current.value + 1) % variants.length);
  else if (event.key === 'ArrowLeft') setActive((current.value - 1 + variants.length) % variants.length);
}

onMounted(async () => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', moveHighlight);
  await nextTick();
  moveHighlight();
  // Enable the slide only after first paint, so load doesn't animate.
  requestAnimationFrame(() => requestAnimationFrame(() => { ready.value = true; }));
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('resize', moveHighlight);
});

useHead({ title: 'Editor prototypes · Venda' });
</script>

<template>
  <ClientOnly>
    <component :is="variants[current]!.component" :key="`${current}-${mountKey}`" />
    <nav class="proto-picker" aria-label="Prototype variants" :data-ready="ready || undefined">
      <span ref="highlightRef" class="proto-picker-highlight" aria-hidden="true" />
      <button
        v-for="(variant, index) in variants"
        ref="itemRefs"
        :key="variant.name"
        type="button"
        class="proto-picker-item"
        :data-active="index === current || undefined"
        :aria-current="index === current ? 'true' : undefined"
        @click="setActive(index)"
      >
        {{ variant.name }}
      </button>
    </nav>
  </ClientOnly>
</template>

<style>
/* Picker: harness chrome, verbatim from the prototype skill's PICKER.md. */
.proto-picker {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(10, 10, 10, 0.82);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  backdrop-filter: blur(12px) saturate(1.4);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08) inset,
    0 8px 24px rgba(0, 0, 0, 0.24),
    0 2px 6px rgba(0, 0, 0, 0.12);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1;
  -webkit-font-smoothing: antialiased;
  user-select: none;
  -webkit-user-select: none;
}

.proto-picker-highlight {
  position: absolute;
  top: 4px;
  left: 0;
  height: 28px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  will-change: transform;
}

.proto-picker[data-ready] .proto-picker-highlight {
  transition:
    transform 250ms cubic-bezier(0.23, 1, 0.32, 1),
    width 250ms cubic-bezier(0.23, 1, 0.32, 1);
}

@media (prefers-reduced-motion: reduce) {
  .proto-picker[data-ready] .proto-picker-highlight { transition: none; }
}

.proto-picker-item {
  position: relative;
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font: inherit;
  cursor: pointer;
  transition: color 150ms ease-out;
}

.proto-picker-item:hover {
  color: rgba(255, 255, 255, 0.85);
}

.proto-picker-item:active {
  transform: scale(0.97);
}

.proto-picker-item:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.4);
  outline-offset: 2px;
}

.proto-picker-item[data-active] {
  color: #fff;
}
</style>
