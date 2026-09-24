<script setup lang="ts">
import type { FeatureData, HeroData, PostData, StepData } from '~/types';

// All landing copy comes from Venda (via @venda/nuxt): pages/home, features,
// steps and blog. Missing content falls back to sensible defaults.
const [{ data: home }, { data: features }, { data: steps }, { data: posts }] = await Promise.all([
  useVendaEntry<HeroData>('pages', 'home'),
  useVendaCollection<FeatureData>('features', { sortBy: 'order' }),
  useVendaCollection<StepData>('steps', { sortBy: 'order' }),
  useVendaCollection<PostData>('blog', { limit: 3 })
]);

const hero = computed(() => ({
  headline: home.value?.data.headline ?? 'Built entirely on Cloudflare',
  title: home.value?.data.title ?? 'The headless CMS that lives on the edge',
  description: home.value?.data.description ?? 'A Nuxt UI admin with a Workers API, D1 for content, R2 for media, and KV for cache.'
}));

const stackCards = [
  { icon: 'i-lucide-database', label: 'Content', value: 'D1' },
  { icon: 'i-lucide-hard-drive', label: 'Media', value: 'R2' },
  { icon: 'i-lucide-gauge', label: 'Cache', value: 'KV' }
];

function stepTitle(index: number, title: string | undefined): string {
  return `${String(index + 1).padStart(2, '0')} · ${title ?? ''}`;
}

useSeoMeta({ title: 'Venda — a Cloudflare-native headless CMS', description: () => hero.value.description });
</script>

<template>
  <div>
    <UPageHero
      :title="hero.title"
      :description="hero.description"
      class="overflow-hidden"
      :ui="{ title: 'text-4xl sm:text-6xl lg:text-7xl', description: 'max-w-3xl text-lg sm:text-xl' }"
    >
      <template #headline>
        <UBadge color="primary" variant="subtle" size="lg" icon="i-lucide-cloud">{{ hero.headline }}</UBadge>
      </template>
      <template #links>
        <div class="flex flex-wrap justify-center gap-3">
          <UButton label="Open the admin" icon="i-lucide-arrow-right" trailing to="https://app.venda.stevenjohn.co" target="_blank" external size="xl" />
          <UButton label="Read the blog" icon="i-lucide-newspaper" color="neutral" variant="outline" to="/blog" size="xl" />
        </div>
      </template>
      <template #bottom>
        <div class="mx-auto grid w-full max-w-4xl gap-4 sm:grid-cols-3">
          <UPageCard v-for="item in stackCards" :key="item.label" :icon="item.icon" :title="item.value" :description="item.label" spotlight />
        </div>
      </template>
    </UPageHero>

    <UPageSection
      v-if="features.length"
      id="features"
      headline="One platform, one mental model"
      title="Everything a small CMS needs"
      description="A compact vertical slice from authoring to delivery, built from Cloudflare primitives."
    >
      <UPageGrid>
        <UPageCard
          v-for="feature in features"
          :key="feature.id"
          :icon="feature.data.icon ?? 'i-lucide-box'"
          :title="feature.data.title ?? feature.slug"
          :description="feature.data.description ?? ''"
          spotlight
        />
      </UPageGrid>
    </UPageSection>

    <UPageSection
      v-if="steps.length"
      id="how"
      headline="The workflow"
      :title="`From zero to published in ${steps.length} steps`"
      description="The whole loop runs on the same edge platform."
    >
      <UPageGrid :class="steps.length % 4 === 0 ? 'lg:grid-cols-4' : ''">
        <UPageCard
          v-for="(step, index) in steps"
          :key="step.id"
          variant="soft"
          :title="stepTitle(index, step.data.title)"
          :description="step.data.description ?? ''"
        />
      </UPageGrid>
    </UPageSection>

    <UPageSection
      v-if="posts.length"
      id="blog"
      headline="From the blog"
      title="Written in Venda, served by Venda"
      description="These posts are entries in a Venda collection, delivered through the public content API."
    >
      <UPageGrid>
        <UPageCard
          v-for="post in posts"
          :key="post.id"
          :to="`/blog/${post.slug}`"
          icon="i-lucide-newspaper"
          :title="post.data.title ?? post.slug"
          :description="post.data.excerpt ?? ''"
          spotlight
        />
      </UPageGrid>
      <div class="mt-8 flex justify-center">
        <UButton label="All posts" icon="i-lucide-arrow-right" trailing color="neutral" variant="outline" to="/blog" />
      </div>
    </UPageSection>

    <UPageSection
      id="stack"
      headline="Cloudflare-native"
      title="Nothing to provision. Nothing idling."
      description="Venda is a Nuxt app and a Worker, backed by D1, R2, and KV. Deploy it to your own Cloudflare account and it scales to zero when no one is looking."
    >
      <template #links>
        <div class="flex flex-wrap justify-center gap-3">
          <UButton label="Launch the admin" icon="i-lucide-arrow-up-right" to="https://app.venda.stevenjohn.co" target="_blank" external size="lg" />
          <UButton label="Read the API" icon="i-lucide-code-2" color="neutral" variant="outline" to="https://api.venda.stevenjohn.co/api/content/blog" target="_blank" external size="lg" />
        </div>
      </template>
    </UPageSection>
  </div>
</template>
