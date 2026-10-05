<script setup lang="ts">
// Prototype "Focus": editorial serif type; all chrome fades away while you
// write and returns when the pointer moves. Settings float in a sheet and
// publishing is a deliberate two-step confirmation.
import ProtoBody from './ProtoBody.vue';
import ProtoSettingsFields from './ProtoSettingsFields.vue';
import ProtoTitle from './ProtoTitle.vue';
import { statusLabel, useProtoPost } from './post';

const post = useProtoPost();
const status = computed(() => statusLabel(post));
const bodyRef = useTemplateRef<InstanceType<typeof ProtoBody>>('bodyRef');
const sheetRef = useTemplateRef<HTMLElement>('sheetRef');
const publishRef = useTemplateRef<HTMLElement>('publishRef');

const typing = shallowRef(false);
const sheetOpen = shallowRef(false);
const confirmOpen = shallowRef(false);
const when = shallowRef<'now' | 'later'>('now');
const laterAt = shallowRef('');

const savedAgo = shallowRef('just now');
let clock: ReturnType<typeof setInterval> | undefined;
function tick(): void {
  const seconds = Math.round((Date.now() - post.savedAt.value) / 1000);
  savedAgo.value = seconds < 10 ? 'just now' : seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)}m ago`;
}

const canPublish = computed(() => post.status.value !== 'published' || post.hasUnpublishedChanges.value);
const publishLabel = computed(() => (post.status.value === 'published' ? 'Publish changes' : 'Publish'));

function startTyping(): void {
  if (!sheetOpen.value && !confirmOpen.value) typing.value = true;
}

// Ignore sub-pixel jitter: only a deliberate move brings the chrome back.
let last: { x: number; y: number } | null = null;
function onPointerMove(event: PointerEvent): void {
  if (last && Math.hypot(event.clientX - last.x, event.clientY - last.y) > 4) typing.value = false;
  last = { x: event.clientX, y: event.clientY };
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  if (confirmOpen.value) confirmOpen.value = false;
  else if (sheetOpen.value) sheetOpen.value = false;
  else typing.value = false;
}

function onPointerDown(event: PointerEvent): void {
  const target = event.target as Node;
  if (sheetOpen.value && sheetRef.value && !sheetRef.value.contains(target) && !(target as Element).closest?.('[data-sheet-trigger]')) sheetOpen.value = false;
  if (confirmOpen.value && publishRef.value && !publishRef.value.contains(target)) confirmOpen.value = false;
}

async function confirm(): Promise<void> {
  confirmOpen.value = false;
  await post.publish(when.value === 'later' ? laterAt.value : undefined);
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('keydown', onKeydown);
  clock = setInterval(tick, 5000);
});
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerdown', onPointerDown);
  window.removeEventListener('keydown', onKeydown);
  clearInterval(clock);
});
watch(() => post.savedAt.value, tick);
</script>

<template>
  <div class="pv f" :data-typing="typing || undefined">
    <header class="f-chrome f-bar">
      <button type="button" class="pv-btn pv-btn--ghost pv-press -ml-2">
        <UIcon name="i-lucide-arrow-left" class="size-4" />Posts
      </button>
      <p class="hidden min-w-0 items-center gap-2 text-[13px] text-muted sm:flex" aria-live="polite">
        <span class="pv-dot" :data-tone="status.tone" />
        <span class="truncate">{{ status.label }} — {{ post.saveState.value === 'saving' ? 'saving…' : `saved ${savedAgo}` }}</span>
      </p>
      <div class="ml-auto flex items-center gap-1">
        <button type="button" class="pv-btn pv-btn--ghost pv-press pv-wide">Preview</button>
        <div ref="publishRef" class="relative">
          <button
            type="button"
            class="pv-btn pv-btn--ink pv-press"
            :disabled="!canPublish || post.publishing.value"
            :aria-expanded="confirmOpen"
            @click="confirmOpen = !confirmOpen"
          >
            {{ post.publishing.value ? 'Publishing…' : publishLabel }}
          </button>
          <div class="f-pop" :data-open="confirmOpen || undefined" :inert="!confirmOpen" role="dialog" aria-label="Publish">
            <p class="text-[13px] font-semibold text-highlighted">Ready to publish?</p>
            <p class="mt-1 line-clamp-2 text-xs text-muted">“{{ post.title.value || 'Untitled' }}” will be visible on your site.</p>
            <div class="mt-4 space-y-1">
              <label class="f-option">
                <input v-model="when" type="radio" value="now" class="accent-current">
                <span>Right now</span>
              </label>
              <label class="f-option">
                <input v-model="when" type="radio" value="later" class="accent-current">
                <span>Schedule for later</span>
              </label>
              <input v-if="when === 'later'" v-model="laterAt" type="datetime-local" class="pv-field pv-num mt-1">
            </div>
            <div class="mt-4 flex justify-end gap-1">
              <button type="button" class="pv-btn pv-btn--ghost pv-press" @click="confirmOpen = false">Cancel</button>
              <button type="button" class="pv-btn pv-btn--ink pv-press" :disabled="when === 'later' && !laterAt" @click="confirm">
                {{ when === 'later' ? 'Schedule' : publishLabel }}
              </button>
            </div>
          </div>
        </div>
        <button type="button" data-sheet-trigger class="pv-btn pv-btn--ghost pv-btn--icon pv-press" aria-label="Post settings" :aria-expanded="sheetOpen" @click="sheetOpen = !sheetOpen">
          <UIcon name="i-lucide-sliders-horizontal" class="size-4" />
        </button>
      </div>
    </header>

    <main class="mx-auto max-w-[680px] px-6 pb-48 pt-[16vh]">
      <figure v-if="post.featureImage.value" class="mb-12 overflow-hidden rounded">
        <img :src="post.featureImage.value" alt="" class="aspect-[16/9] w-full object-cover">
      </figure>
      <ProtoTitle v-model="post.title.value" class="f-title" @enter="bodyRef?.focusStart()" @typing="startTyping" />
      <p class="f-chrome mt-4 text-[13px] text-dimmed">
        {{ post.author }} · <span class="pv-num">{{ post.readingMinutes.value }} min read</span>
      </p>
      <div class="h-8" />
      <ProtoBody ref="bodyRef" v-model="post.body.value" serif @typing="startTyping" />
    </main>

    <aside ref="sheetRef" class="f-sheet" :data-open="sheetOpen || undefined" :inert="!sheetOpen" aria-label="Post settings">
      <div class="flex h-12 shrink-0 items-center justify-between px-5">
        <h2 class="text-[13px] font-semibold text-highlighted">Post settings</h2>
        <button type="button" class="pv-btn pv-btn--ghost pv-btn--icon pv-press -mr-2" aria-label="Close settings" @click="sheetOpen = false">
          <UIcon name="i-lucide-x" class="size-4" />
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-1">
        <button v-if="!post.featureImage.value" type="button" class="pv-press mb-6 grid aspect-[16/9] w-full place-items-center rounded-lg border border-dashed border-default text-xs text-muted" @click="post.pickFeatureImage">
          <span class="flex items-center gap-1.5"><UIcon name="i-lucide-image-plus" class="size-4" />Add feature image</span>
        </button>
        <ProtoSettingsFields :post="post" />
      </div>
      <div class="flex shrink-0 items-center gap-1 border-t border-default px-3 py-2.5">
        <button type="button" class="pv-btn pv-btn--ghost pv-press"><UIcon name="i-lucide-history" class="size-4" />History</button>
        <button v-if="post.status.value !== 'draft'" type="button" class="pv-btn pv-btn--ghost pv-press" @click="post.unpublish">Unpublish</button>
        <button type="button" class="pv-btn pv-btn--danger pv-press ml-auto">Move to trash</button>
      </div>
    </aside>

    <p class="f-chrome f-words pv-num fixed bottom-4 left-5 hidden text-xs text-dimmed sm:block">{{ post.words.value.toLocaleString() }} words</p>
  </div>
</template>

<style scoped>
.f-bar {
  position: fixed;
  inset: 0 0 auto 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  height: 3.5rem;
  padding: 0 1rem;
}

/* Leaving is ambient (the writer is looking at the text), so it takes its
   time and drifts away from the page; returning answers the pointer, so it
   is quick. */
.f-chrome {
  transition: opacity 150ms var(--ease-out), transform 150ms var(--ease-out);
}
.f[data-typing] .f-chrome {
  opacity: 0;
  pointer-events: none;
  transition-duration: 280ms;
  transition-timing-function: ease;
}
.f[data-typing] .f-bar { transform: translateY(-6px); }
.f[data-typing] .f-words { transform: translateY(6px); }
@media (prefers-reduced-motion: reduce) {
  .f[data-typing] .f-bar, .f[data-typing] .f-words { transform: none; }
}

.f-title {
  font-family: Charter, 'Bitstream Charter', 'Iowan Old Style', 'Sitka Text', Cambria, Georgia, serif;
  font-size: clamp(2.25rem, 5vw, 3rem);
  line-height: 1.1;
  letter-spacing: -0.02em;
}

/* Scales out of the Publish button it belongs to. */
.f-pop {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 18rem;
  padding: 1rem;
  border-radius: 10px;
  background: var(--ui-bg);
  box-shadow: 0 0 0 1px var(--ui-border), 0 12px 32px -8px rgb(0 0 0 / 0.18), 0 2px 6px rgb(0 0 0 / 0.06);
  transform-origin: top right;
  opacity: 0;
  transform: scale(0.97);
  pointer-events: none;
  transition: opacity 120ms var(--ease-out), transform 120ms var(--ease-out);
}
.f-pop[data-open] {
  opacity: 1;
  transform: scale(1);
  pointer-events: auto;
  transition-duration: 180ms;
}
.f-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  margin-inline: -0.5rem;
  border-radius: 6px;
  font-size: 0.8125rem;
  color: var(--ui-text-highlighted);
  cursor: pointer;
}
@media (hover: hover) and (pointer: fine) {
  .f-option:hover { background: var(--ui-bg-elevated); }
}

/* A parallel panel: floats over the page without a scrim. */
.f-sheet {
  position: fixed;
  z-index: 30;
  /* Below the bar, so the toggle that opened it stays in reach. */
  top: 3.5rem;
  right: 0.75rem;
  bottom: 0.75rem;
  display: flex;
  flex-direction: column;
  width: min(360px, calc(100vw - 1.5rem));
  border-radius: 12px;
  background: color-mix(in oklab, var(--ui-bg) 88%, transparent);
  backdrop-filter: blur(24px) saturate(1.6);
  -webkit-backdrop-filter: blur(24px) saturate(1.6);
  box-shadow: 0 0 0 1px var(--ui-border), 0 24px 48px -12px rgb(0 0 0 / 0.22), 0 4px 12px rgb(0 0 0 / 0.06);
  transform-origin: top right;
  opacity: 0;
  transform: translateX(12px) scale(0.98);
  pointer-events: none;
  transition: opacity 150ms var(--ease-out), transform 150ms var(--ease-out);
}
.f-sheet[data-open] {
  opacity: 1;
  transform: none;
  pointer-events: auto;
  transition-duration: 240ms;
}

@media (prefers-reduced-motion: reduce) {
  .f-pop, .f-sheet { transform: none; }
}
@media (prefers-reduced-transparency: reduce) {
  .f-sheet { background: var(--ui-bg); backdrop-filter: none; }
}
</style>
