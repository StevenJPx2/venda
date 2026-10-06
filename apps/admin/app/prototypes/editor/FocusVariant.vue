<script setup lang="ts">
// Prototype "Focus": editorial serif type; the controls fade away while you
// write and return when the pointer moves. From "Quiet": the status line in
// the top bar, the feature image above the title, and a docked settings
// sidebar (⌘.). Publishing is a deliberate two-step confirmation.
import ProtoBody from './ProtoBody.vue';
import ProtoSettingsFields from './ProtoSettingsFields.vue';
import ProtoTitle from './ProtoTitle.vue';
import { statusLabel, useProtoPost } from './post';

const post = useProtoPost();
const status = computed(() => statusLabel(post));
const bodyRef = useTemplateRef<InstanceType<typeof ProtoBody>>('bodyRef');
const publishRef = useTemplateRef<HTMLElement>('publishRef');

const typing = shallowRef(false);
// Open by default wherever it docks beside the text; narrower screens would
// get it on top of the writing. The page renders client-side only, so this is
// the first paint and the panel doesn't slide in on load.
const DOCKED_MIN_WIDTH = 1024;
const panelOpen = shallowRef(
  import.meta.client && window.innerWidth >= DOCKED_MIN_WIDTH
);
// Keyboard toggles are instant: they repeat too often to animate.
const instant = shallowRef(false);
const confirmOpen = shallowRef(false);
const when = shallowRef<'now' | 'later'>('now');
const laterAt = shallowRef('');
const scrolled = shallowRef(false);

const onScroll = () => {
  scrolled.value = window.scrollY > 4;
};

const canPublish = computed(
  () => post.status.value !== 'published' || post.hasUnpublishedChanges.value
);
const publishLabel = computed(() =>
  post.status.value === 'published' ? 'Publish changes' : 'Publish'
);

function togglePanel(fromKeyboard = false): void {
  instant.value = fromKeyboard;
  panelOpen.value = !panelOpen.value;
}

function startTyping(): void {
  if (!confirmOpen.value) typing.value = true;
}

// Ignore sub-pixel jitter: only a deliberate move brings the controls back.
let last: { x: number; y: number } | null = null;

function onPointerMove(event: PointerEvent): void {
  if (last && Math.hypot(event.clientX - last.x, event.clientY - last.y) > 4)
    typing.value = false;

  last = { x: event.clientX, y: event.clientY };
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key === '.') {
    event.preventDefault();
    togglePanel(true);
    return;
  }

  if (event.key !== 'Escape') return;
  if (confirmOpen.value) confirmOpen.value = false;
  else typing.value = false;
}

// The sidebar is a parallel panel and stays open; only the publish popover closes on an outside click.
function onPointerDown(event: PointerEvent): void {
  const target = event.target as Element;

  // Floating content opened from inside the popover (the calendar) renders at the end of <body>.
  if (target.closest?.('[data-reka-popper-content-wrapper]')) return;
  if (
    confirmOpen.value &&
    publishRef.value &&
    !publishRef.value.contains(target)
  )
    confirmOpen.value = false;
}

