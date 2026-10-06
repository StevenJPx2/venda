<script setup lang="ts">
// Prototype only: entry settings shared by the panel and sheet variants.
import type { ProtoPost } from './post';

const props = defineProps<{ post: ProtoPost }>();
const p = props.post;
const EXCERPT_LIMIT = 300;

// Spaces become hyphens as you type; the full clean-up waits for blur.
function onSlugInput(event: Event): void {
  const input = event.target as HTMLInputElement;
  const { value, caret } = hyphenateSlug(
    input.value,
    input.selectionStart ?? input.value.length
  );
  p.slug.value = value;

  if (input.value !== value) {
    input.value = value;
    input.setSelectionRange(caret, caret);
  }
}

function onSlugBlur(): void {
  p.slug.value = slugify(p.slug.value) || p.slug.value;
}
</script>

<template>
  <div class="space-y-6">
    <label class="block space-y-1.5">
      <span class="pv-label">URL</span>

      <span
        class="flex items-center rounded-md border border-default focus-within:border-inverted"
      >
        <span class="shrink-0 pl-2.5 text-[13px] text-dimmed">/blog/</span>

        <input
          :value="p.slug.value"
          class="min-w-0 flex-1 bg-transparent py-[7px] pr-2.5 text-[13px] text-highlighted outline-none"
          spellcheck="false"
          autocomplete="off"
          aria-label="URL slug"
          @input="onSlugInput"
          @blur="onSlugBlur"
        />
      </span>
    </label>

    <div class="space-y-1.5">
      <span id="publish-date-label" class="pv-label">Publish date</span>

      <VendaDateTimeInput
        :model-value="p.publishAt.value || null"
        future
        aria-label="Publish date"
        @update:model-value="value => (p.publishAt.value = value ?? '')"
      />

      <span class="block text-xs text-muted"
        >Leave empty to publish immediately.</span
      >
    </div>

    <label class="block space-y-1.5">
      <span class="flex items-baseline justify-between">
        <span class="pv-label">Excerpt</span>

        <span class="pv-num text-xs text-dimmed"
          >{{ p.excerpt.value.length }}/{{ EXCERPT_LIMIT }}</span
        >
      </span>

      <textarea
        v-model="p.excerpt.value"
        rows="4"
        :maxlength="EXCERPT_LIMIT"
        class="pv-field resize-none leading-relaxed"
      />
    </label>

    <div class="space-y-1.5">
      <span class="pv-label">Tags</span>

      <UInputTags
        v-model="p.tags.value"
        placeholder="Add a tag"
        class="w-full"
        size="sm"
      />
    </div>

    <div class="space-y-1.5">
      <span class="pv-label">Author</span>

      <p class="flex items-center gap-2 text-[13px] text-highlighted">
        <span
          class="grid size-6 place-items-center rounded-full bg-elevated text-[11px] font-semibold text-muted"
          >AW</span
        >

        <span class="truncate">{{ p.author }}</span>
      </p>
    </div>

    <label class="flex items-center justify-between gap-4">
      <span>
        <span class="block text-[13px] font-medium text-highlighted"
          >Feature this post</span
        >

        <span class="block text-xs text-muted"
          >Pinned to the top of the blog.</span
        >
      </span>

      <USwitch v-model="p.featured.value" size="sm" />
    </label>
  </div>
</template>
