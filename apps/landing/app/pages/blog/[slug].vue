<script setup lang="ts">
import type { PostData } from '~/types';

const route = useRoute();
const slug = String(route.params.slug);

const { data: post, error } = await useVendaEntry<PostData>('blog', slug);

if (error.value) {
  throw createError({ statusCode: 502, statusMessage: 'Content is temporarily unavailable', fatal: true });
}
if (!post.value) {
  throw createError({ statusCode: 404, statusMessage: 'Post not found', fatal: true });
}

const title = computed(() => post.value?.data.title ?? slug);
const published = computed(() => post.value ? new Date(post.value.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '');

useSeoMeta({ title: () => `${title.value} — Venda`, description: () => post.value?.data.excerpt ?? '' });
</script>

<template>
  <UContainer v-if="post" class="max-w-3xl py-16 sm:py-24">
    <UButton label="All posts" icon="i-lucide-arrow-left" color="neutral" variant="link" to="/blog" class="-ml-2.5 mb-8" />

    <header class="mb-10 space-y-4">
      <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>{{ published }}</span>
        <UBadge v-for="tag in post.data.tags ?? []" :key="tag" color="primary" variant="subtle" size="sm">{{ tag }}</UBadge>
      </div>
      <h1 class="text-4xl font-bold tracking-tight text-highlighted sm:text-5xl">{{ title }}</h1>
      <p v-if="post.data.excerpt" class="text-lg text-muted">{{ post.data.excerpt }}</p>
    </header>

    <VendaContent v-if="post.data.body" as="article" :html="post.data.body" class="venda-prose" />
    <UEmpty v-else icon="i-lucide-file-text" title="This post has no body yet" />
  </UContainer>
</template>