async function confirm(): Promise<void> {
  confirmOpen.value = false;
  await post.publish(when.value === 'later' ? laterAt.value : undefined);
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('scroll', onScroll, { passive: true });
});
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerdown', onPointerDown);
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div
    class="pv f"
    :data-typing="typing || undefined"
    :data-panel="panelOpen || undefined"
  >
    <header class="f-chrome f-bar" :data-scrolled="scrolled || undefined">
      <button type="button" class="pv-btn pv-btn--ghost pv-press -ml-2">
        <UIcon name="i-lucide-arrow-left" class="size-4" />Posts
      </button>

      <p class="flex min-w-0 items-center gap-2 text-[13px]" aria-live="polite">
        <span class="pv-dot" :data-tone="status.tone" />
        <span class="truncate text-highlighted">{{ status.label }}</span>

        <span class="hidden shrink-0 text-dimmed sm:inline">{{
          post.saveState.value === 'saving' ? 'Saving…' : 'Saved'
        }}</span>
      </p>

      <div class="ml-auto flex shrink-0 items-center gap-1">
        <button type="button" class="pv-btn pv-btn--ghost pv-press pv-wide">
          Preview
        </button>

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

          <div
            class="f-pop"
            :data-open="confirmOpen || undefined"
            :inert="!confirmOpen"
            role="dialog"
            aria-label="Publish"
          >
            <p class="text-[13px] font-semibold text-highlighted">
              Ready to publish?
            </p>

            <p class="mt-1 line-clamp-2 text-xs text-muted">
              “{{ post.title.value || 'Untitled' }}” will be visible on your
              site.
            </p>

            <div class="mt-4 space-y-1">
              <label class="f-option">
                <input
                  v-model="when"
                  type="radio"
                  value="now"
                  class="accent-current"
                />

                <span>Right now</span>
              </label>

              <label class="f-option">
                <input
                  v-model="when"
                  type="radio"
                  value="later"
                  class="accent-current"
                />

                <span>Schedule for later</span>
              </label>

              <VendaDateTimeInput
                v-if="when === 'later'"
                :model-value="laterAt || null"
                future
                aria-label="Publish at"
                class="mt-1"
                @update:model-value="value => (laterAt = value ?? '')"
              />
            </div>

            <div class="mt-4 flex justify-end gap-1">
              <button
                type="button"
                class="pv-btn pv-btn--ghost pv-press"
                @click="confirmOpen = false"
              >
                Cancel
              </button>

              <button
                type="button"
                class="pv-btn pv-btn--ink pv-press"
                :disabled="when === 'later' && !laterAt"
                @click="confirm"
              >
                {{ when === 'later' ? 'Schedule' : publishLabel }}
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          class="pv-btn pv-btn--ghost pv-btn--icon pv-press"
          :aria-pressed="panelOpen"
          aria-label="Post settings (⌘.)"
          title="Post settings (⌘.)"
          @click="togglePanel()"
        >
          <UIcon
            name="i-lucide-panel-right"
            class="size-[18px]"
            :class="panelOpen && 'text-highlighted'"
          />
        </button>
      </div>
    </header>

    <main class="f-main">
      <div class="mx-auto max-w-[680px] px-6 pb-48 pt-[14vh]">
        <figure
          v-if="post.featureImage.value"
          class="group relative mb-12 overflow-hidden rounded-lg"
        >
          <img
            :src="post.featureImage.value"
            alt=""
            class="aspect-[16/9] w-full object-cover"
          />

          <button
            type="button"
            class="f-chrome pv-btn pv-press absolute right-3 top-3 bg-black/60 text-white backdrop-blur"
            @click="post.featureImage.value = null"
          >
            Remove
          </button>
        </figure>

        <button
          v-else
          type="button"
          class="f-chrome pv-btn pv-btn--ghost pv-press -ml-3 mb-4"
          @click="post.pickFeatureImage"
        >
          <UIcon name="i-lucide-image-plus" class="size-4" />Add feature image
        </button>

        <ProtoTitle
          v-model="post.title.value"
          class="f-title"
          @enter="bodyRef?.focusStart()"
          @typing="startTyping"
        />
        <!-- Part of the post, not a control, so it stays while you type. -->
        <p class="mt-4 flex items-center gap-2 text-[13px] text-muted">
          <span
            class="grid size-6 place-items-center rounded-full bg-elevated text-[10px] font-semibold text-muted"
            aria-hidden="true"
            >AW</span
          >

          <span>{{ post.author }}</span>
          <span class="text-dimmed" aria-hidden="true">·</span>

          <span class="pv-num text-dimmed"
            >{{ post.readingMinutes.value }} min read</span
          >
        </p>

        <div class="h-8" />

        <ProtoBody
          ref="bodyRef"
          v-model="post.body.value"
          serif
          @typing="startTyping"
        />
      </div>
    </main>

    <aside
      class="f-panel"
      :data-open="panelOpen || undefined"
      :data-instant="instant || undefined"
      :inert="!panelOpen"
      aria-label="Post settings"
    >
      <div class="flex h-12 shrink-0 items-center justify-between px-5">
        <h2 class="text-[13px] font-semibold text-highlighted">
          Post settings
        </h2>

        <button
          type="button"
          class="pv-btn pv-btn--ghost pv-btn--icon pv-press -mr-2"
          aria-label="Close settings"
          @click="togglePanel()"
        >
          <UIcon name="i-lucide-x" class="size-4" />
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-2">
        <ProtoSettingsFields :post="post" />
      </div>

      <div
        class="flex shrink-0 items-center gap-1 border-t border-default px-3 py-2.5"
      >
        <button type="button" class="pv-btn pv-btn--ghost pv-press">
          <UIcon name="i-lucide-history" class="size-4" />History
        </button>

        <button
          v-if="post.status.value !== 'draft'"
          type="button"
          class="pv-btn pv-btn--ghost pv-press"
          @click="post.unpublish"
        >
          Unpublish
        </button>

        <button type="button" class="pv-btn pv-btn--danger pv-press ml-auto">
          Move to trash
        </button>
      </div>
    </aside>

    <p
      class="f-chrome f-words pv-num fixed bottom-4 left-5 hidden text-xs text-dimmed sm:block"
    >
      {{ post.words.value.toLocaleString() }} words
    </p>
  </div>
</template>

<style scoped>
.f {
  --panel-w: 340px;
  --bar-h: 3.5rem;
}

