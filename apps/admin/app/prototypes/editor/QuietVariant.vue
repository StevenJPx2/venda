<script setup lang="ts">
// Prototype "Quiet": persistent, minimal chrome; settings in a docked panel
// that sits in the margin on wide screens instead of pushing the text around.
import ProtoBody from './ProtoBody.vue';
import ProtoSettingsFields from './ProtoSettingsFields.vue';
import ProtoTitle from './ProtoTitle.vue';
import { statusLabel, useProtoPost } from './post';

const post = useProtoPost();
const status = computed(() => statusLabel(post));
const bodyRef = useTemplateRef<InstanceType<typeof ProtoBody>>('bodyRef');

const WIDE = 1280;
const panelOpen = shallowRef(false);
// Keyboard toggles are instant: they repeat too often to animate.
const instant = shallowRef(false);
const scrolled = shallowRef(false);

function togglePanel(fromKeyboard = false): void {
  instant.value = fromKeyboard;
  panelOpen.value = !panelOpen.value;
}

const action = computed(() => {
  const future = post.publishAt.value && Date.parse(post.publishAt.value) > Date.now();

  if (post.status.value === 'draft') return future ? 'Schedule' : 'Publish';
  if (post.status.value === 'scheduled') return 'Publish now';

  return post.hasUnpublishedChanges.value ? 'Publish changes' : null;
});

function runAction(): void {
  if (action.value === 'Schedule') void post.publish(post.publishAt.value);
  else void post.publish();
}

function onScroll(): void {
  scrolled.value = window.scrollY > 4;
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key === '.') {
    event.preventDefault();
    togglePanel(true);
  }
}

onMounted(() => {
  panelOpen.value = window.innerWidth >= WIDE;
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="pv q">
    <header class="q-bar" :data-scrolled="scrolled || undefined">
      <button type="button" class="pv-btn pv-btn--ghost pv-press -ml-2">
        <UIcon name="i-lucide-chevron-left" class="size-4" />Posts
      </button>

      <p class="flex min-w-0 items-center gap-2 text-[13px]" aria-live="polite">
        <span class="pv-dot" :data-tone="status.tone" />
        <span class="truncate text-highlighted">{{ status.label }}</span>
        <span class="hidden shrink-0 text-dimmed sm:inline">{{ post.saveState.value === 'saving' ? 'Saving…' : 'Saved' }}</span>
      </p>

      <div class="ml-auto flex shrink-0 items-center gap-1">
        <button type="button" class="pv-btn pv-btn--ghost pv-press pv-wide">Preview</button>

        <button v-if="action" type="button" class="pv-btn pv-btn--ink pv-press min-w-[5.5rem] justify-center" :disabled="post.publishing.value" @click="runAction">
          {{ post.publishing.value ? 'Publishing…' : action }}
        </button>

        <button
          type="button"
          class="pv-btn pv-btn--ghost pv-btn--icon pv-press"
          :aria-pressed="panelOpen"
          aria-label="Post settings (⌘.)"
          title="Post settings (⌘.)"
          @click="togglePanel()"
        >
          <UIcon name="i-lucide-panel-right" class="size-[18px]" :class="panelOpen && 'text-highlighted'" />
        </button>
      </div>
    </header>

    <main class="mx-auto max-w-[680px] px-6 pb-48 pt-14 sm:pt-20">
      <figure v-if="post.featureImage.value" class="group relative mb-10 overflow-hidden rounded-lg">
        <img :src="post.featureImage.value" alt="" class="aspect-[16/9] w-full object-cover">
        <button type="button" class="pv-btn pv-press absolute right-3 top-3 bg-black/60 text-white backdrop-blur" @click="post.featureImage.value = null">Remove</button>
      </figure>

      <button v-else type="button" class="pv-btn pv-btn--ghost pv-press -ml-3 mb-4" @click="post.pickFeatureImage">
        <UIcon name="i-lucide-image-plus" class="size-4" />Add feature image
      </button>

      <ProtoTitle v-model="post.title.value" @enter="bodyRef?.focusStart()" />
      <div class="h-6" />
      <ProtoBody ref="bodyRef" v-model="post.body.value" />
    </main>

    <aside class="q-panel" :data-open="panelOpen || undefined" :data-instant="instant || undefined" :inert="!panelOpen" aria-label="Post settings">
      <div class="flex h-12 shrink-0 items-center justify-between px-5">
        <h2 class="text-[13px] font-semibold text-highlighted">Post settings</h2>

        <button type="button" class="pv-btn pv-btn--ghost pv-btn--icon pv-press -mr-2" aria-label="Close settings" @click="togglePanel()">
          <UIcon name="i-lucide-x" class="size-4" />
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-2">
        <ProtoSettingsFields :post="post" />
      </div>

      <div class="flex shrink-0 items-center gap-1 border-t border-default px-3 py-2.5">
        <button type="button" class="pv-btn pv-btn--ghost pv-press"><UIcon name="i-lucide-history" class="size-4" />History</button>
        <button v-if="post.status.value !== 'draft'" type="button" class="pv-btn pv-btn--ghost pv-press" @click="post.unpublish">Unpublish</button>
        <button type="button" class="pv-btn pv-btn--danger pv-press ml-auto">Move to trash</button>
      </div>
    </aside>

    <p class="pv-num fixed bottom-4 left-5 hidden text-xs text-dimmed sm:block">{{ post.words.value.toLocaleString() }} words</p>
  </div>
</template>

<style scoped>
.q-bar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  height: 3.25rem;
  padding: 0 1rem;
  background: color-mix(in oklab, var(--ui-bg) 82%, transparent);
  backdrop-filter: blur(16px) saturate(1.6);
  -webkit-backdrop-filter: blur(16px) saturate(1.6);
}
/* The hairline only appears once text scrolls under the bar. */
.q-bar::after {
  content: '';
  position: absolute;
  inset: auto 0 0 0;
  height: 1px;
  background: var(--ui-border);
  opacity: 0;
  transition: opacity 150ms ease;
}
.q-bar[data-scrolled]::after { opacity: 1; }

.q-panel {
  position: fixed;
  z-index: 10;
  top: 3.25rem;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  width: min(340px, 100vw);
  border-left: 1px solid var(--ui-border);
  background: color-mix(in oklab, var(--ui-bg) 92%, transparent);
  backdrop-filter: blur(20px) saturate(1.6);
  -webkit-backdrop-filter: blur(20px) saturate(1.6);
  transform: translateX(100%);
  /* Closing is quicker than opening. */
  transition: transform 180ms var(--ease-drawer);
}
.q-panel[data-open] {
  transform: translateX(0);
  transition-duration: 240ms;
}
.q-panel[data-instant] { transition: none; }

@media (prefers-reduced-motion: reduce) {
  .q-panel { transform: none; opacity: 0; transition: opacity 150ms ease; }
  .q-panel[data-open] { opacity: 1; }
}
@media (prefers-reduced-transparency: reduce) {
  .q-bar, .q-panel { background: var(--ui-bg); backdrop-filter: none; }
}
</style>
