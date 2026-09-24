<script setup lang="ts">
interface Feature {
  icon: string;
  title: string;
  description: string;
}

interface Step {
  number: string;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: 'i-lucide-panels-top-left',
    title: 'Flexible collections',
    description: 'Define collections and store JSON entries, so your content model can evolve without a migration every time.'
  },
  {
    icon: 'i-lucide-zap',
    title: 'Edge-fast delivery',
    description: 'Published content is served from public API routes and cached close to every reader on Cloudflare’s network.'
  },
  {
    icon: 'i-lucide-image',
    title: 'Media on R2',
    description: 'Upload images and files to R2 with no egress fees, then serve them back through the API with the right content type.'
  },
  {
    icon: 'i-lucide-shield-check',
    title: 'Signed sessions',
    description: 'Admin access uses HMAC-signed, KV-backed cookie sessions and can sit behind Cloudflare Access when you want SSO.'
  },
  {
    icon: 'i-lucide-braces',
    title: 'Clean content API',
    description: 'A small, predictable REST surface for collections, entries, and media. Drafts stay private.'
  },
  {
    icon: 'i-lucide-sparkles',
    title: 'Workers AI ready',
    description: 'Add summaries, tags, or alt text later with an optional Workers AI binding and no content model rewrite.'
  }
];

const steps: Step[] = [
  { number: '01', title: 'Sign in', description: 'Log in to the admin with a signed session cookie.' },
  { number: '02', title: 'Create a collection', description: 'Name it, give it a slug, and describe its shape.' },
  { number: '03', title: 'Write entries', description: 'Author, edit, and publish JSON entries with live status.' },
  { number: '04', title: 'Deliver', description: 'Read published content from the cached public API.' }
];
</script>

<template>
  <div class="min-h-svh bg-default">
    <UHeader title="Venda" to="/" :ui="{ title: 'font-bold tracking-tight' }">
      <template #left>
        <NuxtLink to="/" class="flex items-center gap-2 text-highlighted">
          <span class="grid size-7 place-items-center rounded-lg bg-primary text-sm font-bold text-inverted">V</span>
          <span class="font-semibold tracking-tight">Venda</span>
        </NuxtLink>
      </template>
      <template #default>
        <UNavigationMenu :items="[{ label: 'Features', to: '#features' }, { label: 'How it works', to: '#how' }, { label: 'Stack', to: '#stack' }]" />
      </template>
      <template #right>
        <UButton label="Open the app" icon="i-lucide-arrow-up-right" to="https://app.venda.stevenjohn.co" target="_blank" external size="sm" />
      </template>
    </UHeader>

    <main>
      <UPageHero
        title="The headless CMS that lives on the edge"
        description="Venda pairs a Nuxt UI admin with a Workers API, D1 for content, R2 for media, and KV for cache — global by default, with nothing to run."
        class="overflow-hidden"
        :ui="{ title: 'text-4xl sm:text-6xl lg:text-7xl', description: 'max-w-3xl text-lg sm:text-xl' }"
      >
        <template #headline>
          <UBadge color="primary" variant="subtle" size="lg" icon="i-lucide-cloud">Built entirely on Cloudflare</UBadge>
        </template>
        <template #links>
          <div class="flex flex-wrap justify-center gap-3">
            <UButton label="Open the admin" icon="i-lucide-arrow-right" trailing to="https://app.venda.stevenjohn.co" target="_blank" external size="xl" />
            <UButton label="View sample content" icon="i-lucide-braces" color="neutral" variant="outline" to="https://api.venda.stevenjohn.co/api/content/blog" target="_blank" external size="xl" />
          </div>
        </template>
        <template #bottom>
          <div class="mx-auto grid w-full max-w-4xl gap-4 sm:grid-cols-3">
            <UPageCard v-for="item in [{ icon: 'i-lucide-database', label: 'Content', value: 'D1' }, { icon: 'i-lucide-hard-drive', label: 'Media', value: 'R2' }, { icon: 'i-lucide-gauge', label: 'Cache', value: 'KV' }]" :key="item.label" :icon="item.icon" :title="item.value" :description="item.label" spotlight />
          </div>
        </template>
      </UPageHero>

      <UPageSection id="features" headline="One platform, one mental model" title="Everything a small CMS needs" description="A compact vertical slice from authoring to delivery, built from Cloudflare primitives.">
        <UPageGrid>
          <UPageCard v-for="feature in features" :key="feature.title" :icon="feature.icon" :title="feature.title" :description="feature.description" spotlight />
        </UPageGrid>
      </UPageSection>

      <UPageSection id="how" headline="The workflow" title="From zero to published in four steps" description="The whole loop runs on the same edge platform.">
        <UPageGrid>
          <UPageCard v-for="step in steps" :key="step.number" variant="soft" :title="`${step.number} · ${step.title}`" :description="step.description" />
        </UPageGrid>
      </UPageSection>

      <UPageSection id="stack" headline="Cloudflare-native" title="Nothing to provision. Nothing idling." description="Venda is a Nuxt app and a Worker, backed by D1, R2, and KV. Deploy it to your own Cloudflare account and it scales to zero when no one is looking.">
        <template #links>
          <div class="flex flex-wrap justify-center gap-3">
            <UButton label="Launch the admin" icon="i-lucide-arrow-up-right" to="https://app.venda.stevenjohn.co" target="_blank" external size="lg" />
            <UButton label="Read the API" icon="i-lucide-code-2" color="neutral" variant="outline" to="https://api.venda.stevenjohn.co/api/content/blog" target="_blank" external size="lg" />
          </div>
        </template>
      </UPageSection>
    </main>

    <UFooter class="mt-12">
      <template #left>
        <p class="text-sm text-muted">© {{ new Date().getFullYear() }} Venda · content, at the edge.</p>
      </template>
      <template #right>
        <div class="flex items-center gap-3">
          <UButton label="App" color="neutral" variant="link" to="https://app.venda.stevenjohn.co" target="_blank" external />
          <UButton label="API" color="neutral" variant="link" to="https://api.venda.stevenjohn.co/api/content/blog" target="_blank" external />
        </div>
      </template>
    </UFooter>
  </div>
</template>