.f-bar {
  position: fixed;
  inset: 0 0 auto 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  height: var(--bar-h);
  padding: 0 1rem;
  background: color-mix(in oklab, var(--ui-bg) 82%, transparent);
  backdrop-filter: blur(16px) saturate(1.6);
  -webkit-backdrop-filter: blur(16px) saturate(1.6);
}
/* The hairline only appears once text scrolls under the bar. */
.f-bar::after {
  content: '';
  position: absolute;
  inset: auto 0 0 0;
  height: 1px;
  background: var(--ui-border);
  opacity: 0;
  transition: opacity 150ms ease;
}
.f-bar[data-scrolled]::after {
  opacity: 1;
}
@media (prefers-reduced-transparency: reduce) {
  .f-bar {
    background: var(--ui-bg);
    backdrop-filter: none;
  }
}

/* Leaving is ambient (the writer is looking at the text), so it takes its
   time and drifts away from the page; returning answers the pointer, so it
   is quicker, and drifts back along the same path. */
.f-chrome {
  transition:
    opacity 220ms var(--ease-out),
    transform 220ms var(--ease-out);
}
.f[data-typing] .f-chrome {
  opacity: 0;
  pointer-events: none;
  transition-duration: 280ms;
  transition-timing-function: ease;
}
.f[data-typing] .f-bar {
  transform: translateY(-6px);
}
.f[data-typing] .f-words {
  transform: translateY(6px);
}
@media (prefers-reduced-motion: reduce) {
  .f[data-typing] .f-bar,
  .f[data-typing] .f-words {
    transform: none;
  }
}

.f-title {
  font-family:
    Charter, 'Bitstream Charter', 'Iowan Old Style', 'Sitka Text', Cambria,
    Georgia, serif;
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
  box-shadow:
    0 0 0 1px var(--ui-border),
    0 12px 32px -8px rgb(0 0 0 / 0.18),
    0 2px 6px rgb(0 0 0 / 0.06);
  transform-origin: top right;
  opacity: 0;
  transform: scale(0.97);
  pointer-events: none;
  transition:
    opacity 120ms var(--ease-out),
    transform 120ms var(--ease-out);
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
  .f-option:hover {
    background: var(--ui-bg-elevated);
  }
}

/* Floating sidebar (from "Quiet"): a parallel panel, so no scrim. On wide screens
   the text column only moves as far as it must to clear the panel (none at
   1440px); narrower screens get the panel over the text. */
.f-panel {
  position: fixed;
  z-index: 10;
  /* Floats off the bar and the bottom edge, attached to the right edge. */
  top: calc(var(--bar-h) + 0.5rem);
  right: 0;
  bottom: 0.75rem;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  width: min(var(--panel-w), 100vw);
  border: 1px solid var(--ui-border);
  border-right: 0;
  border-radius: 12px 0 0 12px;
  background: color-mix(in oklab, var(--ui-bg) 92%, transparent);
  backdrop-filter: blur(20px) saturate(1.6);
  -webkit-backdrop-filter: blur(20px) saturate(1.6);
  box-shadow:
    -12px 0 32px -16px rgb(0 0 0 / 0.14),
    0 2px 8px -4px rgb(0 0 0 / 0.06);
  /* Past its own width so the shadow leaves with it. */
  transform: translateX(calc(100% + 32px));
  /* Closing is quicker than opening. `translate` (not `transform`) carries the
     typing drift, so it never fights the open/close slide. */
  transition:
    transform 180ms var(--ease-drawer),
    opacity 150ms var(--ease-out),
    translate 150ms var(--ease-out);
}
.f-panel[data-open] {
  transform: translateX(0);
  transition-duration: 240ms, 220ms, 220ms;
}
.f-panel[data-instant] {
  transition: none;
}
/* Fades with the other controls while you write; it stays open, and the text
   column keeps its place, so it returns where you left it. */
.f[data-typing] .f-panel[data-open] {
  opacity: 0;
  translate: 8px 0;
  pointer-events: none;
  transition:
    transform 240ms var(--ease-drawer),
    opacity 280ms ease,
    translate 280ms ease;
}
@media (min-width: 1024px) {
  /* Centred in what's left of the viewport: text column (680) + panel + gutters. */
  .f[data-panel] .f-main {
    padding-right: max(0px, calc(680px + 2 * var(--panel-w) + 48px - 100vw));
  }
}

@media (prefers-reduced-motion: reduce) {
  .f[data-typing] .f-panel[data-open] {
    translate: none;
  }
  .f-pop {
    transform: none;
  }
  .f-panel {
    transform: none;
    opacity: 0;
    transition: opacity 150ms ease;
  }
  .f-panel[data-open] {
    opacity: 1;
  }
}
@media (prefers-reduced-transparency: reduce) {
  .f-panel {
    background: var(--ui-bg);
    backdrop-filter: none;
  }
}
</style>
