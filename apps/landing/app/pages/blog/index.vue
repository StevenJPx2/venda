<script setup lang="ts">
import type { PostData } from '~/types';

const { data: posts } = await useVendaCollection<PostData>('blog');

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

useSeoMeta({ title: 'Blog — Venda', description: 'Posts written and published with Venda.' });
</script>

<template>
  <UPageSection
    headline="Blog"
    title="Notes from the edge"
    description="Every post here is a published entry in Venda's blog collection."
  >
    <UEmpty
      v-if="!posts.length"
      icon="i-lucide-newspaper"
      title="No posts yet"
      description="Publish an entry in the blog collection and it will appear here."
    />
    <UPageGrid v-else>
      <UPageCard
        v-for="post in posts"
        :key="post.id"
        :to="`/blog/${post.slug}`"
        :title="post.data.title ?? post.slug"
        :description="post.data.excerpt ?? ''"
        spotlight
      >
        <template #footer>
          <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{{ formatDate(post.updatedAt) }}</span>
            <UBadge v-for="tag in post.data.tags ?? []" :key="tag" color="neutral" variant="subtle" size="sm">{{ tag }}</UBadge>
          </div>
        </template>
      </UPageCard>
    </UPageGrid>
  </UPageSection>
</template>
