<script setup lang="ts">
// Prototype "Inline": no panel. The post's properties live in the document,
// under the title, so everything about the post is visible in one scroll.
import ProtoBody from './ProtoBody.vue';
import ProtoTitle from './ProtoTitle.vue';
import { statusLabel, useProtoPost } from './post';

const post = useProtoPost();
const status = computed(() => statusLabel(post));
const bodyRef = useTemplateRef<InstanceType<typeof ProtoBody>>('bodyRef');
const propertiesOpen = shallowRef(true);

const action = computed(() => {
  const future = post.publishAt.value && Date.parse(post.publishAt.value) > Date.now();

  if (post.status.value === 'draft') return future ? 'Schedule' : 'Publish';
  if (post.status.value === 'scheduled') return 'Publish now';

  return post.hasUnpublishedChanges.value ? 'Publish changes' : null;
});

function runAction(): void {
  void post.publish(action.value === 'Schedule' ? post.publishAt.value : undefined);
}

const menu = computed(() => [[
  { label: 'History', icon: 'i-lucide-history' },
  { label: 'Copy preview link', icon: 'i-lucide-link' },
  ...(post.status.value !== 'draft' ? [{ label: 'Unpublish', icon: 'i-lucide-undo-2', onSelect: post.unpublish }] : [])
], [
  { label: 'Move to trash', icon: 'i-lucide-trash-2', color: 'error' as const }
]]);
</script>

<template>
  <div class="pv">
    <header class="i-bar">
      <nav class="flex min-w-0 items-center gap-1.5 text-[13px]" aria-label="Breadcrumb">
        <button type="button" class="pv-press shrink-0 rounded px-1 text-muted hover:text-highlighted">Blog</button>
        <span class="text-dimmed">/</span>
        <span class="truncate text-highlighted">{{ post.title.value || 'Untitled' }}</span>
      </nav>
      <div class="ml-auto flex shrink-0 items-center gap-1">
        <span class="mr-2 hidden text-xs text-dimmed sm:inline" aria-live="polite">{{ post.saveState.value === 'saving' ? 'Saving…' : 'Saved' }}</span>
        <UDropdownMenu :items="menu" :content="{ align: 'end' }">
          <button type="button" class="pv-btn pv-btn--ghost pv-btn--icon pv-press" aria-label="More actions">
            <UIcon name="i-lucide-ellipsis" class="size-4" />
          </button>
        </UDropdownMenu>
        <button type="button" class="pv-btn pv-btn--ghost pv-press pv-wide">Preview</button>
        <button v-if="action" type="button" class="pv-btn pv-btn--ink pv-press" :disabled="post.publishing.value" @click="runAction">
          {{ post.publishing.value ? 'Publishing…' : action }}
        </button>
      </div>
    </header>

    <main class="mx-auto max-w-[720px] px-6 pb-48 pt-12 sm:pt-16">
      <ProtoTitle v-model="post.title.value" class="i-title" @enter="bodyRef?.focusStart()" />

      <section class="mt-6" aria-label="Properties">
        <dl v-if="propertiesOpen" class="i-props">
          <div class="i-row">
            <dt><UIcon name="i-lucide-circle-dot" />Status</dt>
            <dd class="flex items-center gap-2 px-2 text-highlighted"><span class="pv-dot" :data-tone="status.tone" />{{ status.label }}</dd>
          </div>
          <div class="i-row">
            <dt><UIcon name="i-lucide-link" />URL</dt>
            <dd class="flex items-center px-2"><span class="text-dimmed">/blog/</span><input v-model="post.slug.value" class="i-input min-w-0 flex-1 px-0" spellcheck="false" aria-label="URL slug"></dd>
          </div>
          <div class="i-row">
            <dt><UIcon name="i-lucide-user-round" />Author</dt>
            <dd class="flex items-center gap-2 px-2 text-highlighted">
              <span class="grid size-5 place-items-center rounded-full bg-elevated text-[10px] font-semibold text-muted">AW</span>{{ post.author }}
            </dd>
          </div>
          <div class="i-row">
            <dt><UIcon name="i-lucide-calendar" />Publish date</dt>
            <dd><input v-model="post.publishAt.value" type="datetime-local" class="i-input pv-num" aria-label="Publish date"></dd>
          </div>
          <div class="i-row">
            <dt><UIcon name="i-lucide-tags" />Tags</dt>
            <dd><UInputTags v-model="post.tags.value" variant="none" size="sm" placeholder="Add a tag" aria-label="Tags" class="w-full" /></dd>
          </div>
          <div class="i-row">
            <dt><UIcon name="i-lucide-star" />Featured</dt>
            <dd class="flex items-center px-2"><USwitch v-model="post.featured.value" size="sm" aria-label="Featured" /></dd>
          </div>
          <div class="i-row i-row--top">
            <dt class="pt-[7px]"><UIcon name="i-lucide-align-left" />Excerpt</dt>
            <dd><UTextarea v-model="post.excerpt.value" variant="none" autoresize :rows="1" aria-label="Excerpt" class="w-full" :ui="{ base: 'px-2 py-1.5 text-[13px] leading-relaxed text-highlighted' }" /></dd>
          </div>
        </dl>
        <button type="button" class="pv-press mt-1 flex items-center gap-1 rounded px-1 py-1 text-xs text-dimmed hover:text-muted" :aria-expanded="propertiesOpen" @click="propertiesOpen = !propertiesOpen">
          <UIcon name="i-lucide-chevron-right" class="i-chevron size-3.5" :data-open="propertiesOpen || undefined" />
          {{ propertiesOpen ? 'Hide properties' : '7 properties' }}
        </button>
      </section>

      <hr class="my-8 border-default">
      <ProtoBody ref="bodyRef" v-model="post.body.value" />
    </main>

    <p class="pv-num fixed bottom-4 left-5 hidden text-xs text-dimmed sm:block">{{ post.words.value.toLocaleString() }} words · {{ post.readingMinutes.value }} min read</p>
  </div>
</template>

<style scoped>
.i-bar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  height: 3rem;
  padding: 0 1rem;
  background: color-mix(in oklab, var(--ui-bg) 85%, transparent);
  backdrop-filter: blur(16px) saturate(1.6);
  -webkit-backdrop-filter: blur(16px) saturate(1.6);
}

.i-title {
  font-size: 2.25rem;
  line-height: 1.15;
  letter-spacing: -0.024em;
}

.i-props { display: grid; gap: 1px; }
.i-row {
  display: grid;
  grid-template-columns: 8.5rem minmax(0, 1fr);
  align-items: center;
  min-height: 2.125rem;
  border-radius: 6px;
  font-size: 0.8125rem;
}
.i-row--top { align-items: start; }
@media (max-width: 639px) {
  .i-row { grid-template-columns: 7rem minmax(0, 1fr); }
}
@media (hover: hover) and (pointer: fine) {
  .i-row:hover { background: color-mix(in oklab, var(--ui-bg-elevated) 60%, transparent); }
}
.i-row dt {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-inline: 0.5rem;
  color: var(--ui-text-muted);
}
.i-row dt :deep(svg), .i-row dt > span { width: 0.875rem; height: 0.875rem; flex: none; }
.i-input {
  width: 100%;
  background: transparent;
  padding: 0.375rem 0.5rem;
  color: var(--ui-text-highlighted);
  outline: none;
}

.i-chevron { transition: transform 150ms var(--ease-out); }
.i-chevron[data-open] { transform: rotate(90deg); }
@media (prefers-reduced-motion: reduce) { .i-chevron { transition: none; } }
</style>
